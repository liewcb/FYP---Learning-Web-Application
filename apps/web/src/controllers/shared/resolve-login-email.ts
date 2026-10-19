import type { UsernameDirectory } from "@/interfaces/services/username-directory.interface";
import { isEmailIdentifier, normaliseEmail } from "@/models/auth/auth.model";
import {
  normaliseUsername,
  validateUsername,
} from "@/models/profile/study-profile.model";

/**
 * Turns what the user typed (username or email) into the account email.
 * Returns null for a username that does not exist; callers must treat that
 * exactly like a wrong password so usernames cannot be discovered.
 */
export async function resolveLoginEmail(
  usernames: UsernameDirectory,
  identifier: string,
): Promise<string | null> {
  if (isEmailIdentifier(identifier)) {
    return normaliseEmail(identifier);
  }

  const username = normaliseUsername(identifier);

  if (validateUsername(username, { required: true })) {
    return null;
  }

  return usernames.findLoginEmail(username);
}
