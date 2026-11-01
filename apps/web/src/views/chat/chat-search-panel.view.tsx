"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  chatSearchRules,
  formatChatTime,
  formatListTime,
  type ChatSearchResult,
} from "@/models/chat/chat.model";
import { CloseIcon, SearchIcon } from "@/views/chat/chat-icons.view";

interface ChatSearchPanelProps {
  readonly open: boolean;
  readonly otherName: string;
  readonly viewerId: string;
  readonly now: number;
  readonly onSearch: (query: string) => Promise<ChatSearchResult[] | null>;
  readonly onSelect: (messageId: number) => void;
  readonly onClose: () => void;
}

/** Wraps each case-insensitive match of `query` in <mark>. */
function Highlighted({ text, query }: { readonly text: string; readonly query: string }) {
  const needle = query.toLowerCase();
  const lower = text.toLowerCase();
  const parts: ReactNode[] = [];
  let start = 0;
  let index = lower.indexOf(needle);

  // Start the snippet a little before the first match so it is visible.
  const offset = index > 40 ? index - 30 : 0;

  if (offset > 0) {
    start = offset;
    parts.push("…");
  }

  while (index !== -1 && needle) {
    if (index >= start) {
      parts.push(text.slice(start, index));
      parts.push(<mark key={index}>{text.slice(index, index + needle.length)}</mark>);
      start = index + needle.length;
    }

    index = lower.indexOf(needle, index + needle.length);
  }

  parts.push(text.slice(start));

  return <>{parts}</>;
}

/** "Search messages": slides in from the right, like WhatsApp. */
export function ChatSearchPanel({
  open,
  otherName,
  viewerId,
  now,
  onSearch,
  onSelect,
  onClose,
}: ChatSearchPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly ChatSearchResult[]>([]);
  const [searchedFor, setSearchedFor] = useState("");
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef("");
  const [wasOpen, setWasOpen] = useState(open);

  // Start fresh every time the panel closes, however it was closed (X, Esc,
  // clicking the chat, the header toggle or picking a result).
  if (wasOpen !== open) {
    setWasOpen(open);

    if (!open) {
      setQuery("");
      setResults([]);
      setSearchedFor("");
      setLoading(false);
      setFailed(false);
    }
  }

  useEffect(() => {
    // preventScroll: the panel is still off-screen while it slides in, and a
    // plain focus() would scroll the whole conversation sideways to reach it.
    if (open) {
      inputRef.current?.focus({ preventScroll: true });
      return;
    }

    // Drop any search still waiting to run or in flight.
    window.clearTimeout(timer.current);
    latest.current = "";
  }, [open]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function change(value: string) {
    setQuery(value);
    window.clearTimeout(timer.current);

    const trimmed = value.trim();
    latest.current = trimmed;

    if (trimmed.length < chatSearchRules.minLength) {
      setResults([]);
      setSearchedFor("");
      setLoading(false);
      return;
    }

    setLoading(true);
    timer.current = window.setTimeout(async () => {
      const found = await onSearch(trimmed);

      // Ignore answers to queries the student has already typed past.
      if (latest.current !== trimmed) {
        return;
      }

      setLoading(false);
      setFailed(found === null);
      setResults(found ?? []);
      setSearchedFor(trimmed);
    }, chatSearchRules.debounceMs);
  }

  return (
    <aside
      className={open ? "chat-side-panel open" : "chat-side-panel"}
      aria-label="Search messages"
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
        <h2>Search messages</h2>
      </header>

      <label className="chat-search">
        <SearchIcon />
        <span className="visually-hidden">Search messages with {otherName}</span>
        <input
          ref={inputRef}
          type="search"
          value={query}
          maxLength={chatSearchRules.maxLength}
          onChange={(event) => change(event.target.value)}
          placeholder="Search..."
          autoComplete="off"
        />
      </label>

      <div className="chat-side-panel-body" aria-live="polite">
        {query.trim().length < chatSearchRules.minLength ? (
          <p className="chat-profile-muted chat-search-hint">
            Search for messages with {otherName}.
          </p>
        ) : loading ? (
          <p className="chat-profile-muted chat-search-hint">Searching...</p>
        ) : failed ? (
          <p className="chat-profile-muted chat-search-hint">
            Search is not available right now. Please try again.
          </p>
        ) : results.length === 0 ? (
          <p className="chat-profile-muted chat-search-hint">
            No messages found for “{searchedFor}”.
          </p>
        ) : (
          <ul className="chat-search-results">
            {results.map((result) => (
              <li key={result.messageId}>
                <button type="button" onClick={() => onSelect(result.messageId)}>
                  <span className="chat-search-meta">
                    <span>{result.senderId === viewerId ? "You" : otherName}</span>
                    <time dateTime={result.createdAt}>
                      {formatListTime(result.createdAt, now)}
                      {formatListTime(result.createdAt, now) === formatChatTime(result.createdAt)
                        ? ""
                        : ` · ${formatChatTime(result.createdAt)}`}
                    </time>
                  </span>
                  <span className="chat-search-text">
                    <Highlighted text={result.body} query={searchedFor} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
