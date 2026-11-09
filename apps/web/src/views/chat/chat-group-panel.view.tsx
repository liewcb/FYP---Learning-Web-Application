"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  chatGroupRules,
  chatWithHref,
  formatDayLabel,
  isActiveGroupMember,
  isGroupAdmin,
  presence,
  sortGroupMembers,
  type ChatContact,
  type ChatGroupCommand,
  type ChatGroupMember,
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
  AddPersonIcon,
  ChevronDownIcon,
  CloseIcon,
  ComposeIcon,
  EraseIcon,
  ExitIcon,
  ShieldIcon,
  TrashIcon,
} from "@/views/chat/chat-icons.view";

interface ChatGroupPanelProps {
  readonly open: boolean;
  readonly summary: ChatSummary;
  readonly members: readonly ChatGroupMember[];
  /** The viewer's study buddies, who the admin may invite. */
  readonly contacts: readonly ChatContact[];
  readonly details: ChatProfileDetails | null;
  readonly loading: boolean;
  readonly viewerId: string;
  readonly now: number;
  readonly saveStateFor: (messageId: number) => AttachmentSaveState;
  readonly onSaveToDocuments: (message: Pick<ChatMessage, "id">) => void;
  /** Resolves to an error message, or null when it worked (or awaits confirmation). */
  readonly onCommand: (command: ChatGroupCommand) => Promise<string | null>;
  readonly onAction: (action: ChatSettingAction) => void;
  readonly onClose: () => void;
}

/** Someone the admin can invite: a study buddy or a former member. */
type InvitableStudent = Pick<ChatContact, "id" | "fullName" | "username" | "initials" | "academicLine"> & {
  readonly former: "left" | "removed" | null;
};

function invitableLine(student: InvitableStudent): string {
  const detail = student.academicLine ?? (student.username ? `@${student.username}` : "");

  if (!student.former) {
    return detail;
  }

  return [student.former === "left" ? "Left the group" : "Removed from the group", detail]
    .filter(Boolean)
    .join(" · ");
}

