import type {
  AttemptPolicy,
  FailedAttemptResult,
} from "@/models/auth/login-attempts.model";

/** Server-side counters of failed attempts, keyed per account. */
export interface LoginAttemptStore {
  /** Returns when the key is locked until, or null if it is not locked. */
  getLockedUntil(key: string): Promise<Date | null>;
  recordFailure(key: string, policy: AttemptPolicy): Promise<FailedAttemptResult>;
  clear(key: string): Promise<void>;
}
