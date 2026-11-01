"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { chatWithHref, type ChatContact } from "@/models/chat/chat.model";
import { BackIcon, SearchIcon } from "@/views/chat/chat-icons.view";

interface NewChatPanelProps {
  readonly open: boolean;
  readonly contacts: readonly ChatContact[];
  readonly onClose: () => void;
}

/** Slides over the chat list, like WhatsApp's New chat drawer. */
export function NewChatPanel({ open, contacts, onClose }: NewChatPanelProps) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const search = query.trim().toLowerCase();
  const visible = contacts.filter(
    (contact) =>
      !search ||
      contact.fullName.toLowerCase().includes(search) ||
      contact.username?.toLowerCase().includes(search),
  );

  useEffect(() => {
    // preventScroll: the drawer is still off-screen while it slides in.
    if (open) {
      searchRef.current?.focus({ preventScroll: true });
    }
  }, [open]);

  function close() {
    setQuery("");
    onClose();
  }

  function closeOnEscape(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
    }
  }

  return (
    <section
      className={open ? "chat-new-panel open" : "chat-new-panel"}
      aria-label="New chat"
      aria-hidden={!open}
      inert={!open}
      onKeyDown={closeOnEscape}
    >
      <header className="chat-new-panel-header">
        <button
          className="chat-icon-button"
          type="button"
          onClick={close}
          aria-label="Back to chats"
        >
          <BackIcon />
        </button>
        <h2>New chat</h2>
      </header>

      {contacts.length > 0 ? (
        <label className="chat-search">
          <SearchIcon />
          <span className="visually-hidden">Search study buddies</span>
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search study buddies"
            autoComplete="off"
          />
        </label>
      ) : null}

      <div className="chat-new-panel-body">
        <Link className="chat-contact" href="/study-buddy">
          <span className="chat-avatar chat-avatar-action" aria-hidden="true">
            <SearchIcon />
          </span>
          <span className="chat-contact-text">
            <strong>Find study buddies</strong>
            <small>Discover classmates to learn with</small>
          </span>
        </Link>

        {contacts.length > 0 ? (
          <>
            <p className="chat-new-panel-section">Your study buddies</p>
            <ul className="chat-contact-list">
              {visible.map((contact) => (
                <li key={contact.id}>
                  <Link className="chat-contact" href={chatWithHref(contact.id)}>
                    <span className="chat-avatar" aria-hidden="true">{contact.initials}</span>
                    <span className="chat-contact-text">
                      <strong>{contact.fullName}</strong>
                      <small>
                        {[contact.username ? `@${contact.username}` : null, contact.academicLine]
                          .filter(Boolean)
                          .join(" · ")}
                      </small>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {visible.length === 0 ? (
              <p className="chat-dialog-empty">No study buddies match “{query.trim()}”.</p>
            ) : null}
          </>
        ) : (
          <p className="chat-dialog-empty">
            You can chat with students once they accept your study buddy request.
          </p>
        )}
      </div>
    </section>
  );
}
