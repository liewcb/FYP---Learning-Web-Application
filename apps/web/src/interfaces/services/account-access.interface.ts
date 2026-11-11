/**
 * Blocks or restores sign-in at the authentication provider, so a suspended
 * student cannot sign in again or refresh an existing session.
 */
export interface AccountAccessService {
  block(userId: string): Promise<void>;
  restore(userId: string): Promise<void>;
}
