import type { AuthError, SupabaseClient } from "@supabase/supabase-js";

import type { AuthService } from "@/interfaces/services/auth-service.interface";
import { toStudyProfileColumns } from "@/lib/supabase/mappers/study-profile.mapper";
import type {
  AuthFailureReason,
  AuthUser,
  EmailConfirmation,
  EmailCredentials,
  SignInOutcome,
  SignUpInput,
  SignUpOutcome,
} from "@/models/auth/auth.model";
import type {
  RecoverySession,
  RequestResetOutcome,
  UpdatePasswordOutcome,
} from "@/models/auth/password-reset.model";

const failureReasonsByCode: Record<string, AuthFailureReason> = {
  invalid_credentials: "invalid_credentials",
  email_not_confirmed: "email_not_confirmed",
  user_banned: "account_suspended",
  user_already_exists: "email_taken",
  email_exists: "email_taken",
  email_address_invalid: "invalid_email",
  weak_password: "weak_password",
  over_request_rate_limit: "rate_limited",
  over_email_send_rate_limit: "email_rate_limited",
  signup_disabled: "signup_disabled",
};

function toFailureReason(error: AuthError): AuthFailureReason {
  return (error.code && failureReasonsByCode[error.code]) || "unavailable";
}

const rateLimitCodes = new Set(["over_request_rate_limit", "over_email_send_rate_limit"]);

/** Sign-in methods that prove the user just opened a reset email. */
const recoveryMethods = new Set(["recovery", "otp", "magiclink"]);

export class SupabaseAuthService implements AuthService {
  constructor(private readonly supabase: SupabaseClient) {}

  async signUp(
    input: SignUpInput,
    emailRedirectTo: string,
  ): Promise<SignUpOutcome> {
    const { data, error } = await this.supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        emailRedirectTo,
        // Copied into public.profiles by the handle_new_user trigger, because
        // there is no session to write the profile with until email confirmation.
        data: {
          full_name: input.fullName,
          username: input.username,
          ...toStudyProfileColumns(input.studyProfile),
        },
      },
    });

    if (error) {
      return { status: "failed", reason: toFailureReason(error) };
    }

    // With email confirmation enabled, Supabase returns a user but no session.
    // For an already-registered email it also returns no session, so the
    // response does not reveal which emails have accounts.
    return data.session
      ? { status: "signed_in" }
      : { status: "confirmation_required" };
  }

  async signIn(credentials: EmailCredentials): Promise<SignInOutcome> {
    const { error } = await this.supabase.auth.signInWithPassword(credentials);

    if (error) {
      return { status: "failed", reason: toFailureReason(error) };
    }

    return { status: "signed_in" };
  }

  async signOut(): Promise<void> {
    const { error } = await this.supabase.auth.signOut();

    if (error) {
      throw new Error(`Unable to sign out: ${error.message}`);
    }
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    // getClaims verifies the JWT signature, unlike getSession which trusts
    // whatever is in the cookie.
    const { data, error } = await this.supabase.auth.getClaims();

    if (error || !data?.claims) {
      return null;
    }

    const { claims } = data;
    const metadata = (claims.user_metadata ?? {}) as Record<string, unknown>;

    return {
      id: claims.sub,
      email: typeof claims.email === "string" ? claims.email : "",
      fullName:
        typeof metadata.full_name === "string" ? metadata.full_name : "",
    };
  }

  async confirmEmail(confirmation: EmailConfirmation): Promise<boolean> {
    const { error } =
      "code" in confirmation
        ? await this.supabase.auth.exchangeCodeForSession(confirmation.code)
        : await this.supabase.auth.verifyOtp({
            token_hash: confirmation.tokenHash,
            type: confirmation.type,
          });

    return !error;
  }

  async requestPasswordReset(
    email: string,
    redirectTo: string,
  ): Promise<RequestResetOutcome> {
    // The emailed link lands on /auth/confirm, which starts a recovery
    // session and forwards to the "set a new password" page.
    const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (!error) {
      return { status: "sent" };
    }

    if (error.code && rateLimitCodes.has(error.code)) {
      return { status: "failed", reason: "rate_limited" };
    }

    console.error("Password reset request failed", error);

    return { status: "failed", reason: "unavailable" };
  }

  async getRecoverySession(): Promise<RecoverySession | null> {
    const { data, error } = await this.supabase.auth.getClaims();

    if (error || !data?.claims || typeof data.claims.email !== "string") {
      return null;
    }

    let latest: number | null = null;

    for (const entry of data.claims.amr ?? []) {
      if (
        typeof entry === "object" &&
        recoveryMethods.has(entry.method) &&
        typeof entry.timestamp === "number" &&
        (latest === null || entry.timestamp > latest)
      ) {
        latest = entry.timestamp;
      }
    }

    return latest === null
      ? null
      : { email: data.claims.email, verifiedAt: new Date(latest * 1000) };
  }

  async updatePassword(password: string): Promise<UpdatePasswordOutcome> {
    const { error } = await this.supabase.auth.updateUser({ password });

    if (!error) {
      return { status: "updated" };
    }

    switch (error.code) {
      case "same_password":
        return { status: "failed", reason: "same_password" };
      case "weak_password":
        return { status: "failed", reason: "weak_password" };
      case "session_not_found":
      case "session_expired":
      case "reauthentication_needed":
        return { status: "failed", reason: "session_expired" };
      default:
        console.error("Password update failed", error);

        return { status: "failed", reason: "unavailable" };
    }
  }
}
