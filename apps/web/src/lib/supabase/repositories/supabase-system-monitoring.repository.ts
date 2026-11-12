import type { SupabaseClient } from "@supabase/supabase-js";

import type { SystemMonitoringRepository } from "@/interfaces/repositories/system-monitoring.repository";
import type {
  ActivityDay,
  StorageBucketUsage,
  StorageHeavyUser,
  SystemOverview,
} from "@/models/admin/system-monitoring.model";

type Json = Record<string, unknown>;

function object(value: unknown): Json {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Json) : {};
}

function count(source: Json, key: string): number {
  const value = Number(source[key]);

  return Number.isFinite(value) ? value : 0;
}

function buckets(value: unknown): StorageBucketUsage[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.map((item) => {
    const row = object(item);

    return {
      bucket: typeof row.bucket === "string" ? row.bucket : "unknown",
      objects: count(row, "objects"),
      bytes: count(row, "bytes"),
    };
  });
}

function activity(value: unknown): ActivityDay[] {
  return Array.isArray(value)
    ? value.map((item) => {
        const row = object(item);

        return {
          day: typeof row.day === "string" ? row.day : "",
          newUsers: count(row, "new_users"),
          uploads: count(row, "uploads"),
          quizAttempts: count(row, "quiz_attempts"),
          forumPosts: count(row, "forum_posts"),
        };
      })
    : [];
}

export function toSystemOverview(raw: unknown): SystemOverview {
  const root = object(raw);
  const users = object(root.users);
  const sessions = root.sessions === null || root.sessions === undefined ? null : object(root.sessions);
  const storage = object(root.storage);
  const documents = object(root.documents);
  const ai = object(root.ai);
  const community = object(root.community);

  return {
    generatedAt: typeof root.generated_at === "string" ? root.generated_at : new Date().toISOString(),
    users: {
      total: count(users, "total"),
      students: count(users, "students"),
      admins: count(users, "admins"),
      suspended: count(users, "suspended"),
      newLast7Days: count(users, "new_last_7_days"),
      seenLast15Minutes: count(users, "seen_last_15_minutes"),
      seenLast24Hours: count(users, "seen_last_24_hours"),
    },
    sessions: sessions
      ? {
          active: count(sessions, "active"),
          refreshedLastHour: count(sessions, "refreshed_last_hour"),
          usersWithSessions: count(sessions, "users_with_sessions"),
        }
      : null,
    storage: {
      buckets: buckets(storage.buckets),
      documentBytes: count(storage, "document_bytes"),
      quotaBytes: count(storage, "quota_bytes"),
      usersOver80Percent: count(storage, "users_over_80_percent"),
    },
    documents: {
      total: count(documents, "total"),
      ready: count(documents, "ready"),
      processing: count(documents, "processing"),
      failed: count(documents, "failed"),
      uploadedLast24Hours: count(documents, "uploaded_last_24_hours"),
    },
    ai: {
      analysesReady: count(ai, "analyses_ready"),
      analysesFailed: count(ai, "analyses_failed"),
      analysesStuck: count(ai, "analyses_stuck"),
      quizzesReady: count(ai, "quizzes_ready"),
      quizzesFailed: count(ai, "quizzes_failed"),
      quizAttempts: count(ai, "quiz_attempts"),
      quizAttemptsLast24Hours: count(ai, "quiz_attempts_last_24_hours"),
    },
    community: {
      forumThreads: count(community, "forum_threads"),
      forumComments: count(community, "forum_comments"),
      pendingForumReports: count(community, "pending_forum_reports"),
      pendingReports: count(community, "pending_reports"),
      pendingLibraryMaterials: count(community, "pending_library_materials"),
    },
    activity: activity(root.activity),
  };
}

interface HeavyUserRow {
  id: string;
  full_name: string | null;
  username: string | null;
  storage_used_bytes: number | string;
  storage_quota_bytes: number | string;
}

export class SupabaseSystemMonitoringRepository implements SystemMonitoringRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async overview(): Promise<SystemOverview> {
    const { data, error } = await this.supabase.rpc("admin_system_overview");

    if (error) {
      throw new Error(`Unable to load the system overview: ${error.message}`);
    }

    return toSystemOverview(data);
  }

  async heaviestUsers(limit: number): Promise<StorageHeavyUser[]> {
    const { data, error } = await this.supabase.rpc("admin_list_users", {
      p_status: "student",
      p_sort: "storage",
      p_limit: limit,
      p_offset: 0,
    });

    if (error) {
      throw new Error(`Unable to load storage usage: ${error.message}`);
    }

    return ((data ?? []) as HeavyUserRow[])
      .map((row) => ({
        id: row.id,
        name: row.full_name?.trim() || row.username || "Unnamed user",
        usedBytes: Number(row.storage_used_bytes),
        quotaBytes: Number(row.storage_quota_bytes),
      }))
      .filter((user) => user.usedBytes > 0);
  }

  async pingDatabase(): Promise<number> {
    const started = performance.now();
    const { error } = await this.supabase.from("profiles").select("id", { head: true, count: "exact" }).limit(1);

    if (error) {
      throw new Error(error.message);
    }

    return Math.round(performance.now() - started);
  }
}
