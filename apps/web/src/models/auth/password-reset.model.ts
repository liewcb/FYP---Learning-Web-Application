import { validatePassword } from "@/models/auth/auth.model";

export const passwordResetPolicy = {
  /** How long after opening the reset link the new password may be set. */
  recoveryWindowMinutes: 15,
} as const;

export type PasswordResetStep = "request" | "sent";

export interface PasswordResetFormState {
  readonly step: PasswordResetStep;
  readonly identifier?: string;
  readonly error?: string;
  readonly notice?: string;
  readonly fieldErrors?: Partial<Record<"identifier", string>>;
}

export const initialPasswordResetState: PasswordResetFormState = {
  step: "request",
};

export interface NewPasswordFormValues {
  readonly password: string;
  readonly confirmPassword: string;
}

export interface NewPasswordFormState {
  readonly error?: string;
  readonly fieldErrors?: Partial<Record<keyof NewPasswordFormValues, string>>;
}

export type RequestResetOutcome =
  | { readonly status: "sent" }
  | { readonly status: "failed"; readonly reason: "rate_limited" | "unavailable" };

export type UpdatePasswordOutcome =
  | { readonly status: "updated" }
  | {
      readonly status: "failed";
      readonly reason: "same_password" | "weak_password" | "session_expired" | "unavailable";
    };

/** A session that was created by opening a password reset link. */
export interface RecoverySession {
  readonly email: string;
  readonly verifiedAt: Date;
}

export const passwordResetMessages = {
  linkSent:
    "If an account matches, we've emailed it a password reset link. It may take a minute to arrive — check your spam folder too.",
  linkExpired:
    "That password reset link is invalid or has expired. Please request a new one.",
  emailRateLimited:
    "Too many emails have been sent recently. Please wait a few minutes before requesting another link.",
  sessionExpired:
    "Your password reset session has expired. Please request a new reset link.",
  samePassword: "Your new password must be different from your current one.",
  weakPassword: "Please choose a stronger password.",
  unavailable: "Something went wrong. Please try again.",
  passwordUpdated: "Your password has been updated. Log in with your new password.",
} as const;

export function validateIdentifier(identifier: string): string | undefined {
  return identifier.trim() ? undefined : "Enter your username or email.";
}

export function validateNewPassword(
  values: NewPasswordFormValues,
): NewPasswordFormState["fieldErrors"] {
  const errors: NonNullable<NewPasswordFormState["fieldErrors"]> = {};
  const passwordError = validatePassword(values.password);

  if (passwordError) {
    errors.password = passwordError;
  }

  if (!values.confirmPassword) {
    errors.confirmPassword = "Confirm your new password.";
  } else if (values.confirmPassword !== values.password) {
    errors.confirmPassword = "Passwords do not match.";
  }

  return errors;
}

export function isWithinRecoveryWindow(session: RecoverySession, now: Date): boolean {
  const ageMs = now.getTime() - session.verifiedAt.getTime();

  return ageMs >= 0 && ageMs <= passwordResetPolicy.recoveryWindowMinutes * 60_000;
}
