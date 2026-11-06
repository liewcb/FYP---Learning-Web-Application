const dateFormatter = new Intl.DateTimeFormat("en-MY", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-MY", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function formatLibraryDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

export function formatLibraryDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}