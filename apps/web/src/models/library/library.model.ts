import type { Viewer } from "@/models/profile/profile.model";

type SearchParamValue = string | string[] | undefined;

export const libraryStatuses = [
  "draft",
  "pending_review",
  "published",
  "rejected",
  "archived",
] as const;

export type LibraryStatus = (typeof libraryStatuses)[number];

export const libraryStatusLabels: Record<LibraryStatus, string> = {
  draft: "Draft",
  pending_review: "Pending review",
  published: "Published",
  rejected: "Rejected",
  archived: "Archived",
};

export function isLibraryStatus(value: unknown): value is LibraryStatus {
  return typeof value === "string" && (libraryStatuses as readonly string[]).includes(value);
}

/** Moderation queues an administrator can open. */
export const libraryReviewFilters = [
  "pending_review",
  "published",
  "rejected",
  "archived",
] as const;

export type LibraryReviewFilter = (typeof libraryReviewFilters)[number];

export const libraryRules = {
  titleMin: 3,
  titleMax: 200,
  descriptionMax: 4000,
  subjectMax: 120,
  moduleCodeMax: 40,
  maxTags: 10,
  tagMax: 30,
  noteMin: 5,
  noteMax: 2000,
  pageSize: 60,
} as const;

export interface LibraryMaterial {
  readonly id: number;
  readonly sourceDocumentId: number | null;
  readonly submittedBy: string;
  readonly submitterName: string;
  readonly submitterDiscoverable: boolean;
  readonly title: string;
  readonly description: string;
  readonly subjectName: string;
  readonly moduleCode: string | null;
  readonly tags: readonly string[];
  readonly status: LibraryStatus;
  readonly reviewedBy: string | null;
  readonly reviewNote: string | null;
  readonly reviewedAt: string | null;
  readonly publishedAt: string | null;
  readonly archivedAt: string | null;
  readonly fileName: string | null;
  readonly mimeType: string | null;
  readonly sizeBytes: number | null;
  readonly viewCount: number;
  readonly downloadCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type LibraryEventType = "submitted" | "status_changed" | "metadata_updated";

export interface LibraryEvent {
  readonly id: number;
  readonly actorId: string | null;
  readonly eventType: LibraryEventType;
  readonly fromStatus: LibraryStatus | null;
  readonly toStatus: LibraryStatus | null;
  readonly note: string | null;
  readonly createdAt: string;
}

export function describeLibraryEvent(event: LibraryEvent): string {
  if (event.eventType === "submitted") {
    return "Submitted for review";
  }

  if (event.eventType === "metadata_updated") {
    return "Details updated";
  }

  switch (event.toStatus) {
    case "published":
      return "Approved and published";
    case "rejected":
      return "Rejected";
    case "archived":
      return "Archived";
    case "pending_review":
      return "Returned to review";
    default:
      return "Status changed";
  }
}

/** Authors are shown by name only when they chose to be discoverable. */
export function contributorLabel(
  material: Pick<LibraryMaterial, "submittedBy" | "submitterName" | "submitterDiscoverable">,
  viewer: Pick<Viewer, "id" | "role">,
): string {
  if (viewer.role === "admin" || material.submittedBy === viewer.id) {
    return material.submitterName;
  }

  return material.submitterDiscoverable ? material.submitterName : "A student";
}

export function parseLibraryId(value: unknown): number | null {
  const id = typeof value === "number" ? value : Number(value);

  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/* ---------- Browsing ---------- */

export type LibrarySort = "latest" | "popular";
export type LibraryTab = "browse" | "mine";

export interface LibraryBrowseFilters {
  readonly query: string;
  readonly subject: string;
  readonly sort: LibrarySort;
}

function firstValue(value: SearchParamValue): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export function parseLibraryTab(value: SearchParamValue): LibraryTab {
  return firstValue(value) === "mine" ? "mine" : "browse";
}

export function parseLibraryFilters(params: {
  readonly q?: SearchParamValue;
  readonly subject?: SearchParamValue;
  readonly sort?: SearchParamValue;
}): LibraryBrowseFilters {
  return {
    query: firstValue(params.q).slice(0, 100),
    subject: firstValue(params.subject).slice(0, libraryRules.subjectMax),
    sort: firstValue(params.sort) === "popular" ? "popular" : "latest",
  };
}

export function hasLibraryFilters(filters: LibraryBrowseFilters): boolean {
  return Boolean(filters.query || filters.subject || filters.sort !== "latest");
}

/** Keeps letters, numbers, spaces, "_" and "-" so the value is safe in a filter. */
export function librarySearchTerm(raw: string): string {
  return raw
    .replace(/[^\p{L}\p{N}\s_-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseLibraryReviewFilter(value: SearchParamValue): LibraryReviewFilter {
  const candidate = firstValue(value);

  return (libraryReviewFilters as readonly string[]).includes(candidate)
    ? (candidate as LibraryReviewFilter)
    : "pending_review";
}

export interface LibraryPageModel {
  readonly tab: LibraryTab;
  readonly filters: LibraryBrowseFilters;
  /** Published materials (browse tab only). */
  readonly materials: readonly LibraryMaterial[];
  readonly subjects: readonly string[];
  /** The student's own submissions, any status. */
  readonly mine: readonly LibraryMaterial[];
}

export interface LibraryDetailModel {
  readonly material: LibraryMaterial;
  /** Only filled in for the student who submitted the material. */
  readonly events: readonly LibraryEvent[];
  readonly isOwner: boolean;
}

/* ---------- Submitting ---------- */

export interface LibrarySubmittableDocument {
  readonly id: number;
  readonly title: string;
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly mimeType: string;
}

export interface LibrarySubmitPageModel {
  readonly documents: readonly LibrarySubmittableDocument[];
  readonly selectedId: number | null;
  readonly subjects: readonly string[];
}

export interface LibrarySubmitFormValues {
  readonly documentId: string;
  readonly title: string;
  readonly description: string;
  readonly subjectName: string;
  readonly moduleCode: string;
  readonly tags: string;
}

export type LibrarySubmitFieldErrors = Partial<Record<keyof LibrarySubmitFormValues, string>>;

export interface LibrarySubmitFormState {
  readonly error?: string;
  readonly fieldErrors?: LibrarySubmitFieldErrors;
  readonly values?: LibrarySubmitFormValues;
}

export interface LibrarySubmission {
  readonly documentId: number;
  readonly title: string;
  readonly description: string;
  readonly subjectName: string;
  readonly moduleCode: string | null;
  readonly tags: readonly string[];
}

export type LibrarySubmissionValidation =
  | { readonly ok: true; readonly value: LibrarySubmission }
  | { readonly ok: false; readonly fieldErrors: LibrarySubmitFieldErrors };

/** "Databases, SQL" -> ["databases", "sql"]; lowercase, unique, trimmed. */
export function parseLibraryTags(raw: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const part of raw.split(",")) {
    const tag = part.trim().replace(/\s+/g, " ").toLowerCase();

    if (tag && !seen.has(tag)) {
      seen.add(tag);
      tags.push(tag);
    }
  }

  return tags;
}

export function validateLibrarySubmission(
  values: LibrarySubmitFormValues,
): LibrarySubmissionValidation {
  const fieldErrors: LibrarySubmitFieldErrors = {};
  const documentId = parseLibraryId(values.documentId);
  const title = values.title.trim().replace(/\s+/g, " ");
  const description = values.description.trim();
  const subjectName = values.subjectName.trim().replace(/\s+/g, " ");
  const moduleCode = values.moduleCode.trim().toUpperCase();
  const tags = parseLibraryTags(values.tags);

  if (documentId === null) {
    fieldErrors.documentId = "Choose one of your ready documents.";
  }

  if (title.length < libraryRules.titleMin || title.length > libraryRules.titleMax) {
    fieldErrors.title = `Title must be ${libraryRules.titleMin}–${libraryRules.titleMax} characters.`;
  }

  if (description.length > libraryRules.descriptionMax) {
    fieldErrors.description = `Description must be ${libraryRules.descriptionMax} characters or fewer.`;
  }

  if (!subjectName) {
    fieldErrors.subjectName = "Enter a subject or category.";
  } else if (subjectName.length > libraryRules.subjectMax) {
    fieldErrors.subjectName = `Subject must be ${libraryRules.subjectMax} characters or fewer.`;
  }

  if (moduleCode.length > libraryRules.moduleCodeMax) {
    fieldErrors.moduleCode = `Module code must be ${libraryRules.moduleCodeMax} characters or fewer.`;
  }

  if (tags.length > libraryRules.maxTags) {
    fieldErrors.tags = `Add up to ${libraryRules.maxTags} tags.`;
  } else if (tags.some((tag) => tag.length > libraryRules.tagMax)) {
    fieldErrors.tags = `Keep each tag under ${libraryRules.tagMax} characters.`;
  }

  if (Object.keys(fieldErrors).length > 0 || documentId === null) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    value: {
      documentId,
      title,
      description,
      subjectName,
      moduleCode: moduleCode || null,
      tags,
    },
  };
}

/* ---------- Moderation ---------- */

export const libraryDecisions = ["publish", "reject", "archive"] as const;

export type LibraryDecision = (typeof libraryDecisions)[number];

export function isLibraryDecision(value: unknown): value is LibraryDecision {
  return typeof value === "string" && (libraryDecisions as readonly string[]).includes(value);
}

export const libraryDecisionRules: Record<
  LibraryDecision,
  {
    readonly from: LibraryStatus;
    readonly to: LibraryStatus;
    readonly noteRequired: boolean;
    readonly success: string;
  }
> = {
  publish: {
    from: "pending_review",
    to: "published",
    noteRequired: false,
    success: "Material approved and published.",
  },
  reject: {
    from: "pending_review",
    to: "rejected",
    noteRequired: true,
    success: "Material rejected. The student can read your feedback.",
  },
  archive: {
    from: "published",
    to: "archived",
    noteRequired: true,
    success: "Material archived and removed from the Library.",
  },
};

export type LibraryNoteValidation =
  | { readonly ok: true; readonly note: string | null }
  | { readonly ok: false; readonly error: string };

export function validateReviewNote(decision: LibraryDecision, raw: string): LibraryNoteValidation {
  const note = raw.trim();

  if (libraryDecisionRules[decision].noteRequired && note.length < libraryRules.noteMin) {
    return {
      ok: false,
      error: `Write a reason of at least ${libraryRules.noteMin} characters.`,
    };
  }

  if (note.length > libraryRules.noteMax) {
    return { ok: false, error: `Keep the reason under ${libraryRules.noteMax} characters.` };
  }

  return { ok: true, note: note || null };
}

export interface LibraryReviewFormState {
  readonly error?: string;
  readonly notice?: string;
  /** Echoed back so a failed decision does not lose the typed reason. */
  readonly note?: string;
}

export interface LibraryReviewModel {
  readonly filter: LibraryReviewFilter;
  readonly counts: Record<LibraryReviewFilter, number>;
  readonly materials: readonly LibraryMaterial[];
}