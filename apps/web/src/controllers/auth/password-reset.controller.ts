import type { AuthActionResult } from "@/controllers/auth/auth.controller";
import { resolveLoginEmail } from "@/controllers/shared/resolve-login-email";
import type { AuthService } from "@/interfaces/services/auth-service.interface";
import type { LoginAttemptStore } from "@/interfaces/services/login-attempt-store.interface";
import type { UsernameDirectory } from "@/interfaces/services/username-directory.interface";
import { authRoutes } from "@/models/auth/auth-routes";
import { loginAttemptKey } from "@/models/auth/login-attempts.model";
import {
  isWithinRecoveryWindow,
  passwordResetMessages,
  validateIdentifier,
  validateNewPassword,
  type NewPasswordFormState,
  type NewPasswordFormValues,
  type PasswordResetFormState,
} from "@/models/auth/password-reset.model";

export type NewPasswordPage =
  | { readonly status: "ready"; readonly email: string }
  | { readonly status: "expired" };

/**
 * Link-based reset: the email link lands on /auth/confirm, which starts a
 * short recovery session and sends the user to /reset-password.
 */
export class PasswordResetController {
  constructor(
    private readonly auth: AuthService,
    private readonly usernames: UsernameDirectory,
    private readonly attempts: LoginAttemptStore,
  ) {}

  /**
   * Emails a reset link. The reply is the same whether or not the account
   * exists, and the resolved email never leaves the server.
   */
  async requestLink(
    rawIdentifier: string,
    origin: string,
  ): Promise<PasswordResetFormState> {
    const identifier = rawIdentifier.trim();
    const identifierError = validateIdentifier(identifier);

    if (identifierError) {
      return {
        step: "request",
        identifier,
        fieldErrors: { identifier: identifierError },
      };
    }

    try {
      const email = await resolveLoginEmail(this.usernames, identifier);

      if (email) {
        const redirectTo = new URL(authRoutes.confirm, origin);
        redirectTo.searchParams.set("next", authRoutes.resetPassword);

        const outcome = await this.auth.requestPasswordReset(
          email,
          redirectTo.toString(),
        );

        if (outcome.status === "failed") {
          return {
            step: "request",
            identifier,
            error:
              outcome.reason === "rate_limited"
                ? passwordResetMessages.emailRateLimited
                : passwordResetMessages.unavailable,
          };
        }
      }
    } catch (error) {
      console.error("Password reset request failed", error);

      return { step: "request", identifier, error: passwordResetMessages.unavailable };
    }

    return { step: "sent", identifier, notice: passwordResetMessages.linkSent };
  }

  async newPasswordPage(): Promise<NewPasswordPage> {
    const session = await this.auth.getRecoverySession();

    return session && isWithinRecoveryWindow(session, new Date())
      ? { status: "ready", email: session.email }
      : { status: "expired" };
  }

  /**
   * Sets the new password, clears any login lock, then signs out everywhere
   * so the user logs in again with the new password.
   */
  async setNewPassword(
    values: NewPasswordFormValues,
  ): Promise<AuthActionResult<NewPasswordFormState>> {
    const session = await this.auth.getRecoverySession();

    if (!session || !isWithinRecoveryWindow(session, new Date())) {
      return {
        status: "show",
        state: { error: passwordResetMessages.sessionExpired },
      };
    }

    const fieldErrors = validateNewPassword(values);

    if (fieldErrors && Object.keys(fieldErrors).length > 0) {
      return { status: "show", state: { fieldErrors } };
    }

    const outcome = await this.auth.updatePassword(values.password);

    if (outcome.status === "failed") {
      const messages = {
        same_password: { fieldErrors: { password: passwordResetMessages.samePassword } },
        weak_password: { fieldErrors: { password: passwordResetMessages.weakPassword } },
        session_expired: { error: passwordResetMessages.sessionExpired },
        unavailable: { error: passwordResetMessages.unavailable },
      } satisfies Record<typeof outcome.reason, NewPasswordFormState>;

      return { status: "show", state: messages[outcome.reason] };
    }

    try {
      await this.attempts.clear(loginAttemptKey(session.email));
    } catch (error) {
      console.error("Unable to clear failed login attempts", error);
    }

    await this.auth.signOut();

    return {
      status: "redirect",
      to: `${authRoutes.signIn}?notice=password_reset`,
    };
  }
}
