import type { ProfileRepository } from "@/interfaces/repositories/profile.repository";
import type { AuthService } from "@/interfaces/services/auth-service.interface";
import { getInitials, type AuthUser } from "@/models/auth/auth.model";
import type { Profile, Viewer } from "@/models/profile/profile.model";

export interface CurrentAccount {
  readonly user: AuthUser;
  readonly profile: Profile;
  readonly viewer: Viewer;
}

/**
 * Resolves the signed-in user together with their profile row. The role is
 * read from the database rather than the session token, so a role change
 * applies on the next request.
 */
export async function loadCurrentAccount(
  auth: AuthService,
  profiles: ProfileRepository,
): Promise<CurrentAccount | null> {
  const user = await auth.getCurrentUser();

  if (!user) {
    return null;
  }

  const profile = await profiles.findById(user.id);

  if (!profile) {
    return null;
  }

  const displayName =
    profile.fullName.trim() ||
    user.fullName.trim() ||
    user.email.split("@")[0] ||
    "Student";

  return {
    user,
    profile,
    viewer: {
      id: user.id,
      email: user.email,
      displayName,
      initials: getInitials(displayName),
      role: profile.role,
    },
  };
}
