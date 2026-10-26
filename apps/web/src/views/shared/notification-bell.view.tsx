"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  formatNotificationTime,
  notificationHref,
  notificationMessage,
  notificationRules,
  type NotificationSummary,
} from "@/models/notifications/notification.model";

const notificationsEndpoint = "/api/notifications";

export function NotificationBell() {
  const router = useRouter();
  const [summary, setSummary] = useState<NotificationSummary>({
    items: [],
    unreadCount: 0,
  });
  const [checkedAt, setCheckedAt] = useState(0);
  const [open, setOpen] = useState(false);
  // Items that were unread when the panel opened stay highlighted while open.
  const [fresh, setFresh] = useState<ReadonlySet<number>>(new Set());
  const rootRef = useRef<HTMLDivElement>(null);
  const lastUnread = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(notificationsEndpoint, { cache: "no-store" });

      if (!response.ok) {
        return;
      }

      const next = (await response.json()) as NotificationSummary;
      const previous = lastUnread.current;
      lastUnread.current = next.unreadCount;
      setSummary(next);
      setCheckedAt(Date.now());

      // Something new arrived: refresh the page so request lists update too.
      if (previous !== null && next.unreadCount > previous) {
        router.refresh();
      }
    } catch {
      // Offline or signed out; try again on the next poll.
    }
  }, [router]);

  useEffect(() => {
    const initial = window.setTimeout(load, 0);
    const timer = window.setInterval(load, notificationRules.pollIntervalMs);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void load();
      }
    };

    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [load]);

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

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }

    setOpen(true);
    setCheckedAt(Date.now());

    if (summary.unreadCount > 0) {
      setFresh(new Set(summary.items.filter((item) => !item.read).map((item) => item.id)));
      setSummary((current) => ({
        items: current.items.map((item) => ({ ...item, read: true })),
        unreadCount: 0,
      }));
      lastUnread.current = 0;
      void fetch(notificationsEndpoint, { method: "POST" }).catch(() => undefined);
    } else {
      setFresh(new Set());
    }
  }

  const unread = summary.unreadCount;

  return (
    <div className="notification-menu" ref={rootRef}>
      <button
        className="icon-button"
        type="button"
        onClick={toggle}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-controls="notification-panel"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
        </svg>
        {unread > 0 ? (
          <span className="notification-badge" aria-hidden="true">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="notification-panel"
          id="notification-panel"
          role="region"
          aria-label="Notifications"
        >
          <p className="notification-panel-title">Notifications</p>
          {summary.items.length > 0 ? (
            <ul className="notification-list">
              {summary.items.map((item) => (
                <li key={item.id}>
                  <Link
                    className={fresh.has(item.id) ? "notification-item fresh" : "notification-item"}
                    href={notificationHref(item)}
                    onClick={() => setOpen(false)}
                  >
                    <span>{notificationMessage(item)}</span>
                    <small>{formatNotificationTime(item.createdAt, checkedAt)}</small>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="notification-empty">
              No notifications yet. Study buddy requests and replies will appear here.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
