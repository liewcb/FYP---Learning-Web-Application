const attemptDateFormatter = new Intl.DateTimeFormat("en-MY", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kuala_Lumpur",
});

export function formatAttemptDate(isoDate: string): string {
  return attemptDateFormatter.format(new Date(isoDate));
}

export function scoreTone(percentage: number): "strong" | "steady" | "weak" {
  if (percentage >= 80) return "strong";
  if (percentage >= 50) return "steady";
  return "weak";
}
