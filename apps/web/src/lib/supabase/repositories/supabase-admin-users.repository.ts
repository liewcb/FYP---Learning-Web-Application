import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdminUsersRepository } from "@/interfaces/repositories/admin-users.repository";
import type {
  AdminChangeOutcome,
  AdminUser,
  AdminUserFilters,
  AdminUserPage,
} from "@/models/admin/admin-users.model";

interface AdminUserRow {
  id: string;
  email: string | null;
  username: string | null;
  full_name: string | null;
  role: string;
  account_status: string;
  suspended_at: string | null;
  suspension_reason: string | null;
  storage_quota_bytes: number | string;
  storage_used_bytes: number | string;
  document_count: number | string;
  last_seen_at: string | null;
  last_sign_in_at: string | null;
  created_at: string;
  total_count: number | string;
}

const outcomes = new Set<AdminChangeOutcome>([
  "updated",
  "unchanged",
  "not_found",
  "self",
  "admin_target",
  "reason_required",
  "invalid",
]);

export function toAdminChangeOutcome(value: unknown): AdminChangeOutcome {
  return typeof value === "string" && outcomes.has(value as AdminChangeOutcome)
    ? (value as AdminChangeOutcome)
    : "invalid";
}

function toUser(row: AdminUserRow): AdminUser {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    fullName: row.full_name?.trim() || row.username || "Unnamed user",
    role: row.role === "admin" ? "admin" : "student",
    status: row.account_status === "suspended" ? "suspended" : "active",
    suspendedAt: row.suspended_at,
    suspensionReason: row.suspension_reason,
    storageQuotaBytes: Number(row.storage_quota_bytes),
    storageUsedBytes: Number(row.storage_used_bytes),
    documentCount: Number(row.document_count),
    lastSeenAt: row.last_seen_at,
    lastSignInAt: row.last_sign_in_at,
    createdAt: row.created_at,
  };
}

export class SupabaseAdminUsersRepository implements AdminUsersRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async list(filters: AdminUserFilters, limit: number, offset: number): Promise<AdminUserPage> {
    const { data, error } = await this.supabase.rpc("admin_list_users", {
      p_search: filters.search || null,
      p_status: filters.status,
      p_sort: filters.sort,
      p_limit: limit,
      p_offset: offset,
    });

    if (error) {
      throw new Error(`Unable to load users: ${error.message}`);
    }

    const rows = (data ?? []) as AdminUserRow[];

    return {
      users: rows.map(toUser),
      total: rows.length > 0 ? Number(rows[0].total_count) : 0,
    };
  }

  async setStatus(userId: string, suspend: boolean, reason: string | null): Promise<AdminChangeOutcome> {
    const { data, error } = await this.supabase.rpc("admin_set_account_status", {
      p_user: userId,
      p_suspend: suspend,
      p_reason: reason,
    });

    if (error) {
      throw new Error(`Unable to change account status: ${error.message}`);
    }

    return toAdminChangeOutcome(data);
  }

  async setStorageQuota(userId: string, quotaBytes: number): Promise<AdminChangeOutcome> {
    const { data, error } = await this.supabase.rpc("admin_set_storage_quota", {
      p_user: userId,
      p_quota_bytes: quotaBytes,
    });

    if (error) {
      throw new Error(`Unable to change storage quota: ${error.message}`);
    }

    return toAdminChangeOutcome(data);
  }

  async endSessions(userId: string): Promise<number> {
    const { data, error } = await this.supabase.rpc("admin_end_user_sessions", {
      p_user: userId,
    });

    if (error) {
      throw new Error(`Unable to end sessions: ${error.message}`);
    }

    return Number(data ?? -1);
  }
}
