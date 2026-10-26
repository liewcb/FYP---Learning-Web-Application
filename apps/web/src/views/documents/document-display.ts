import type {
  DocumentContentSummary,
  DocumentStatus,
} from "@/models/document/document.model";

export const documentStatusLabels: Record<DocumentStatus, string> = {
  uploaded: "Uploaded",
  processing: "Processing",
  ready: "Ready",
  failed: "Needs attention",
};

const dateFormatter = new Intl.DateTimeFormat("en-MY", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatDocumentDate(isoDate: string): string {
  return dateFormatter.format(new Date(isoDate));
}

const numberFormatter = new Intl.NumberFormat("en-MY");

function countLabel(count: number, noun: string): string {
  return `${numberFormatter.format(count)} ${noun}${count === 1 ? "" : "s"}`;
}

export function formatContentSummary(content: DocumentContentSummary): string {
  const parts = [
    countLabel(content.sentenceCount, "sentence"),
    countLabel(content.wordCount, "word"),
  ];

  if (content.pageCount) {
    parts.push(countLabel(content.pageCount, "page"));
  }

  return parts.join(" · ");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function documentTypeLabel(mimeType: string): string {
  return mimeType === "application/pdf" ? "PDF" : "DOC";
}
