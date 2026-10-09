import type {
  AuthUser,
  EmailConfirmation,
  EmailCredentials,
  SignInOutcome,
  SignUpInput,
  SignUpOutcome,
} from "@/models/auth/auth.model";

export interface AuthService {
  signUp(input: SignUpInput, emailRedirectTo: string): Promise<SignUpOutcome>;
  signIn(credentials: EmailCredentials): Promise<SignInOutcome>;
  signOut(): Promise<void>;
  getCurrentUser(): Promise<AuthUser | null>;
  confirmEmail(confirmation: EmailConfirmation): Promise<boolean>;
}
