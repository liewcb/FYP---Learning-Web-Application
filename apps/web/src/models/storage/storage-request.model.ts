export const storageRequestPath = "/storage";
export const adminStorageRequestsPath = "/admin/storage-requests";

/** Extra space a student can ask for in one request (bytes). */
export const storageRequestAmounts = [
  { label: "+500 MB", bytes: 524_288_000 },
  { label: "+1 GB", bytes: 1_073_741_824 },
  { label: "+2 GB", bytes: 2_147_483_648 },
] as const;

/** Highest quota reachable through requests (matches the database). */
export const maxStorageQuotaBytes = 10_737_418_240;

export const storageRequestRules = { reasonMin: 10, reasonMax: 500, noteMax: 500 } as const;

export const storageRequestStatuses = ["pending", "approved", "rejected", "cancelled"] as const;
export type StorageRequestStatus = (typeof storageRequestStatuses)[number];

export const storageRequestStatusLabels: Record<StorageRequestStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const adminStorageRequestFilters = ["pending", "approved", "rejected", "all"] as const;
export type AdminStorageRequestFilter = (typeof adminStorageRequestFilters)[number];

export const adminStorageRequestFilterLabels: Record<AdminStorageRequestFilter, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  all: "All requests",
};

/** A request as its owner sees it. */
export interface StorageRequest {
  readonly id: number;
  readonly requestedBytes: number;
  readonly reason: string;
  readonly status: StorageRequestStatus;
  readonly quotaAtRequest: number;
  readonly usedAtRequest: number;
  readonly grantedQuotaBytes: number | null;
  readonly reviewNote: string | null;
  readonly reviewedAt: string | null;
  readonly createdAt: string;
}

/** A request as an administrator reviews it, with live usage. */
export interface AdminStorageRequest extends StorageRequest {
  readonly userId: string;
  readonly userName: string;
  readonly username: string | null;
  readonly email: string | null;
  readonly accountStatus: "active" | "suspended";
  readonly currentQuotaBytes: number;
  readonly currentUsedBytes: number;
  readonly reviewerName: string | null;
}

export interface StorageUsage {
  readonly usedBytes: number;
  readonly quotaBytes: number;
}

export interface StoragePageModel {
  readonly usage: StorageUsage;
  readonly requests: readonly StorageRequest[];
  readonly pending: StorageRequest | null;
  /** Amounts that still fit under the maximum quota. */
  readonly availableAmounts: readonly (typeof storageRequestAmounts)[number][];
}

export interface AdminStorageRequestsModel {
  readonly filter: AdminStorageRequestFilter;
  readonly requests: readonly AdminStorageRequest[];
  readonly pendingCount: number;
}

export interface StorageRequestFormState {
  readonly error?: string;
  readonly notice?: string;
  readonly reason?: string;
}

/** Outcome codes returned by the storage request database functions. */
export type StorageRequestOutcome =
  | "created"
  | "cancelled"
  | "approved"
  | "rejected"
  | "pending_exists"
  | "invalid_amount"
  | "reason_required"
  | "over_limit"
  | "not_allowed"
  | "not_found"
  | "note_required"
  | "unauthenticated";

export const storageRequestMessages: Record<StorageRequestOutcome, string> = {
  created: "Request sent. An administrator will review it soon.",
  cancelled: "Request cancelled.",
  approved: "Request approved. The student's quota has been increased.",
  rejected: "Request rejected. The student can read your note.",
  pending_exists: "You already have a request waiting for review.",
  invalid_amount: "Choose how much extra storage you need.",
  reason_required: `Explain why you need more space (${storageRequestRules.reasonMin}–${storageRequestRules.reasonMax} characters).`,
  over_limit: "That would go over the 10 GB maximum.",
  not_allowed: "Only active student accounts can request storage.",
  not_found: "This request has already been handled. Refresh the page.",
  note_required: "Write a short note so the student knows why it was rejected.",
  unauthenticated: "Your session expired. Sign in and try again.",
};

const outcomes = new Set<string>(Object.keys(storageRequestMessages));

export function toStorageRequestOutcome(value: unknown): StorageRequestOutcome {
  return typeof value === "string" && outcomes.has(value)
    ? (value as StorageRequestOutcome)
    : "not_found";
}

export function isStorageRequestStatus(value: unknown): value is StorageRequestStatus {
  return typeof value === "string" && (storageRequestStatuses as readonly string[]).includes(value);
}

export function parseAdminStorageRequestFilter(value: string | string[] | undefined): AdminStorageRequestFilter {
  const candidate = Array.isArray(value) ? value[0] : value;

  return (adminStorageRequestFilters as readonly string[]).includes(candidate ?? "")
    ? (candidate as AdminStorageRequestFilter)
    : "pending";
}

export function amountsWithinLimit(quotaBytes: number) {
  return storageRequestAmounts.filter((amount) => quotaBytes + amount.bytes <= maxStorageQuotaBytes);
}

export function isRequestAmount(bytes: number): boolean {
  return storageRequestAmounts.some((amount) => amount.bytes === bytes);
}
