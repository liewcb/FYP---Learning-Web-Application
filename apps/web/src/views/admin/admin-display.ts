const dateTimeFormatter = new Intl.DateTimeFormat("en-MY", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kuala_Lumpur",
});

const dateFormatter = new Intl.DateTimeFormat("en-MY", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kuala_Lumpur",
});

export function formatAdminDateTime(value: string | null): string {
  return value ? dateTimeFormatter.format(new Date(value)) : "—";
}

export function formatAdminDate(value: string | null): string {
  return value ? dateFormatter.format(new Date(value)) : "—";
}

/** "5 min ago", "3 h ago", "2 days ago", or a date for older activity. */
export function formatRelative(value: string | null, now = Date.now()): string {
  if (!value) return "Never";

  const minutes = Math.round((now - Date.parse(value)) / 60_000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`;
  if (minutes < 60 * 24 * 14) return `${Math.round(minutes / (60 * 24))} days ago`;

  return formatAdminDate(value);
}

export function excerpt(text: string, length = 220): string {
  const clean = text.replace(/\s+/g, " ").trim();

  return clean.length > length ? `${clean.slice(0, length - 1)}…` : clean;
}
