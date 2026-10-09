/** Looks up usernames without exposing other users' private data. */
export interface UsernameDirectory {
  /** Expects a normalised (trimmed, lowercase) username. */
  isAvailable(username: string): Promise<boolean>;
  /** Server-only: resolves a username to the email used for login. */
  findLoginEmail(username: string): Promise<string | null>;
}
