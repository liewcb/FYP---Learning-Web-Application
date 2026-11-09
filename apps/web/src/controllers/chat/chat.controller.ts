import type { ChatGroupRepository } from "@/interfaces/repositories/chat-group.repository";
import type { ChatRepository } from "@/interfaces/repositories/chat.repository";
import type { DocumentRepository } from "@/interfaces/repositories/document.repository";
import type { StudyBuddyRepository } from "@/interfaces/repositories/study-buddy.repository";
import type { ChatAttachmentStorage } from "@/interfaces/services/chat-attachment-storage.interface";
import {
  academicLine,
  attachmentKind,
  canSaveToDocuments,
  chatPinLimit,
  chatReportDetailsMaxLength,
  chatRules,
  chatSearchRules,
  isChatReportReason,
  isListedChat,
  normaliseChatBody,
  sendOutcomeError,
  validateChatUpload,
  type ActiveChat,
  type ChatActionState,
  type ChatContact,
  type ChatDeleteState,
  type ChatGroupInvite,
  type ChatListRefresh,
  type ChatMessage,
  type ChatMessageRecord,
  type ChatOlderMessages,
  type ChatPageModel,
  type ChatProfileDetails,
  type ChatReportState,
  type ChatSearchResult,
  type ChatSendOutcome,
  type ChatSendState,
  type ChatSettingAction,
  type ChatSummary,
  type ChatSyncResult,
  type SendChatMessageInput,
  type ShareableDocument,
} from "@/models/chat/chat.model";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const maxAttachmentNameLength = 255;
const maxSyncMessages = 100;
const maxJumpMessages = 500;
const maxSharedFiles = 60;

export interface SendChatInput {
  readonly conversationId: number;
  readonly body: string;
  readonly replyToId: number | null;
  readonly file: File | null;
  readonly documentId: number | null;
}

function isUnread(message: ChatMessageRecord, summary: ChatSummary, viewerId: string): boolean {
  return (
    message.senderId !== viewerId &&
    message.event === null &&
    message.deletedAt === null &&
    (summary.myLastReadAt === null ||
      Date.parse(message.createdAt) > Date.parse(summary.myLastReadAt))
  );
}

/** Why a chat refuses new messages, for the send error. */
function readOnlyOutcome(summary: ChatSummary): ChatSendOutcome {
  if (!summary.group) {
    return "not_buddies";
  }

  return summary.group.leftReason === null && summary.group.disbanded ? "closed" : "not_member";
}

/** An invitation list that failed to load should not break the chat page. */
async function invitesOrEmpty(load: Promise<ChatGroupInvite[]>): Promise<ChatGroupInvite[]> {
  return load.catch((error: unknown) => {
    console.error("Loading group invitations failed.", error);
    return [];
  });
}

function attachmentName(fileName: string): string {
  // Keep the end so the extension survives.
  return fileName.trim().slice(-maxAttachmentNameLength) || "attachment";
}

export class ChatController {
  constructor(
    private readonly chats: ChatRepository,
    private readonly storage: ChatAttachmentStorage,
    private readonly buddies: StudyBuddyRepository,
    private readonly documents: DocumentRepository,
    private readonly groups: ChatGroupRepository,
  ) {}

  /** Conversation id for chatting with a study buddy, or null. */
  async openWith(studentId: string): Promise<number | null> {
    if (!uuidPattern.test(studentId)) {
      return null;
    }

    return this.chats.openDirectChat(studentId);
  }

