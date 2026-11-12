import type { SupabaseClient } from "@supabase/supabase-js";

import type { SystemReportRepository } from "@/interfaces/repositories/system-report.repository";
import type { ReportActivity } from "@/models/admin/system-report.model";

type Json = Record<string, unknown>;

function object(value: unknown): Json {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Json) : {};
}

function count(source: Json, key: string): number {
  const value = Number(source[key]);

  return Number.isFinite(value) ? value : 0;
}

function nullableCount(source: Json, key: string): number | null {
  return source[key] === null || source[key] === undefined ? null : count(source, key);
}

export function toReportActivity(raw: unknown): ReportActivity {
  const root = object(raw);
  const users = object(root.users);
  const learning = object(root.learning);
  const administration = object(root.administration);
  const storageRequests = object(administration.storage_requests);
  const reports = administration.reports ? object(administration.reports) : null;

  return {
    days: count(root, "days"),
    from: String(root.from ?? ""),
    to: String(root.to ?? ""),
    users: {
      total: count(users, "total"),
      students: count(users, "students"),
      new: count(users, "new"),
      active: count(users, "active"),
      signedIn: nullableCount(users, "signed_in"),
      suspendedNow: count(users, "suspended_now"),
    },
    sessionsStarted: nullableCount(object(root.sessions), "started"),
    learning: {
      documentsUploaded: count(learning, "documents_uploaded"),
      bytesUploaded: count(learning, "bytes_uploaded"),
      documentsFailed: count(learning, "documents_failed"),
      analysesReady: count(learning, "analyses_ready"),
      analysesFailed: count(learning, "analyses_failed"),
      quizzesReady: count(learning, "quizzes_ready"),
      quizzesFailed: count(learning, "quizzes_failed"),
      quizAttempts: count(learning, "quiz_attempts"),
      averageScore: nullableCount(learning, "average_score"),
      forumThreads: count(learning, "forum_threads"),
      forumComments: count(learning, "forum_comments"),
      librarySubmissions: count(learning, "library_submissions"),
      libraryPublished: count(learning, "library_published"),
    },
    daily: (Array.isArray(root.daily) ? root.daily : []).map((item) => {
      const day = object(item);

      return {
        day: String(day.day ?? ""),
        newUsers: count(day, "new_users"),
        uploads: count(day, "uploads"),
        quizAttempts: count(day, "quiz_attempts"),
        forumPosts: count(day, "forum_posts"),
      };
    }),
    topStudents: (Array.isArray(root.top_students) ? root.top_students : []).map((item) => {
      const student = object(item);

      return {
        name: String(student.name ?? "Unknown student"),
        username: typeof student.username === "string" ? student.username : null,
        uploads: count(student, "uploads"),
        quizAttempts: count(student, "quiz_attempts"),
        forumPosts: count(student, "forum_posts"),
        librarySubmissions: count(student, "library_submissions"),
        total: count(student, "total"),
      };
    }),
    administration: {
      actions: Object.fromEntries(
        Object.entries(object(administration.actions)).map(([action, total]) => [action, Number(total) || 0]),
      ),
      storageRequests: {
        submitted: count(storageRequests, "submitted"),
        approved: count(storageRequests, "approved"),
        rejected: count(storageRequests, "rejected"),
        pending: count(storageRequests, "pending"),
        bytesGranted: count(storageRequests, "bytes_granted"),
      },
      reports: reports
        ? { submitted: count(reports, "submitted"), resolved: count(reports, "resolved"), pending: count(reports, "pending") }
        : null,
    },
  };
}

export class SupabaseSystemReportRepository implements SystemReportRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async activity(days: number, record: boolean): Promise<ReportActivity> {
    const { data, error } = await this.supabase.rpc("admin_report_activity", {
      p_days: days,
      p_record: record,
    });

    if (error) {
      throw new Error(`Unable to collect report data: ${error.message}`);
    }

    return toReportActivity(data);
  }
}
