import type {
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

export interface AuthService {
  signUp(input: SignUpInput, emailRedirectTo: string): Promise<SignUpOutcome>;
  signIn(credentials: EmailCredentials): Promise<SignInOutcome>;
  signOut(): Promise<void>;
  getCurrentUser(): Promise<AuthUser | null>;
  confirmEmail(confirmation: EmailConfirmation): Promise<boolean>;

  /** Emails a reset link to the address, if it has an account. */
  requestPasswordReset(email: string, redirectTo: string): Promise<RequestResetOutcome>;
  /** The current session, if it was created by opening a reset link. */
  getRecoverySession(): Promise<RecoverySession | null>;
  updatePassword(password: string): Promise<UpdatePasswordOutcome>;
}