  async loadPage(input: {
    readonly viewerId: string;
    readonly conversationId: number | null;
  }): Promise<ChatPageModel> {
    const [conversations, connections, documents, invites] = await Promise.all([
      this.chats.listConversations(),
      this.buddies.listConnections(),
      this.documents.listForCurrentUser(),
      invitesOrEmpty(this.groups.listInvites()),
    ]);

    let active: ActiveChat | null = null;
    let notice: string | null = null;

    if (input.conversationId !== null) {
      const summary =
        conversations.find((chat) => chat.id === input.conversationId) ??
        (await this.chats.findConversation(input.conversationId));

      if (summary) {
        active = await this.loadActive(summary, input.viewerId);
      } else {
        notice = "This chat could not be found.";
      }
    }

    const contacts: ChatContact[] = connections
      .filter((buddy) => buddy.connectionStatus === "accepted")
      .map((buddy) => ({
        id: buddy.id,
        fullName: buddy.fullName,
        username: buddy.username,
        initials: buddy.initials,
        academicLine: academicLine(buddy.academicMajor, buddy.yearOfStudy),
      }));

    const shareable: ShareableDocument[] = documents.map((document) => ({
      id: document.id,
      title: document.title,
      fileName: document.fileName,
      mimeType: document.data.mimeType,
      sizeBytes: document.data.sizeBytes,
    }));

    return {
      viewerId: input.viewerId,
      generatedAt: new Date().toISOString(),
      conversations: conversations
        .filter((chat) => isListedChat(chat) || chat.id === active?.summary.id)
        .map((chat) => (chat.id === active?.summary.id ? active.summary : chat)),
      invites,
      active,
      contacts,
      documents: shareable,
      notice,
    };
  }

  /** The chat list and open group invitations, for the periodic refresh. */
  async refreshList(): Promise<ChatListRefresh> {
    const [conversations, invites] = await Promise.all([
      this.chats.listConversations(),
      invitesOrEmpty(this.groups.listInvites()),
    ]);

    return { conversations: conversations.filter(isListedChat), invites };
  }

  /** New messages after `afterId` and the latest receipts for an open chat. */
  async sync(
    conversationId: number,
    afterId: number,
    markRead: boolean,
  ): Promise<ChatSyncResult | null> {
    if (markRead) {
      await this.chats.markRead(conversationId);
    }

    const summary = await this.chats.findConversation(conversationId);

    if (!summary) {
      return null;
    }

    const records = await this.chats.listMessages(conversationId, {
      afterId,
      limit: maxSyncMessages,
      clearedAt: summary.clearedAt,
    });

    return { summary, messages: await this.present(records.reverse()) };
  }

  async loadOlder(conversationId: number, beforeId: number): Promise<ChatOlderMessages | null> {
    const summary = await this.chats.findConversation(conversationId);

    if (!summary) {
      return null;
    }

    const records = await this.chats.listMessages(conversationId, {
      beforeId,
      limit: chatRules.pageSize + 1,
      clearedAt: summary.clearedAt,
    });

    return {
      messages: await this.present(records.slice(0, chatRules.pageSize).reverse()),
      hasMore: records.length > chatRules.pageSize,
    };
  }

  /** A search result and everything after it, so the chat can scroll to it. */
  async loadFrom(conversationId: number, messageId: number): Promise<ChatOlderMessages | null> {
    const summary = await this.chats.findConversation(conversationId);

    if (!summary) {
      return null;
    }

    const [records, earlier] = await Promise.all([
      this.chats.listMessages(conversationId, {
        fromId: messageId,
        limit: maxJumpMessages,
        clearedAt: summary.clearedAt,
      }),
      this.chats.listMessages(conversationId, {
        beforeId: messageId,
        limit: 1,
        clearedAt: summary.clearedAt,
      }),
    ]);

    return { messages: await this.present(records.reverse()), hasMore: earlier.length > 0 };
  }

  async search(conversationId: number, rawQuery: string): Promise<ChatSearchResult[] | null> {
    const query = rawQuery.trim().slice(0, chatSearchRules.maxLength);

    if (query.length < chatSearchRules.minLength) {
      return [];
    }

    const summary = await this.chats.findConversation(conversationId);

    if (!summary) {
      return null;
    }

    return this.chats.searchMessages(conversationId, query, {
      limit: chatSearchRules.maxResults,
      clearedAt: summary.clearedAt,
    });
  }

  /** Bio, interests and shared files for the contact-info panel. */
  async details(conversationId: number): Promise<ChatProfileDetails | null> {
    const summary = await this.chats.findConversation(conversationId);

    if (!summary) {
      return null;
    }

    const [profile, records] = await Promise.all([
      // Groups have no single profile; their members come from listMembers.
      summary.group ? null : this.chats.findProfile(conversationId),
      this.chats.listAttachments(conversationId, {
        limit: maxSharedFiles,
        clearedAt: summary.clearedAt,
      }),
    ]);
    const messages = await this.present(records);

    return {
      bio: profile?.bio ?? null,
      interests: profile?.interests ?? [],
      memberSince: profile?.memberSince ?? null,
      files: messages.flatMap((message) =>
        message.attachment
          ? [
              {
                messageId: message.id,
                senderId: message.senderId,
                createdAt: message.createdAt,
                attachment: message.attachment,
              },
            ]
          : [],
      ),
    };
  }

