export interface AttemptPolicy {
  readonly maxAttempts: number;
  readonly lockMinutes: number;
}

/** Three wrong passwords lock the account for 15 minutes. */
export const loginAttemptPolicy: AttemptPolicy = {
  maxAttempts: 3,
  lockMinutes: 15,
};

export interface FailedAttemptResult {
  readonly attemptsLeft: number;
  readonly lockedUntil: Date | null;
}

/**
 * Counters are keyed by the account's email when it is known. Unknown
 * usernames are counted too, so they get exactly the same messages as real
 * accounts and the login form cannot reveal which usernames exist.
 */
export function loginAttemptKey(emailOrIdentifier: string): string {
  return `login:${emailOrIdentifier.trim().toLowerCase()}`;
}

export function minutesUntil(until: Date, now: Date): number {
  return Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 60_000));
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function accountLockedMessage(until: Date, now: Date): string {
  return `Too many incorrect attempts. Try again in ${plural(minutesUntil(until, now), "minute")}, or reset your password to unlock your account now.`;
}

export function attemptsLeftMessage(attemptsLeft: number): string {
  return `Incorrect username/email or password. ${plural(attemptsLeft, "attempt")} left before your account is locked.`;
}
