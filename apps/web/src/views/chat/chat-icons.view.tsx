import type { ReactNode } from "react";

import type { TickStatus } from "@/models/chat/chat.model";

/** Stroke icons for the chat page; colour comes from currentColor. */
function Icon({ children, size = 20 }: { readonly children: ReactNode; readonly size?: number }) {
  return (
    <svg
      className="chat-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function SearchIcon() {
  return (
    <Icon size={18}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Icon>
  );
}

export function ComposeIcon() {
  return (
    <Icon>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </Icon>
  );
}

export function PaperclipIcon() {
  return (
    <Icon size={22}>
      <path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />
    </Icon>
  );
}

export function SendIcon() {
  return (
    <Icon>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4Z" />
    </Icon>
  );
}

export function ReplyIcon() {
  return (
    <Icon size={18}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 6 6v4" />
    </Icon>
  );
}

export function TrashIcon() {
  return (
    <Icon size={18}>
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M9 7V4h6v3" />
    </Icon>
  );
}

export function CloseIcon() {
  return (
    <Icon size={18}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  );
}

export function BackIcon() {
  return (
    <Icon size={22}>
      <path d="M15 18l-6-6 6-6" />
    </Icon>
  );
}

export function FileIcon() {
  return (
    <Icon size={18}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5" />
    </Icon>
  );
}

export function UploadIcon() {
  return (
    <Icon size={18}>
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 20h14" />
    </Icon>
  );
}

export function DownloadIcon() {
  return (
    <Icon size={18}>
      <path d="M12 4v11" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 20h14" />
    </Icon>
  );
}

export function LockIcon() {
  return (
    <Icon size={18}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </Icon>
  );
}

export function ChevronDownIcon() {
  return (
    <Icon size={18}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

export function PinIcon({ size = 18 }: { readonly size?: number }) {
  return (
    <Icon size={size}>
      <path d="M12 17v5" />
      <path d="M9 3h6l-1 6 4 4v2H6v-2l4-4-1-6Z" />
    </Icon>
  );
}

export function MuteIcon({ size = 18 }: { readonly size?: number }) {
  return (
    <Icon size={size}>
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path d="m22 9-6 6M16 9l6 6" />
    </Icon>
  );
}

export function SoundIcon() {
  return (
    <Icon size={18}>
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
    </Icon>
  );
}

export function EraseIcon() {
  return (
    <Icon size={18}>
      <path d="m7 21-4-4 10-10 8 8-6 6H7Z" />
      <path d="M21 21H7" />
      <path d="m9 11 8 8" />
    </Icon>
  );
}

export function BlockIcon() {
  return (
    <Icon size={18}>
      <circle cx="12" cy="12" r="9" />
      <path d="m5.6 5.6 12.8 12.8" />
    </Icon>
  );
}

export function FlagIcon() {
  return (
    <Icon size={18}>
      <path d="M5 21V4" />
      <path d="M5 4h11l-2 4 2 4H5" />
    </Icon>
  );
}

export function GroupIcon({ size = 20 }: { readonly size?: number }) {
  return (
    <Icon size={size}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" />
      <path d="M18 14a6.5 6.5 0 0 1 3.5 6" />
    </Icon>
  );
}

export function AddPersonIcon() {
  return (
    <Icon size={18}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M19 8v6M16 11h6" />
    </Icon>
  );
}

export function ExitIcon() {
  return (
    <Icon size={18}>
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      <path d="m9 16-4-4 4-4" />
      <path d="M5 12h11" />
    </Icon>
  );
}

export function ShieldIcon() {
  return (
    <Icon size={18}>
      <path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6Z" />
      <path d="m9 12 2 2 4-4" />
    </Icon>
  );
}

export function VideoIcon() {
  return (
    <Icon>
      <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
      <path d="m15.5 10.5 6-3.5v10l-6-3.5" />
    </Icon>
  );
}

export function ChatBubbleIcon() {
  return (
    <Icon size={40}>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
    </Icon>
  );
}

const tickLabels: Record<TickStatus | "pending", string> = {
  pending: "Sending",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
};

/** WhatsApp-style ticks: clock, one tick, two ticks, two coloured ticks. */
export function TickIcon({ status }: { readonly status: TickStatus | "pending" }) {
  return (
    <svg
      className={`chat-tick ${status}`}
      width={status === "sent" || status === "pending" ? 14 : 18}
      height="14"
      viewBox={status === "sent" || status === "pending" ? "0 0 24 24" : "0 0 26 24"}
      role="img"
      aria-label={tickLabels[status]}
    >
      {status === "pending" ? (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4l3 2" />
        </>
      ) : status === "sent" ? (
        <path d="M4 12.5 9 17.5 20 6.5" />
      ) : (
        <>
          <path d="M2 13l4.5 4.5L17 7" />
          <path d="M10.5 16.5l1 1L22 7" />
        </>
      )}
    </svg>
  );
}