  async applySetting(conversationId: number, action: ChatSettingAction): Promise<ChatActionState> {
    try {
      const result = await this.chats.applySetting(conversationId, action);

      if (result === "limit") {
        return { error: `You can pin up to ${chatPinLimit} chats.` };
      }

      if (result === "not_found" || result === "unauthenticated") {
        return { error: "This chat could not be updated." };
      }

      return {};
    } catch (error) {
      console.error("Chat setting failed.", error);
      return { error: "This chat could not be updated. Please try again." };
    }
  }

  async report(input: {
    readonly conversationId: number;
    readonly reason: string;
    readonly details: string;
    readonly block: boolean;
  }): Promise<ChatReportState> {
    const details = input.details.trim();

    if (!isChatReportReason(input.reason)) {
      return { error: "Choose a reason for the report." };
    }

    if (details.length > chatReportDetailsMaxLength) {
      return { error: `Keep the details under ${chatReportDetailsMaxLength} characters.` };
    }

    try {
      const outcome = await this.chats.report({
        conversationId: input.conversationId,
        reason: input.reason,
        details: details || null,
        block: input.block,
      });

      switch (outcome) {
        case "reported":
          return { notice: "Thanks. Your report was sent to the moderators." };
        case "duplicate":
          return { notice: "You already reported this chat today. Moderators will review it." };
        case "invalid":
          return { error: "Choose a reason for the report." };
        default:
          return { error: "This chat could not be reported." };
      }
    } catch (error) {
      console.error("Chat report failed.", error);
      return { error: "The report could not be sent. Please try again." };
    }
  }

  async send(input: SendChatInput): Promise<ChatSendState> {
    const body = normaliseChatBody(input.body);

    if (body.length > chatRules.maxBodyLength) {
      return { error: sendOutcomeError("too_long")! };
    }

    if (!body && !input.file && input.documentId === null) {
      return { error: sendOutcomeError("empty")! };
    }

    if (input.file && input.documentId !== null) {
      return { error: "Attach one file at a time." };
    }

    if (input.file) {
      const uploadError = validateChatUpload(input.file);

      if (uploadError) {
        return { error: uploadError };
      }
    }

    try {
      // Check first so a refused message does not leave an uploaded file behind.
      const summary = await this.chats.findConversation(input.conversationId);

      if (!summary) {
        return { error: sendOutcomeError("not_found")! };
      }

      if (!summary.canSend) {
        return { error: sendOutcomeError(readOnlyOutcome(summary))! };
      }

      const attachment = await this.storeAttachment(input);

      if (attachment === undefined) {
        return { error: "That document could not be found in My Documents." };
      }

      const result = await this.sendRecord({
        conversationId: input.conversationId,
        body,
        replyToId: input.replyToId,
        attachment,
      });

      return result;
    } catch (error) {
      console.error("Chat message failed.", error);
      return { error: "Your message could not be sent. Please try again." };
    }
  }

  async deleteMessage(messageId: number): Promise<ChatDeleteState> {
    try {
      const result = await this.chats.deleteMessage(messageId);

      if (result.outcome !== "deleted") {
        return { error: "This message can no longer be deleted." };
      }

      if (result.removedPath) {
        await this.storage.remove([result.removedPath]).catch((error: unknown) => {
          console.error("Deleted chat attachment cleanup failed.", error);
        });
      }

      return {};
    } catch (error) {
      console.error("Chat message deletion failed.", error);
      return { error: "The message could not be deleted. Please try again." };
    }
  }

  /** Unread chats for the navigation badge; also records presence. */
  async syncInbox(): Promise<number> {
    return this.chats.syncInbox();
  }

