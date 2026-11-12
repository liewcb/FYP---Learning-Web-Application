export const adminAuditLogPath = "/admin/audit-log";
export const auditLogPageSize = 30;

export const auditAreas = ["all", "users", "forum", "library", "reports"] as const;
export type AuditArea = (typeof auditAreas)[number];

export const auditAreaLabels: Record<AuditArea, string> = {
  all: "All activity",
  users: "Users",
  forum: "Forum",
  library: "Library",
  reports: "Reports",
};

export interface AuditEvent {
  readonly id: number;
  readonly actorName: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: number | null;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface AuditLogFilters {
  readonly area: AuditArea;
  readonly page: number;
}

export interface AuditLogModel {
  readonly filters: AuditLogFilters;
  readonly events: readonly AuditEvent[];
  readonly total: number;
  readonly pageCount: number;
}

type SearchParamValue = string | string[] | undefined;

function firstValue(value: SearchParamValue): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function parseAuditLogFilters(params: {
  readonly area?: SearchParamValue;
  readonly page?: SearchParamValue;
}): AuditLogFilters {
  const area = firstValue(params.area);
  const page = Number(firstValue(params.page));

  return {
    area: (auditAreas as readonly string[]).includes(area) ? (area as AuditArea) : "all",
    page: Number.isInteger(page) && page > 0 ? Math.min(page, 1000) : 1,
  };
}

export function auditLogHref(filters: AuditLogFilters, page = filters.page): string {
  const params = new URLSearchParams();

  if (filters.area !== "all") params.set("area", filters.area);
  if (page > 1) params.set("page", String(page));

  const query = params.toString();

  return query ? `${adminAuditLogPath}?${query}` : adminAuditLogPath;
}

function text(metadata: Readonly<Record<string, unknown>>, key: string): string | null {
  const value = metadata[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function bytesLabel(value: unknown): string {
  const bytes = Number(value);

  if (!Number.isFinite(bytes) || bytes <= 0) return "?";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(bytes % 1024 ** 3 === 0 ? 0 : 1)} GB`;

  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

const libraryStatusWords: Record<string, string> = {
  pending_review: "submitted for review",
  published: "published",
  rejected: "rejected",
  archived: "archived",
};

/** “Title” for new events; "Library material #12" for events logged before titles were recorded. */
function libraryTitle(event: AuditEvent): string {
  const title = text(event.metadata, "title");

  return title ? `“${title}”` : `Library material #${event.entityId}`;
}

/** Plain-language summary of one audit event for the log and the report. */
export function describeAuditEvent(event: AuditEvent): string {
  const meta = event.metadata;
  const person = text(meta, "full_name") ?? text(meta, "username") ?? "a user";
  const excerpt = text(meta, "excerpt");

  switch (event.action) {
    case "user_suspended":
      return `Suspended ${person}`;
    case "user_reactivated":
      return `Reactivated ${person}`;
    case "system_report_generated":
      return `Generated a system report (last ${Number(meta.days) || "?"} days)`;
    case "storage_request_approved":
      return `Approved ${person === "a user" ? "a" : `${person}'s`} storage request: ${bytesLabel(meta.from_bytes)} → ${bytesLabel(meta.to_bytes)}`;
    case "storage_request_rejected":
      return `Rejected ${person === "a user" ? "a" : `${person}'s`} request for +${bytesLabel(meta.requested_bytes)} storage`;
    case "user_storage_quota_changed":
      return `Changed ${person === "a user" ? "a" : `${person}'s`} storage quota from ${bytesLabel(meta.from_bytes)} to ${bytesLabel(meta.to_bytes)}`;
    case "forum_thread_hidden":
      return `Hid the thread “${excerpt ?? `#${event.entityId}`}”`;
    case "forum_thread_deleted":
      return `Removed the thread “${excerpt ?? `#${event.entityId}`}”`;
    case "forum_thread_restored":
      return `Restored the thread “${excerpt ?? `#${event.entityId}`}”`;
    case "forum_comment_hidden":
      return `Hid a comment: “${excerpt ?? `#${event.entityId}`}”`;
    case "forum_comment_deleted":
      return `Removed a comment: “${excerpt ?? `#${event.entityId}`}”`;
    case "forum_comment_restored":
      return `Restored a comment: “${excerpt ?? `#${event.entityId}`}”`;
    case "forum_report_dismissed":
      return `Dismissed a forum report (${text(meta, "report_reason") ?? "no reason given"})`;
    case "report_no_violation":
      return `Dismissed a report about ${text(meta, "target_label") ?? `#${event.entityId}`}`;
    case "report_content_removed":
      return `Removed reported content: ${text(meta, "target_label") ?? `#${event.entityId}`}`;
    case "report_user_suspended":
      return `Suspended the account in a report about ${text(meta, "target_label") ?? `#${event.entityId}`}`;
    case "report_removed_and_suspended":
      return `Removed content and suspended the account: ${text(meta, "target_label") ?? `#${event.entityId}`}`;
    case "library_material_submitted":
      return `${libraryTitle(event)} submitted to the library for review`;
    case "library_material_approved":
      return `Approved and published ${libraryTitle(event)}`;
    case "library_material_rejected":
      return `Rejected ${libraryTitle(event)}`;
    case "library_material_archived":
      return `Archived ${libraryTitle(event)} from the library`;
    case "library_material_status_changed": {
      const status = text(meta, "status");
      return `${libraryTitle(event)} ${status ? libraryStatusWords[status] ?? status : "updated"}`;
    }
    case "library_material_metadata_updated":
      return `${libraryTitle(event)} details updated`;
    default:
      return event.action.replace(/_/g, " ");
  }
}

/** The free-text reason or note attached to an event, if any. */
export function auditEventReason(event: AuditEvent): string | null {
  return text(event.metadata, "reason") ?? text(event.metadata, "note");
}
