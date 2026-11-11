import type { AccountStatus, UserRole } from "@/models/profile/profile.model";

export const adminUsersPath = "/admin/users";
export const adminUsersPageSize = 25;

export const adminUserStatusFilters = ["all", "active", "suspended", "student", "admin"] as const;
export type AdminUserStatusFilter = (typeof adminUserStatusFilters)[number];

export const adminUserSorts = ["recent", "active", "storage"] as const;
export type AdminUserSort = (typeof adminUserSorts)[number];

export const adminUserStatusFilterLabels: Record<AdminUserStatusFilter, string> = {
  all: "All users",
  active: "Active",
  suspended: "Suspended",
  student: "Students",
  admin: "Admins",
};

export const adminUserSortLabels: Record<AdminUserSort, string> = {
  recent: "Newest first",
  active: "Recently active",
  storage: "Most storage used",
};

/** Storage quota presets an administrator can grant (bytes). */
export const storageQuotaOptions = [
  { label: "500 MB (default)", bytes: 524_288_000 },
  { label: "1 GB", bytes: 1_073_741_824 },
  { label: "2 GB", bytes: 2_147_483_648 },
  { label: "5 GB", bytes: 5_368_709_120 },
] as const;

export const suspensionReasonMax = 500;

export interface AdminUserFilters {
  readonly search: string;
  readonly status: AdminUserStatusFilter;
  readonly sort: AdminUserSort;
  readonly page: number;
}

export interface AdminUser {
  readonly id: string;
  readonly email: string | null;
  readonly username: string | null;
  readonly fullName: string;
  readonly role: UserRole;
  readonly status: AccountStatus;
  readonly suspendedAt: string | null;
  readonly suspensionReason: string | null;
  readonly storageQuotaBytes: number;
  readonly storageUsedBytes: number;
  readonly documentCount: number;
  readonly lastSeenAt: string | null;
  readonly lastSignInAt: string | null;
  readonly createdAt: string;
}

export interface AdminUserPage {
  readonly users: readonly AdminUser[];
  readonly total: number;
}

export interface AdminUsersModel extends AdminUserPage {
  readonly filters: AdminUserFilters;
  readonly pageCount: number;
  readonly viewerId: string;
}

export interface AdminUserActionState {
  readonly error?: string;
  readonly notice?: string;
}

/** Database outcome codes returned by the admin_* functions. */
export type AdminChangeOutcome =
  | "updated"
  | "unchanged"
  | "not_found"
  | "self"
  | "admin_target"
  | "reason_required"
  | "invalid";

export const adminChangeMessages: Record<Exclude<AdminChangeOutcome, "updated">, string> = {
  unchanged: "Nothing changed. The account was already in that state.",
  not_found: "That account no longer exists.",
  self: "You cannot suspend your own account.",
  admin_target: "Administrator accounts cannot be suspended here.",
  reason_required: "Give a reason. The student will see it when they try to sign in.",
  invalid: "Choose a valid storage quota.",
};

type SearchParamValue = string | string[] | undefined;

function firstValue(value: SearchParamValue): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function parseAdminUserFilters(params: {
  readonly q?: SearchParamValue;
  readonly status?: SearchParamValue;
  readonly sort?: SearchParamValue;
  readonly page?: SearchParamValue;
}): AdminUserFilters {
  const status = firstValue(params.status);
  const sort = firstValue(params.sort);
  const page = Number(firstValue(params.page));

  return {
    search: firstValue(params.q).trim().slice(0, 100),
    status: (adminUserStatusFilters as readonly string[]).includes(status)
      ? (status as AdminUserStatusFilter)
      : "all",
    sort: (adminUserSorts as readonly string[]).includes(sort)
      ? (sort as AdminUserSort)
      : "recent",
    page: Number.isInteger(page) && page > 0 ? Math.min(page, 1000) : 1,
  };
}

export function adminUsersHref(filters: AdminUserFilters, page = filters.page): string {
  const params = new URLSearchParams();

  if (filters.search) params.set("q", filters.search);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.sort !== "recent") params.set("sort", filters.sort);
  if (page > 1) params.set("page", String(page));

  const query = params.toString();

  return query ? `${adminUsersPath}?${query}` : adminUsersPath;
}

export function storageUsageRatio(user: Pick<AdminUser, "storageUsedBytes" | "storageQuotaBytes">): number {
  return user.storageQuotaBytes > 0 ? user.storageUsedBytes / user.storageQuotaBytes : 0;
}

export function isValidUserId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function isStorageQuotaOption(bytes: number): boolean {
  return storageQuotaOptions.some((option) => option.bytes === bytes);
}
