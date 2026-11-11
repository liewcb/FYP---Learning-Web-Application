import type {
  AdminChangeOutcome,
  AdminUserFilters,
  AdminUserPage,
} from "@/models/admin/admin-users.model";

/** Admin-only account management. The database refuses non-admin callers. */
export interface AdminUsersRepository {
  list(filters: AdminUserFilters, limit: number, offset: number): Promise<AdminUserPage>;
  setStatus(userId: string, suspend: boolean, reason: string | null): Promise<AdminChangeOutcome>;
  setStorageQuota(userId: string, quotaBytes: number): Promise<AdminChangeOutcome>;
  /** Signs the user out everywhere. Returns -1 when the database cannot do it. */
  endSessions(userId: string): Promise<number>;
}