  /**
   * The attachment as a File, ready for DocumentController.upload so a saved
   * document gets the same checks and text extraction as a normal upload.
   */
  async attachmentFile(
    messageId: number,
  ): Promise<{ readonly file: File } | { readonly error: string }> {
    // Row-level security returns the message only to conversation members.
    const message = await this.chats.findMessage(messageId);

    if (!message?.attachment) {
      return { error: "This file is no longer available." };
    }

    if (!canSaveToDocuments(message.attachment.mimeType)) {
      return { error: "Only PDF and DOCX files can be saved to My Documents." };
    }

    const body = await this.storage.download(message.attachment.path);

    return {
      file: new File([body], message.attachment.name, { type: message.attachment.mimeType }),
    };
  }

  async attachmentDownloadUrl(messageId: number): Promise<string | null> {
    // Row-level security returns the message only to conversation members.
    const message = await this.chats.findMessage(messageId);

    if (!message?.attachment) {
      return null;
    }

    return this.storage.createDownloadUrl(message.attachment.path, message.attachment.name);
  }

  private async loadActive(summary: ChatSummary, viewerId: string): Promise<ActiveChat> {
    const [records, members] = await Promise.all([
      this.chats.listMessages(summary.id, {
        limit: chatRules.pageSize + 1,
        clearedAt: summary.clearedAt,
      }),
      summary.group ? this.groups.listMembers(summary.id) : [],
    ]);
    const page = records.slice(0, chatRules.pageSize).reverse();
    const firstUnread = page.find((message) => isUnread(message, summary, viewerId));

    if (summary.unreadCount > 0) {
      await this.chats.markRead(summary.id).catch((error: unknown) => {
        console.error("Marking chat as read failed.", error);
      });
    }

    return {
      summary: { ...summary, unreadCount: 0 },
      messages: await this.present(page),
      hasMore: records.length > chatRules.pageSize,
      firstUnreadId: firstUnread?.id ?? null,
      members,
    };
  }

  /**
   * Uploads or copies the attachment. Returns null when there is none and
   * undefined when the chosen document does not exist.
   */
  private async storeAttachment(
    input: SendChatInput,
  ): Promise<SendChatMessageInput["attachment"] | undefined> {
    if (input.file) {
      const stored = await this.storage.upload({
        conversationId: input.conversationId,
        fileName: input.file.name,
        mimeType: input.file.type,
        body: input.file,
      });

      return {
        path: stored.path,
        name: attachmentName(input.file.name),
        mimeType: input.file.type,
        sizeBytes: input.file.size,
      };
    }

    if (input.documentId === null) {
      return null;
    }

    // Row-level security returns only the student's own documents.
    const document = await this.documents.findById(input.documentId);

    if (!document) {
      return undefined;
    }

    const stored = await this.storage.copyFromDocument({
      conversationId: input.conversationId,
      sourcePath: document.storagePath,
      fileName: document.fileName,
      mimeType: document.data.mimeType,
    });

    return {
      path: stored.path,
      name: attachmentName(document.fileName),
      mimeType: document.data.mimeType,
      sizeBytes: document.data.sizeBytes,
    };
  }

  private async sendRecord(input: SendChatMessageInput): Promise<ChatSendState> {
    const cleanUp = async () => {
      if (input.attachment) {
        await this.storage.remove([input.attachment.path]).catch((error: unknown) => {
          console.error("Unsent chat attachment cleanup failed.", error);
        });
      }
    };

    try {
      const result = await this.chats.sendMessage(input);
      const error = sendOutcomeError(result.outcome);

      if (error || result.messageId === null) {
        await cleanUp();
        return { error: error ?? "Your message could not be sent. Please try again." };
      }

      const record = await this.chats.findMessage(result.messageId);
      const [message] = record ? await this.present([record]) : [];

      return { message };
    } catch (error) {
      await cleanUp();
      throw error;
    }
  }

  /** Strips storage paths and signs image previews. */
  private async present(records: readonly ChatMessageRecord[]): Promise<ChatMessage[]> {
    return Promise.all(
      records.map(async (record) => {
        if (!record.attachment) {
          return { ...record, attachment: null };
        }

        const { path, ...attachment } = record.attachment;
        let previewUrl: string | null = null;

        if (attachmentKind(attachment.mimeType) === "image") {
          previewUrl = await this.storage.createPreviewUrl(path).catch((error: unknown) => {
            console.error("Chat image signing failed.", error);
            return null;
          });
        }

        return { ...record, attachment: { ...attachment, previewUrl } };
      }),
    );
  }
}
