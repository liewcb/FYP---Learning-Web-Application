"use client";

import {
  formatDayLabel,
  presence,
  type ChatMessage,
  type ChatProfileDetails,
  type ChatSettingAction,
  type ChatSummary,
} from "@/models/chat/chat.model";
import {
  ChatAttachmentView,
  type AttachmentSaveState,
} from "@/views/chat/chat-attachment.view";
import {
  BlockIcon,
  CloseIcon,
  EraseIcon,
  FlagIcon,
  TrashIcon,
} from "@/views/chat/chat-icons.view";

const memberSinceFormatter = new Intl.DateTimeFormat("en-MY", {
  month: "long",
  year: "numeric",
});

interface ChatProfilePanelProps {
  readonly open: boolean;
  readonly summary: ChatSummary;
  readonly details: ChatProfileDetails | null;
  readonly loading: boolean;
  readonly viewerId: string;
  readonly now: number;
  readonly saveStateFor: (messageId: number) => AttachmentSaveState;
  readonly onSaveToDocuments: (message: Pick<ChatMessage, "id">) => void;
  readonly onAction: (action: ChatSettingAction) => void;
  readonly onReport: () => void;
  readonly onClose: () => void;
}

/** Contact info: slides in from the right when the chat header is clicked. */
export function ChatProfilePanel({
  open,
  summary,
  details,
  loading,
  viewerId,
  now,
  saveStateFor,
  onSaveToDocuments,
  onAction,
  onReport,
  onClose,
}: ChatProfilePanelProps) {
  const other = summary.other;
  const seen = summary.canSend ? presence(other.lastSeenAt, now) : null;

  return (
    <aside
      className={open ? "chat-side-panel open" : "chat-side-panel"}
      aria-label={`About ${other.fullName}`}
      aria-hidden={!open}
      inert={!open}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onClose();
        }
      }}
    >
      <header className="chat-side-panel-header">
        <button className="chat-icon-button" type="button" onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>
        <h2>Contact info</h2>
      </header>

      <div className="chat-side-panel-body">
        <section className="chat-profile-hero">
          <span className="chat-avatar large" aria-hidden="true">{other.initials}</span>
          <h3>{other.fullName}</h3>
          {other.username ? <p>@{other.username}</p> : null}
          {other.academicLine ? <p>{other.academicLine}</p> : null}
          {seen?.label ? (
            <p className={seen.online ? "chat-profile-online" : undefined}>{seen.label}</p>
          ) : null}
        </section>

        <section className="chat-profile-section">
          <h4>About</h4>
          {loading && !details ? (
            <p className="chat-profile-muted">Loading...</p>
          ) : (
            <p>{details?.bio?.trim() || "This student has not written a bio yet."}</p>
          )}
          {details && details.interests.length > 0 ? (
            <ul className="buddy-chips" aria-label="Learning interests">
              {details.interests.map((interest) => (
                <li className="buddy-chip" key={interest}>
                  {interest}
                </li>
              ))}
            </ul>
          ) : null}
          {details?.memberSince ? (
            <p className="chat-profile-muted">
              Member since {memberSinceFormatter.format(new Date(details.memberSince))}
            </p>
          ) : null}
        </section>

        <section className="chat-profile-section">
          <h4>
            Shared documents
            {details ? <span className="chat-profile-count">{details.files.length}</span> : null}
          </h4>
          {loading && !details ? (
            <p className="chat-profile-muted">Loading...</p>
          ) : details && details.files.length > 0 ? (
            <ul className="chat-profile-files">
              {details.files.map((file) => (
                <li key={file.messageId}>
                  <ChatAttachmentView
                    messageId={file.messageId}
                    attachment={file.attachment}
                    saveState={saveStateFor(file.messageId)}
                    onSaveToDocuments={() => onSaveToDocuments({ id: file.messageId })}
                  />
                  <small>
                    {file.senderId === viewerId ? "Sent by you" : `Sent by ${other.fullName}`} ·{" "}
                    {formatDayLabel(file.createdAt, now)}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="chat-profile-muted">No documents have been shared yet.</p>
          )}
        </section>

        <section className="chat-profile-actions" aria-label="Chat actions">
          <button type="button" onClick={() => onAction("clear")}>
            <EraseIcon />
            Clear chat
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => onAction(summary.blockedByMe ? "unblock" : "block")}
          >
            <BlockIcon />
            {summary.blockedByMe ? `Unblock ${other.fullName}` : `Block ${other.fullName}`}
          </button>
          <button type="button" className="danger" onClick={onReport}>
            <FlagIcon />
            Report {other.fullName}
          </button>
          <button type="button" className="danger" onClick={() => onAction("delete")}>
            <TrashIcon />
            Delete chat
          </button>
        </section>
      </div>
    </aside>
  );
}
