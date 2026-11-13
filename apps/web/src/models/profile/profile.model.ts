import {
  normaliseUsername,
  profileLimits,
  toStudyProfileFormValues,
  validateFullName,
  validateStudyProfile,
  validateUsername,
  type StudyPreferences,
  type StudyProfile,
  type StudyProfileErrors,
  type StudyProfileFormValues,
} from "@/models/profile/study-profile.model";

export const userRoles = ["student", "admin"] as const;

export type UserRole = (typeof userRoles)[number];

export type AccountStatus = "active" | "suspended";

export interface Profile {
  readonly id: string;
  readonly fullName: string;
  readonly username: string | null;
  readonly academicMajor: string | null;
  readonly yearOfStudy: number | null;
  readonly bio: string | null;
  readonly avatarPath: string | null;
  readonly role: UserRole;
  readonly interests: readonly string[];
  readonly isDiscoverable: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The signed-in person, as shown in navigation and headers. */
export interface Viewer {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly initials: string;
  /** Link to their profile picture, or null to show initials. */
  readonly avatarUrl: string | null;
  readonly role: UserRole;
}

/** Owner-only account fields, read through get_my_account(). */
export interface AccountSummary {
  readonly status: AccountStatus;
  readonly suspendedAt: string | null;
  readonly suspensionReason: string | null;
  readonly storageQuotaBytes: number;
  readonly storageUsedBytes: number;
  readonly preferences: StudyPreferences;
}

export interface ProfilePageModel {
  readonly viewer: Viewer;
  readonly profile: Profile;
  readonly account: AccountSummary | null;
  readonly formValues: ProfileFormValues;
}

export interface ProfileUpdate extends StudyProfile {
  readonly fullName: string;
  readonly username: string | null;
  readonly bio: string | null;
}

export type ProfileUpdateOutcome =
  | { readonly status: "saved" }
  | { readonly status: "failed"; readonly reason: "username_taken" | "unavailable" };

/** Raw values submitted by the profile form. */
export interface ProfileFormValues extends StudyProfileFormValues {
  readonly fullName: string;
  readonly username: string;
  readonly bio: string;
}

export type ProfileFieldErrors = StudyProfileErrors &
  Partial<Record<"fullName" | "username" | "bio", string>>;

export interface ProfileFormState {
  readonly error?: string;
  readonly notice?: string;
  readonly fieldErrors?: ProfileFieldErrors;
  readonly values?: ProfileFormValues;
}

export function toProfileFormValues(profile: ProfileUpdate): ProfileFormValues {
  return {
    ...toStudyProfileFormValues(profile),
    fullName: profile.fullName,
    username: profile.username ?? "",
    bio: profile.bio ?? "",
  };
}

export type ProfileValidationResult =
  | { readonly ok: true; readonly update: ProfileUpdate }
  | { readonly ok: false; readonly fieldErrors: ProfileFieldErrors };

export function validateProfileForm(
  values: ProfileFormValues,
): ProfileValidationResult {
  const username = normaliseUsername(values.username);
  const bio = values.bio.trim() || null;
  const study = validateStudyProfile(values);
  const fieldErrors: ProfileFieldErrors = study.ok ? {} : { ...study.fieldErrors };

  const fullNameError = validateFullName(values.fullName);
  const usernameError = validateUsername(username, { required: false });

  if (fullNameError) {
    fieldErrors.fullName = fullNameError;
  }

  if (usernameError) {
    fieldErrors.username = usernameError;
  }

  if (bio && bio.length > profileLimits.bioMax) {
    fieldErrors.bio = `Bio must be ${profileLimits.bioMax} characters or fewer.`;
  }

  if (!study.ok || Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    update: {
      ...study.value,
      fullName: values.fullName.trim(),
      username: username || null,
      bio,
    },
  };
}

export const profileUpdateMessages = {
  saved: "Your profile has been saved.",
  username_taken: "That username is already taken. Try another one.",
  unavailable: "Your profile could not be saved. Please try again.",
} as const;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

export function storageUsagePercent(account: AccountSummary): number {
  if (account.storageQuotaBytes <= 0) {
    return 0;
  }

  return Math.min(
    100,
    Math.round((account.storageUsedBytes / account.storageQuotaBytes) * 100),
  );
}
