import type {
  AccountSummary,
  Profile,
  ProfileUpdate,
  ProfileUpdateOutcome,
} from "@/models/profile/profile.model";

export interface ProfileRepository {
  findById(id: string): Promise<Profile | null>;
  updateOwn(id: string, update: ProfileUpdate): Promise<ProfileUpdateOutcome>;
  getOwnAccount(): Promise<AccountSummary | null>;
  /** Points the student's profile at a stored picture, or at none. */
  setOwnAvatar(id: string, path: string | null): Promise<void>;
}
