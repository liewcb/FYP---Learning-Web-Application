"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { chatRules, chatsChangedEvent } from "@/models/chat/chat.model";

const inboxEndpoint = "/api/chats/inbox";
const changeDebounceMs = 400;

/**
 * Unread chats on the Chats link. Polling it also tells the server the
 * student is online and that their waiting messages were delivered.
 */
export function ChatUnreadBadge() {
  const [unread, setUnread] = useState(0);
  const debounce = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const response = await fetch(inboxEndpoint, { method: "POST", cache: "no-store" });

      if (response.ok) {
        const body = (await response.json()) as { unreadCount?: number };
        setUnread(typeof body.unreadCount === "number" ? body.unreadCount : 0);
      }
    } catch {
      // Offline or signed out; try again on the next poll.
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(load, 0);
    const timer = window.setInterval(load, chatRules.refreshIntervalMs);

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        void load();
      }
    }

    function refreshSoon() {
      window.clearTimeout(debounce.current);
      debounce.current = window.setTimeout(load, changeDebounceMs);
    }

    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener(chatsChangedEvent, refreshSoon);

    return () => {
      window.clearTimeout(initial);
      window.clearTimeout(debounce.current);
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener(chatsChangedEvent, refreshSoon);
    };
  }, [load]);

  if (unread === 0) {
    return null;
  }

  return (
    <span className="nav-badge">
      <span aria-hidden="true">{unread > 9 ? "9+" : unread}</span>
      <span className="visually-hidden">, {unread} unread</span>
    </span>
  );
}
