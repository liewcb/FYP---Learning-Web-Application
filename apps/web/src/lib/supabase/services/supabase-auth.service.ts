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
}
