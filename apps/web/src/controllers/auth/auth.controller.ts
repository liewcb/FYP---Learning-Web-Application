import type { AuthService } from "@/interfaces/services/auth-service.interface";
import type { UsernameDirectory } from "@/interfaces/services/username-directory.interface";
import { authRoutes, safeRedirectPath } from "@/models/auth/auth-routes";
import {
  authFailureMessages,
  confirmationSentNotice,
  isEmailIdentifier,
  normaliseEmail,
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

    try {
      email = await this.resolveLoginEmail(identifier);
    } catch (error) {
      console.error("Username lookup failed", error);

      return {
        status: "show",
        state: { error: authFailureMessages.unavailable, values },
      };
    }

    const outcome = email
      ? await this.auth.signIn({ email, password: input.password })
      : ({ status: "failed", reason: "invalid_credentials" } as const);

    if (outcome.status === "failed") {
      return {
        status: "show",
        state: { error: authFailureMessages[outcome.reason], values },
      };
    }

    return { status: "redirect", to: safeRedirectPath(next) };
  }

  /**
   * An unknown username gets the same message as a wrong password, so the
   * login form cannot be used to discover which usernames exist.
   */
  private async resolveLoginEmail(identifier: string): Promise<string | null> {
    if (isEmailIdentifier(identifier)) {
      return normaliseEmail(identifier);
    }

    const username = normaliseUsername(identifier);

    if (validateUsername(username, { required: true })) {
      return null;
    }

    return this.usernames.findLoginEmail(username);
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
    if (confirmation && (await this.auth.confirmEmail(confirmation))) {
      return safeRedirectPath(next);
    }

    return `${authRoutes.signIn}?error=confirmation_failed`;
  }
}
