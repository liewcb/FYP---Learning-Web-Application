import type { SupabaseClient } from "@supabase/supabase-js";

import type { StorageRequestRepository } from "@/interfaces/repositories/storage-request.repository";
import {
  isStorageRequestStatus,
  toStorageRequestOutcome,
  type AdminStorageRequest,
  type StorageRequest,
  type StorageRequestOutcome,
  type StorageUsage,
} from "@/models/storage/storage-request.model";

type Numeric = number | string | null;

interface RequestRow {
  id: number;
  requested_bytes: Numeric;
  reason: string;
  status: string;
  quota_at_request: Numeric;
  used_at_request: Numeric;
  granted_quota_bytes: Numeric;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

interface AdminRequestRow extends RequestRow {
  user_id: string;
  user_name: string;
  username: string | null;
  email: string | null;
  account_status: string;
  current_quota_bytes: Numeric;
  current_used_bytes: Numeric;
  reviewer_name: string | null;
}

function toRequest(row: RequestRow): StorageRequest {
  return {
    id: row.id,
    requestedBytes: Number(row.requested_bytes),
    reason: row.reason,
    status: isStorageRequestStatus(row.status) ? row.status : "pending",
    quotaAtRequest: Number(row.quota_at_request),
    usedAtRequest: Number(row.used_at_request),
    grantedQuotaBytes: row.granted_quota_bytes === null ? null : Number(row.granted_quota_bytes),
    reviewNote: row.review_note,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  };
}

export class SupabaseStorageRequestRepository implements StorageRequestRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async myUsage(): Promise<StorageUsage | null> {
    const { data, error } = await this.supabase.rpc("get_my_account").maybeSingle();

    if (error) {
      throw new Error(`Unable to load storage usage: ${error.message}`);
    }

    const row = data as { storage_used_bytes: Numeric; storage_quota_bytes: Numeric } | null;

    return row
      ? { usedBytes: Number(row.storage_used_bytes), quotaBytes: Number(row.storage_quota_bytes) }
      : null;
  }

  async listMine(): Promise<StorageRequest[]> {
    // Row-level security returns only the signed-in student's requests.
    const { data, error } = await this.supabase
      .from("storage_requests")
      .select(
        "id, requested_bytes, reason, status, quota_at_request, used_at_request, granted_quota_bytes, review_note, reviewed_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      throw new Error(`Unable to load storage requests: ${error.message}`);
    }

    return ((data ?? []) as RequestRow[]).map(toRequest);
  }

  async create(additionalBytes: number, reason: string): Promise<StorageRequestOutcome> {
    const { data, error } = await this.supabase.rpc("request_more_storage", {
      p_additional_bytes: additionalBytes,
      p_reason: reason,
    });

    if (error) {
      throw new Error(`Unable to request storage: ${error.message}`);
    }

    return toStorageRequestOutcome(data);
  }

  async cancel(requestId: number): Promise<StorageRequestOutcome> {
    const { data, error } = await this.supabase.rpc("cancel_storage_request", {
      p_request: requestId,
    });

    if (error) {
      throw new Error(`Unable to cancel storage request: ${error.message}`);
    }

    return toStorageRequestOutcome(data);
  }

  async listForReview(status: string, limit: number): Promise<AdminStorageRequest[]> {
    const { data, error } = await this.supabase.rpc("admin_list_storage_requests", {
      p_status: status,
      p_limit: limit,
    });

    if (error) {
      throw new Error(`Unable to load storage requests: ${error.message}`);
    }

    return ((data ?? []) as AdminRequestRow[]).map((row) => ({
      ...toRequest(row),
      userId: row.user_id,
      userName: row.user_name,
      username: row.username,
      email: row.email,
      accountStatus: row.account_status === "suspended" ? "suspended" : "active",
      currentQuotaBytes: Number(row.current_quota_bytes),
      currentUsedBytes: Number(row.current_used_bytes),
      reviewerName: row.reviewer_name,
    }));
  }

  async decide(requestId: number, approve: boolean, note: string | null): Promise<StorageRequestOutcome> {
    const { data, error } = await this.supabase.rpc("admin_decide_storage_request", {
      p_request: requestId,
      p_approve: approve,
      p_note: note,
    });

    if (error) {
      throw new Error(`Unable to save the decision: ${error.message}`);
    }

    return toStorageRequestOutcome(data);
  }
}
