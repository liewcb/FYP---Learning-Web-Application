import type { SupabaseClient } from "@supabase/supabase-js";

import type { LoginAttemptStore } from "@/interfaces/services/login-attempt-store.interface";
import type {
  AttemptPolicy,
  FailedAttemptResult,
} from "@/models/auth/login-attempts.model";

interface FailedAttemptRow {
  attempts_left: number;
  locked_until: string | null;
}

/** Uses server-only database functions, so it needs the service-role client. */
export class SupabaseLoginAttemptStore implements LoginAttemptStore {
  constructor(private readonly createServiceClient: () => SupabaseClient) {}

  async getLockedUntil(key: string): Promise<Date | null> {
    const { data, error } = await this.createServiceClient().rpc("get_login_lock", {
      p_key: key,
    });

    if (error) {
      throw new Error(`Unable to check login lock: ${error.message}`);
    }

    return typeof data === "string" ? new Date(data) : null;
  }

  async recordFailure(
    key: string,
    policy: AttemptPolicy,
  ): Promise<FailedAttemptResult> {
    const { data, error } = await this.createServiceClient()
      .rpc("record_failed_login", {
        p_key: key,
        p_max_attempts: policy.maxAttempts,
        p_lock_minutes: policy.lockMinutes,
      })
      .single();

    if (error) {
      throw new Error(`Unable to record failed attempt: ${error.message}`);
    }

    const row = data as FailedAttemptRow;

    return {
      attemptsLeft: row.attempts_left,
      lockedUntil: row.locked_until ? new Date(row.locked_until) : null,
    };
  }

  async clear(key: string): Promise<void> {
    const { error } = await this.createServiceClient().rpc("clear_failed_logins", {
      p_key: key,
    });

    if (error) {
      throw new Error(`Unable to clear failed attempts: ${error.message}`);
    }
  }
}
