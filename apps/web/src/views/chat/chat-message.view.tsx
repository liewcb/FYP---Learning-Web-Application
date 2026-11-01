import {
  formatChatTime,
  replyPreviewText,
  type ChatMessage,
  type ChatReplyPreview,
  type TickStatus,
} from "@/models/chat/chat.model";
import {
  ChatAttachmentView,
  type AttachmentSaveState,
} from "@/views/chat/chat-attachment.view";
import { ReplyIcon, TickIcon, TrashIcon } from "@/views/chat/chat-icons.view";

interface ChatMessageBubbleProps {
  readonly message: ChatMessage;
  readonly mine: boolean;
  /** Ticks for the viewer's own messages. */
  readonly tick: TickStatus | null;
  /** First message in a run from the same sender gets the bubble tail. */
  readonly startsGroup: boolean;
  readonly highlighted: boolean;
  readonly viewerId: string;
  readonly otherName: string;
  readonly canAct: boolean;
  readonly saveState: AttachmentSaveState;
  readonly onReply: (message: ChatMessage) => void;
  readonly onDelete: (message: ChatMessage) => void;
  readonly onJumpTo: (messageId: number) => void;
  readonly onSaveToDocuments: (message: ChatMessage) => void;
}

function ReplyQuote({
  reply,
  viewerId,
  otherName,
  onJumpTo,
}: {
  readonly reply: ChatReplyPreview;
  readonly viewerId: string;
  readonly otherName: string;
  readonly onJumpTo: (messageId: number) => void;
}) {
  return (
    <button className="chat-quote" type="button" onClick={() => onJumpTo(reply.id)}>
      <span className="chat-quote-name">{reply.senderId === viewerId ? "You" : otherName}</span>
      <span className={reply.deleted ? "chat-quote-text deleted" : "chat-quote-text"}>
        {replyPreviewText(reply)}
      </span>
    </button>
  );
}

export function ChatMessageBubble({
  message,
  mine,
  tick,
  startsGroup,
  highlighted,
  viewerId,
  otherName,
  canAct,
  saveState,
  onReply,
  onDelete,
  onJumpTo,
  onSaveToDocuments,
}: ChatMessageBubbleProps) {
  const deleted = message.deletedAt !== null;
  const classes = [
    "chat-message",
    mine ? "mine" : "theirs",
    startsGroup ? "starts-group" : null,
    highlighted ? "highlighted" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li className={classes} id={`chat-message-${message.id}`}>
      <div className={deleted ? "chat-bubble deleted" : "chat-bubble"}>
        <span className="visually-hidden">{mine ? "You:" : `${otherName}:`}</span>
        {deleted ? (
          <span className="chat-deleted-text">
            {mine ? "You deleted this message" : "This message was deleted"}
          </span>
        ) : (
          <>
            {message.replyTo ? (
              <ReplyQuote
                reply={message.replyTo}
                viewerId={viewerId}
                otherName={otherName}
                onJumpTo={onJumpTo}
              />
            ) : null}
            {message.attachment ? (
              <ChatAttachmentView
                messageId={message.id}
                attachment={message.attachment}
                saveState={saveState}
                onSaveToDocuments={() => onSaveToDocuments(message)}
              />
            ) : null}
            {message.body ? <span className="chat-text">{message.body}</span> : null}
          </>
        )}
        <span className="chat-meta">
          <time dateTime={message.createdAt}>{formatChatTime(message.createdAt)}</time>
          {tick && !deleted ? <TickIcon status={tick} /> : null}
        </span>
      </div>

      {canAct && !deleted ? (
        <div className="chat-message-actions">
          <button
            className="chat-icon-button small"
            type="button"
            onClick={() => onReply(message)}
            aria-label="Reply"
            title="Reply"
          >
            <ReplyIcon />
          </button>
          {mine ? (
            <button
              className="chat-icon-button small"
              type="button"
              onClick={() => onDelete(message)}
              aria-label="Delete for everyone"
              title="Delete for everyone"
            >
              <TrashIcon />
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
