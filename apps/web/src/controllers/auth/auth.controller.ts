import { resolveLoginEmail } from "@/controllers/shared/resolve-login-email";
import type { AuthService } from "@/interfaces/services/auth-service.interface";
import type { LoginAttemptStore } from "@/interfaces/services/login-attempt-store.interface";
import type { UsernameDirectory } from "@/interfaces/services/username-directory.interface";
import { authRoutes, safeRedirectPath } from "@/models/auth/auth-routes";
import {
  authFailureMessages,
  confirmationSentNotice,
  toSignUpEchoValues,
  usernameTakenMessage,
  validateSignIn,
  validateSignUp,
  type AuthUser,
  type EmailConfirmation,
  type SignInFormState,
  type SignInFormValues,
  type SignUpFormState,
  type SignUpFormValues,
  type UsernameCheck,
} from "@/models/auth/auth.model";
import {
  accountLockedMessage,
  attemptsLeftMessage,
  loginAttemptKey,
  loginAttemptPolicy,
} from "@/models/auth/login-attempts.model";
import {
  normaliseUsername,
  validateUsername,
} from "@/models/profile/study-profile.model";

export type AuthActionResult<State> =
  | { readonly status: "redirect"; readonly to: string }
  | { readonly status: "show"; readonly state: State };

export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly usernames: UsernameDirectory,
    private readonly attempts: LoginAttemptStore,
  ) {}

  currentUser(): Promise<AuthUser | null> {
    return this.auth.getCurrentUser();
  }

  async signIn(
    input: SignInFormValues,
    next: unknown,
  ): Promise<AuthActionResult<SignInFormState>> {
    const identifier = input.identifier.trim();
    const values = { identifier };
    const fieldErrors = validateSignIn({ ...input, identifier });

    if (fieldErrors && Object.keys(fieldErrors).length > 0) {
      return { status: "show", state: { fieldErrors, values } };
    }

    let email: string | null;
    let key: string;
    let lockedUntil: Date | null;

    // Fails closed: if the lock cannot be checked, nobody signs in.
    try {
      email = await resolveLoginEmail(this.usernames, identifier);
      key = loginAttemptKey(email ?? identifier);
      lockedUntil = await this.attempts.getLockedUntil(key);
    } catch (error) {
      console.error("Login pre-check failed", error);

      return {
        status: "show",
        state: { error: authFailureMessages.unavailable, values },
      };
    }

    if (lockedUntil) {
      return {
        status: "show",
        state: {
          error: accountLockedMessage(lockedUntil, new Date()),
          locked: true,
          values,
        },
      };
    }

    const outcome = email
      ? await this.auth.signIn({ email, password: input.password })
      : ({ status: "failed", reason: "invalid_credentials" } as const);

    if (outcome.status === "failed") {
      if (outcome.reason === "invalid_credentials") {
        return { status: "show", state: await this.recordFailure(key, values) };
      }

      return {
        status: "show",
        state: { error: authFailureMessages[outcome.reason], values },
      };
    }

    try {
      await this.attempts.clear(key);
    } catch (error) {
      console.error("Unable to clear failed login attempts", error);
    }

    return { status: "redirect", to: safeRedirectPath(next) };
  }

  private async recordFailure(
    key: string,
    values: SignInFormState["values"],
  ): Promise<SignInFormState> {
    try {
      const result = await this.attempts.recordFailure(key, loginAttemptPolicy);

      return result.lockedUntil
        ? {
            error: accountLockedMessage(result.lockedUntil, new Date()),
            locked: true,
            values,
          }
        : { error: attemptsLeftMessage(result.attemptsLeft), values };
    } catch (error) {
      console.error("Unable to record failed login attempt", error);

      return { error: authFailureMessages.invalid_credentials, values };
    }
  }

  async checkUsername(value: string): Promise<UsernameCheck> {
    const username = normaliseUsername(value);
    const error = validateUsername(username, { required: true });

    if (error) {
      return { available: false, message: error };
    }

    const available = await this.isUsernameAvailable(username);

    if (available === null) {
      return {
        available: false,
        message: "We couldn't check this username right now. Please try again.",
      };
    }

    return available
      ? { available: true, message: "Username is available." }
      : { available: false, message: usernameTakenMessage };
  }

  /** Returns null when the check itself fails, e.g. the database is unreachable. */
  private async isUsernameAvailable(username: string): Promise<boolean | null> {
    try {
      return await this.usernames.isAvailable(username);
    } catch (error) {
      console.error("Username availability check failed", error);

      return null;
    }
  }

  async signUp(
    form: SignUpFormValues,
    origin: string,
  ): Promise<AuthActionResult<SignUpFormState>> {
    const values = toSignUpEchoValues(form);
    const validation = validateSignUp(form);

    if (!validation.ok) {
      return {
        status: "show",
        state: { fieldErrors: validation.fieldErrors, values },
      };
    }

    const { input } = validation;

    const available = await this.isUsernameAvailable(input.username);

    if (available === null) {
      return {
        status: "show",
        state: { error: authFailureMessages.unavailable, values },
      };
    }

    if (!available) {
      return {
        status: "show",
        state: { fieldErrors: { username: usernameTakenMessage }, values },
      };
    }

    const outcome = await this.auth.signUp(
      input,
      new URL(authRoutes.confirm, origin).toString(),
    );

    switch (outcome.status) {
      case "signed_in":
        return { status: "redirect", to: authRoutes.home };
      case "confirmation_required":
        return { status: "show", state: { notice: confirmationSentNotice } };
      case "failed":
        // Someone may have taken the username between the check and sign-up,
        // which makes the profile insert fail with a generic database error.
        if (
          outcome.reason === "unavailable" &&
          (await this.isUsernameAvailable(input.username)) === false
        ) {
          return {
            status: "show",
            state: { fieldErrors: { username: usernameTakenMessage }, values },
          };
        }

        return {
          status: "show",
          state: { error: authFailureMessages[outcome.reason], values },
        };
    }
  }

  signOut(): Promise<void> {
    return this.auth.signOut();
  }

  async confirmEmail(
    confirmation: EmailConfirmation | null,
    next: unknown,
  ): Promise<string> {
    const destination = safeRedirectPath(next);

    if (confirmation && (await this.auth.confirmEmail(confirmation))) {
      return destination;
    }

    return destination === authRoutes.resetPassword
      ? `${authRoutes.forgotPassword}?error=link_expired`
      : `${authRoutes.signIn}?error=confirmation_failed`;
  }
}
