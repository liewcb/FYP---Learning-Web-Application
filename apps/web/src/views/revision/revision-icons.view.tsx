import type { ReactNode } from "react";

/** Stroke icons for the revision dashboard; colour comes from currentColor. */
function Icon({ children, size = 18 }: { readonly children: ReactNode; readonly size?: number }) {
  return (
    <svg
      className="rev-icon"
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

export function PlusIcon() {
  return (
    <Icon size={16}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function ChevronDownIcon() {
  return (
    <Icon size={16}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

export function MoreIcon() {
  return (
    <Icon size={18}>
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="19" cy="12" r="1.2" />
    </Icon>
  );
}

export function CheckIcon() {
  return (
    <Icon size={16}>
      <path d="M4 12.5 9 17.5 20 6.5" />
    </Icon>
  );
}

export function NotePlusIcon() {
  return (
    <Icon size={16}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M12 11v6M9 14h6" />
    </Icon>
  );
}

export function HighlightIcon() {
  return (
    <Icon size={16}>
      <path d="m9 11-6 6v3h9l3-3" />
      <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
    </Icon>
  );
}

export function PlayIcon() {
  return (
    <svg className="rev-icon" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 4v16l13-8Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function FlameIcon() {
  return (
    <Icon>
      <path d="M12 3c1 3 4 4.5 4 8.5a4 4 0 0 1-8 0c0-1.5.6-2.6 1.5-3.5C9.6 10 11 9 12 3Z" />
    </Icon>
  );
}

export function UploadIcon() {
  return (
    <Icon>
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 20h14" />
    </Icon>
  );
}

export function QuizIcon() {
  return (
    <Icon>
      <path d="M9 11l3 3 8-8" />
      <path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" />
    </Icon>
  );
}

export function ExternalIcon() {
  return (
    <Icon size={15}>
      <path d="M14 3h7v7" />
      <path d="M10 14 21 3" />
      <path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
    </Icon>
  );
}

export function BackIcon() {
  return (
    <Icon size={20}>
      <path d="M15 18l-6-6 6-6" />
    </Icon>
  );
}

export function TrashIcon() {
  return (
    <Icon>
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M9 7V4h6v3" />
    </Icon>
  );
}

export function LinkIcon() {
  return (
    <Icon size={12}>
      <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
    </Icon>
  );
}

export function ListIcon() {
  return (
    <Icon size={16}>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </Icon>
  );
}

export function TagIcon() {
  return (
    <Icon size={16}>
      <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </Icon>
  );
}

export function BookIcon() {
  return (
    <Icon size={40}>
      <path d="M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2Z" />
      <path d="M22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8Z" />
    </Icon>
  );
}