/** The admin's ▾ menu on a member row. */
function MemberMenu({
  member,
  onCommand,
}: {
  readonly member: ChatGroupMember;
  readonly onCommand: (command: ChatGroupCommand) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function choose(command: ChatGroupCommand) {
    setOpen(false);
    onCommand(command);
  }

  return (
    <div className={open ? "chat-row-menu open" : "chat-row-menu"} ref={rootRef}>
      <button
        className="chat-row-menu-button"
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Options for ${member.fullName}`}
      >
        <ChevronDownIcon />
      </button>

      {open ? (
        <div className="chat-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => choose({ type: "make_admin", studentId: member.id })}
          >
            <ShieldIcon />
            Make group admin
          </button>
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={() => choose({ type: "remove", studentId: member.id })}
          >
            <ExitIcon />
            Remove from group
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Group info: members, invitations, shared files and group actions. */
export function ChatGroupPanel({
  open,
  summary,
  members,
  contacts,
  details,
  loading,
  viewerId,
  now,
  saveStateFor,
  onSaveToDocuments,
  onCommand,
  onAction,
  onClose,
}: ChatGroupPanelProps) {
  const group = summary.group!;
  const admin = isGroupAdmin(summary, viewerId);
  const active = isActiveGroupMember(summary);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(group.title);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const listed = sortGroupMembers(
    members.filter((member) => member.status === "member" || member.status === "invited"),
    group.adminId,
  );
  const memberCount = listed.filter((member) => member.status === "member").length;
  const slotsLeft = chatGroupRules.maxMembers - listed.length;
  const takenIds = new Set(listed.map((member) => member.id));
  // Former members can be invited back even if they are not the admin's buddy.
  const formerMembers = members.filter(
    (member): member is ChatGroupMember & { readonly status: "left" | "removed" } =>
      (member.status === "left" || member.status === "removed") && !takenIds.has(member.id),
  );
  const formerIds = new Set(formerMembers.map((member) => member.id));
  const invitable: readonly InvitableStudent[] = [
    ...formerMembers.map((member) => ({ ...member, former: member.status })),
    ...contacts
      .filter((contact) => !takenIds.has(contact.id) && !formerIds.has(contact.id))
      .map((contact) => ({ ...contact, former: null })),
  ];

  async function run(command: ChatGroupCommand, busyKey: string) {
    setBusyId(busyKey);
    setError(null);

    try {
      const message = await onCommand(command);

      setError(message);
      return message === null;
    } finally {
      setBusyId(null);
    }
  }

  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (await run({ type: "rename", title }, "rename")) {
      setRenaming(false);
    }
  }

  return (
    <aside
      className={open ? "chat-side-panel open" : "chat-side-panel"}
      aria-label={`About ${group.title}`}
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
        <h2>Group info</h2>
      </header>

      <div className="chat-side-panel-body">
        <section className="chat-profile-hero">
          <span className="chat-avatar group large" aria-hidden="true">{group.initials}</span>
          {renaming ? (
            <form className="chat-group-rename" onSubmit={(event) => void rename(event)}>
              <label className="visually-hidden" htmlFor="chat-group-title">
                Group name
              </label>
              <input
                id="chat-group-title"
                value={title}
                maxLength={chatGroupRules.maxTitleLength}
                onChange={(event) => setTitle(event.target.value)}
                autoFocus
              />
              <div className="chat-group-rename-actions">
                <button
                  className="button button-outline"
                  type="button"
                  onClick={() => {
                    setRenaming(false);
                    setTitle(group.title);
                    setError(null);
                  }}
                >
                  Cancel
                </button>
                <button className="button button-dark" type="submit" disabled={busyId === "rename"}>
                  {busyId === "rename" ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          ) : (
            <h3 className="chat-group-title">
              {group.title}
              {admin ? (
                <button
                  className="chat-icon-button small"
                  type="button"
                  onClick={() => {
                    setTitle(group.title);
                    setRenaming(true);
                  }}
                  aria-label="Rename group"
                  title="Rename group"
                >
                  <ComposeIcon />
                </button>
              ) : null}
            </h3>
          )}
          <p>
            Group · {memberCount} of {chatGroupRules.maxMembers} members
          </p>
          {group.disbanded ? <p>This group was disbanded.</p> : null}
        </section>

        {error ? (
          <p className="chat-group-error" role="alert">
            {error}
          </p>
        ) : null}

        {active ? (
          <section className="chat-profile-section">
            <h4>
              Members
              <span className="chat-profile-count">{memberCount}</span>
            </h4>

            {admin && slotsLeft > 0 ? (
              <button
                className="chat-contact chat-group-add"
                type="button"
                onClick={() => setAdding((current) => !current)}
                aria-expanded={adding}
              >
                <span className="chat-avatar chat-avatar-action" aria-hidden="true">
                  <AddPersonIcon />
                </span>
                <span className="chat-contact-text">
                  <strong>Add member</strong>
                  <small>
                    {slotsLeft} place{slotsLeft === 1 ? "" : "s"} left · study buddies or former
                    members
                  </small>
                </span>
              </button>
            ) : null}

            {admin && adding && slotsLeft > 0 ? (
              invitable.length > 0 ? (
                <ul className="chat-contact-list chat-group-picker" aria-label="Students to invite">
                  {invitable.map((contact) => (
                    <li key={contact.id} className="chat-group-member">
                      <span className="chat-avatar" aria-hidden="true">{contact.initials}</span>
                      <span className="chat-contact-text">
                        <strong>{contact.fullName}</strong>
                        <small>{invitableLine(contact)}</small>
                      </span>
                      <button
                        className="button button-outline chat-group-small-button"
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => void run({ type: "invite", studentId: contact.id }, contact.id)}
                      >
                        {busyId === contact.id ? "Inviting..." : "Invite"}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="chat-profile-muted">
                  Everyone you can invite is already in this group or invited.{" "}
                  <Link href="/study-buddy">Find study buddies</Link>
                </p>
              )
            ) : null}

            <ul className="chat-contact-list chat-group-members">
              {listed.map((member) => {
                const me = member.id === viewerId;
                const seen = presence(member.lastSeenAt, now);
                const subline =
                  member.status === "invited"
                    ? "Invited · waiting for a reply"
                    : seen.online
                      ? "online"
                      : member.academicLine ?? (member.username ? `@${member.username}` : "");

                return (
                  <li
                    key={`${member.status}-${member.id}`}
                    className={member.status === "invited" ? "chat-group-member invited" : "chat-group-member"}
                  >
                    <span className="chat-avatar" aria-hidden="true">{member.initials}</span>
                    <span className="chat-contact-text">
                      <strong>{me ? "You" : member.fullName}</strong>
                      <small className={seen.online && member.status === "member" ? "online" : undefined}>
                        {subline}
                      </small>
                    </span>
                    {member.status === "member" && member.id === group.adminId ? (
                      <span className="chat-group-badge">Group admin</span>
                    ) : null}
                    {member.isBuddy && member.status === "member" && !me ? (
                      <Link className="text-action chat-group-message" href={chatWithHref(member.id)}>
                        Message
                      </Link>
                    ) : null}
                    {admin && member.status === "invited" && member.inviteId !== null ? (
                      <button
                        className="text-action"
                        type="button"
                        disabled={busyId !== null}
                        onClick={() =>
                          void run({ type: "cancel_invite", inviteId: member.inviteId! }, member.id)
                        }
                      >
                        {busyId === member.id ? "Cancelling..." : "Cancel"}
                      </button>
                    ) : null}
                    {admin && member.status === "member" && !me ? (
                      <MemberMenu member={member} onCommand={(command) => void run(command, member.id)} />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

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
                    {file.senderId === viewerId
                      ? "Sent by you"
                      : `Sent by ${members.find((member) => member.id === file.senderId)?.fullName ?? "a former member"}`}{" "}
                    · {formatDayLabel(file.createdAt, now)}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="chat-profile-muted">
              No documents have been shared yet. Use the paperclip to share a file or one of your
              documents.
            </p>
          )}
        </section>

        <section className="chat-profile-actions" aria-label="Group actions">
          <button type="button" onClick={() => onAction("clear")}>
            <EraseIcon />
            Clear chat
          </button>
          {active ? (
            <button
              type="button"
              className="danger"
              onClick={() => void run({ type: "leave" }, "leave")}
            >
              <ExitIcon />
              Exit group
            </button>
          ) : (
            <button type="button" className="danger" onClick={() => onAction("delete")}>
              <TrashIcon />
              Delete chat
            </button>
          )}
          {admin ? (
            <button
              type="button"
              className="danger"
              onClick={() => void run({ type: "disband" }, "disband")}
            >
              <TrashIcon />
              Disband group
            </button>
          ) : null}
        </section>
      </div>
    </aside>
  );
}
