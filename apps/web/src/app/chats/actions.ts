"use server";

import { revalidatePath } from "next/cache";

import {
  createChatController,
  createDocumentController,
  createProfileController,
} from "@/lib/dependencies/server";
import {
  documentTitleFromFileName,
  isChatSettingAction,
  parseChatId,
  type ChatActionState,
  type ChatDeleteState,
  type ChatOlderMessages,
  type ChatProfileDetails,
  type ChatReportState,
  type ChatSaveState,
  type ChatSearchResult,
  type ChatSendState,
  type ChatSummary,
  type ChatSyncResult,
} from "@/models/chat/chat.model";

// Server Actions are public entry points, so every action checks the account.
async function isStudent(): Promise<boolean> {
  const profiles = await createProfileController();
  const viewer = await profiles.currentViewer();

  return viewer?.role === "student";
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

export async function sendChatMessageAction(formData: FormData): Promise<ChatSendState> {
  if (!(await isStudent())) {
    return { error: "Your session expired. Sign in and try again." };
  }

  const conversationId = parseChatId(field(formData, "conversationId"));

  if (conversationId === null) {
    return { error: "This chat could not be found." };
  }

  const file = formData.get("file");
  const replyTo = field(formData, "replyToId");
  const documentId = field(formData, "documentId");
  const chats = await createChatController();

  return chats.send({
    conversationId,
    body: field(formData, "body"),
    replyToId: replyTo ? parseChatId(replyTo) : null,
    file: file instanceof File && file.size > 0 ? file : null,
    documentId: documentId ? parseChatId(documentId) : null,
  });
}

export async function deleteChatMessageAction(messageId: number): Promise<ChatDeleteState> {
  const id = parseChatId(messageId);

  if (id === null || !(await isStudent())) {
    return { error: "This message can no longer be deleted." };
  }

  const chats = await createChatController();

  return chats.deleteMessage(id);
}

/** Copies a chat attachment into the student's own My Documents. */
export async function saveChatAttachmentToDocumentsAction(
  messageId: number,
): Promise<ChatSaveState> {
  const id = parseChatId(messageId);
  const profiles = await createProfileController();
  const viewer = await profiles.currentViewer();

  if (id === null || viewer?.role !== "student") {
    return { error: "This file could not be saved." };
  }

  try {
    const chats = await createChatController();
    const attachment = await chats.attachmentFile(id);

    if ("error" in attachment) {
      return { error: attachment.error };
    }

    const documents = await createDocumentController();
    const state = await documents.upload({
      ownerId: viewer.id,
      title: documentTitleFromFileName(attachment.file.name),
      file: attachment.file,
    });

    if (state.error) {
      return { error: state.error };
    }

    revalidatePath("/documents");
    revalidatePath("/documents/manage");

    return { notice: `${attachment.file.name} was saved to My Documents.` };
  } catch (error) {
    console.error("Saving chat attachment to documents failed.", error);
    return { error: "This file could not be saved. Please try again." };
  }
}

export async function syncChatAction(
  conversationId: number,
  afterId: number,
  markRead: boolean,
): Promise<ChatSyncResult | null> {
  const id = parseChatId(conversationId);
  const after = Number.isSafeInteger(afterId) && afterId >= 0 ? afterId : 0;

  if (id === null || !(await isStudent())) {
    return null;
  }

  const chats = await createChatController();

  try {
    return await chats.sync(id, after, markRead === true);
  } catch (error) {
    console.error("Chat sync failed.", error);
    return null;
  }
}

export async function loadOlderChatMessagesAction(
  conversationId: number,
  beforeId: number,
): Promise<ChatOlderMessages | null> {
  const id = parseChatId(conversationId);
  const before = parseChatId(beforeId);

  if (id === null || before === null || !(await isStudent())) {
    return null;
  }

  const chats = await createChatController();

  try {
    return await chats.loadOlder(id, before);
  } catch (error) {
    console.error("Loading older chat messages failed.", error);
    return null;
  }
}

export async function chatSettingAction(
  conversationId: number,
  action: string,
): Promise<ChatActionState> {
  const id = parseChatId(conversationId);

  if (id === null || !isChatSettingAction(action) || !(await isStudent())) {
    return { error: "This chat could not be updated." };
  }

  const chats = await createChatController();

  return chats.applySetting(id, action);
}

export async function reportChatAction(
  conversationId: number,
  reason: string,
  details: string,
  block: boolean,
): Promise<ChatReportState> {
  const id = parseChatId(conversationId);

  if (id === null || !(await isStudent())) {
    return { error: "This chat could not be reported." };
  }

  const chats = await createChatController();

  return chats.report({
    conversationId: id,
    reason: typeof reason === "string" ? reason : "",
    details: typeof details === "string" ? details : "",
    block: block === true,
  });
}

export async function loadChatDetailsAction(
  conversationId: number,
): Promise<ChatProfileDetails | null> {
  const id = parseChatId(conversationId);

  if (id === null || !(await isStudent())) {
    return null;
  }

  const chats = await createChatController();

  try {
    return await chats.details(id);
  } catch (error) {
    console.error("Loading chat details failed.", error);
    return null;
  }
}

export async function searchChatAction(
  conversationId: number,
  query: string,
): Promise<ChatSearchResult[] | null> {
  const id = parseChatId(conversationId);

  if (id === null || typeof query !== "string" || !(await isStudent())) {
    return null;
  }

  const chats = await createChatController();

  try {
    return await chats.search(id, query);
  } catch (error) {
    console.error("Chat search failed.", error);
    return null;
  }
}

export async function loadChatMessagesFromAction(
  conversationId: number,
  messageId: number,
): Promise<ChatOlderMessages | null> {
  const id = parseChatId(conversationId);
  const from = parseChatId(messageId);

  if (id === null || from === null || !(await isStudent())) {
    return null;
  }

  const chats = await createChatController();

  try {
    return await chats.loadFrom(id, from);
  } catch (error) {
    console.error("Loading chat messages failed.", error);
    return null;
  }
}

export async function refreshChatListAction(): Promise<ChatSummary[] | null> {
  if (!(await isStudent())) {
    return null;
  }

  const chats = await createChatController();

  try {
    return await chats.listConversations();
  } catch (error) {
    console.error("Chat list refresh failed.", error);
    return null;
  }
}
