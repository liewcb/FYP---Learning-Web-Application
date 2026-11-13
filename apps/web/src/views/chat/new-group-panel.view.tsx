"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import {
  chatGroupRules,
  validateGroupTitle,
  type ChatContact,
} from "@/models/chat/chat.model";
import { BackIcon, SearchIcon, TickIcon } from "@/views/chat/chat-icons.view";
import { Avatar } from "@/views/shared/avatar.view";

interface NewGroupPanelProps {
  readonly open: boolean;
  readonly contacts: readonly ChatContact[];
  readonly onClose: () => void;
  /** Resolves to an error message, or null once the group exists. */
  readonly onCreate: (title: string, memberIds: string[]) => Promise<string | null>;
}

/** The admin plus up to four invited study buddies. */
const maxInvitees = chatGroupRules.maxMembers - 1;

/** Slides over the chat list: name the group and pick who to invite. */
export function NewGroupPanel({ open, contacts, onClose, onCreate }: NewGroupPanelProps) {
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const search = query.trim().toLowerCase();
  const visible = contacts.filter(
    (contact) =>
      !search ||
      contact.fullName.toLowerCase().includes(search) ||
      contact.username?.toLowerCase().includes(search),
  );
  const full = selected.length >= maxInvitees;

  useEffect(() => {
    // preventScroll: the drawer is still off-screen while it slides in.
    if (open) {
      titleRef.current?.focus({ preventScroll: true });
    }
  }, [open]);

  function reset() {
    setTitle("");
    setQuery("");
    setSelected([]);
    setError(null);
  }

  function close() {
    reset();
    onClose();
  }

  function closeOnEscape(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
    }
  }

  function toggle(id: string) {
    setError(null);
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length < maxInvitees
          ? [...current, id]
          : current,
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const titleError = validateGroupTitle(title);

    if (titleError) {
      setError(titleError);
      titleRef.current?.focus();
      return;
    }

    if (selected.length === 0) {
      setError("Choose at least one study buddy to invite.");
      return;
    }

    setCreating(true);

    try {
      const message = await onCreate(title.trim(), [...selected]);

      if (message) {
        setError(message);
      } else {
        reset();
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <section
      className={open ? "chat-new-panel open" : "chat-new-panel"}
      aria-label="New group"
      aria-hidden={!open}
      inert={!open}
      onKeyDown={closeOnEscape}
    >
      <header className="chat-new-panel-header">
        <button className="chat-icon-button" type="button" onClick={close} aria-label="Back">
          <BackIcon />
        </button>
        <h2>New group</h2>
      </header>

      <form className="chat-new-group" onSubmit={(event) => void submit(event)} noValidate>
        <label className="chat-new-group-title">
          <span>Group name</span>
          <input
            ref={titleRef}
            value={title}
            maxLength={chatGroupRules.maxTitleLength}
            onChange={(event) => {
              setTitle(event.target.value);
              setError(null);
            }}
            placeholder="e.g. Calculus revision"
            autoComplete="off"
          />
        </label>

        <p className="chat-new-panel-section">
          Invite study buddies · {selected.length} of {maxInvitees}
        </p>
        <p className="chat-dialog-note">
          Groups have up to {chatGroupRules.maxMembers} members including you. Each buddy joins
          after accepting your invitation.
        </p>

        {contacts.length > 0 ? (
          <label className="chat-search">
            <SearchIcon />
            <span className="visually-hidden">Search study buddies</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search study buddies"
              autoComplete="off"
            />
          </label>
        ) : null}

        <div className="chat-new-panel-body">
          {contacts.length > 0 ? (
            <ul className="chat-contact-list" aria-label="Study buddies">
              {visible.map((contact) => {
                const checked = selected.includes(contact.id);

                return (
                  <li key={contact.id}>
                    <label
                      className={
                        !checked && full ? "chat-contact chat-pick disabled" : "chat-contact chat-pick"
                      }
                    >
                      <input
                        className="visually-hidden"
                        type="checkbox"
                        checked={checked}
                        disabled={!checked && full}
                        onChange={() => toggle(contact.id)}
                      />
                      <Avatar className="chat-avatar" initials={contact.initials} url={contact.avatarUrl} />
                      <span className="chat-contact-text">
                        <strong>{contact.fullName}</strong>
                        <small>
                          {[contact.username ? `@${contact.username}` : null, contact.academicLine]
                            .filter(Boolean)
                            .join(" · ")}
                        </small>
                      </span>
                      <span className={checked ? "chat-pick-box checked" : "chat-pick-box"} aria-hidden="true">
                        {checked ? <TickIcon status="sent" /> : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="chat-dialog-empty">
              You can create a group once a classmate accepts your study buddy request.{" "}
              <Link href="/study-buddy">Find study buddies</Link>
            </p>
          )}
          {contacts.length > 0 && visible.length === 0 ? (
            <p className="chat-dialog-empty">No study buddies match “{query.trim()}”.</p>
          ) : null}
        </div>

        <footer className="chat-new-group-footer">
          {error ? (
            <p className="chat-composer-error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            className="button button-dark"
            type="submit"
            disabled={creating || contacts.length === 0}
          >
            {creating ? "Creating..." : "Create group"}
          </button>
        </footer>
      </form>
    </section>
  );
}
