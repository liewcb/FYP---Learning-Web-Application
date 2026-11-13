import type { SupabaseClient } from "@supabase/supabase-js";

import type { ProfileRepository } from "@/interfaces/repositories/profile.repository";
import {
  fromPreferencesJson,
  toStudyProfileColumns,
} from "@/lib/supabase/mappers/study-profile.mapper";
import type {
  AccountStatus,
  AccountSummary,
  Profile,
  ProfileUpdate,
  ProfileUpdateOutcome,
  UserRole,
} from "@/models/profile/profile.model";

// Only columns granted to `authenticated`; private fields come from get_my_account().
const profileColumns =
  "id, full_name, username, academic_major, year_of_study, bio, avatar_path, role, interests, is_discoverable, created_at, updated_at";

interface ProfileRow {
  id: string;
  full_name: string;
  username: string | null;
  academic_major: string | null;
  year_of_study: number | null;
  bio: string | null;
  avatar_path: string | null;
  role: UserRole;
  interests: string[];
  is_discoverable: boolean;
  created_at: string;
  updated_at: string;
}

interface AccountRow {
  account_status: AccountStatus;
  suspended_at: string | null;
  suspension_reason: string | null;
  storage_quota_bytes: number;
  storage_used_bytes: number;
  preferences: unknown;
}

const uniqueViolation = "23505";

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    fullName: row.full_name,
    username: row.username,
    academicMajor: row.academic_major,
    yearOfStudy: row.year_of_study,
    bio: row.bio,
    avatarPath: row.avatar_path,
    role: row.role,
    interests: row.interests,
    isDiscoverable: row.is_discoverable,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SupabaseProfileRepository implements ProfileRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findById(id: string): Promise<Profile | null> {
    const { data, error } = await this.supabase
      .from("profiles")
      .select(profileColumns)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to load profile: ${error.message}`);
    }

    return data ? toProfile(data as ProfileRow) : null;
  }

  async updateOwn(
    id: string,
    update: ProfileUpdate,
  ): Promise<ProfileUpdateOutcome> {
    const { error } = await this.supabase
      .from("profiles")
      .update({
        ...toStudyProfileColumns(update),
        full_name: update.fullName,
        username: update.username,
        bio: update.bio,
      })
      .eq("id", id);

    if (!error) {
      return { status: "saved" };
    }

    if (error.code === uniqueViolation) {
      return { status: "failed", reason: "username_taken" };
    }

    console.error("Profile update failed", error);

    return { status: "failed", reason: "unavailable" };
  }

  async setOwnAvatar(id: string, path: string | null): Promise<void> {
    const { error } = await this.supabase.from("profiles").update({ avatar_path: path }).eq("id", id);

    if (error) {
      throw new Error(`Unable to save profile picture: ${error.message}`);
    }
  }

  async getOwnAccount(): Promise<AccountSummary | null> {
    const { data, error } = await this.supabase
      .rpc("get_my_account")
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to load account details: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    const row = data as AccountRow;

    return {
      status: row.account_status,
      suspendedAt: row.suspended_at,
      suspensionReason: row.suspension_reason,
      storageQuotaBytes: Number(row.storage_quota_bytes),
      storageUsedBytes: Number(row.storage_used_bytes),
      preferences: fromPreferencesJson(row.preferences),
    };
  }
}
