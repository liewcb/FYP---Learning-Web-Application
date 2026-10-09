/**
 * Shared profile rules used by both sign-up and the profile page, so the two
 * forms can never disagree about what is valid.
 */

export const studyTimeOptions = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
  { value: "late_night", label: "Late night" },
] as const;

export type StudyTime = (typeof studyTimeOptions)[number]["value"];

export const studyModeOptions = [
  { value: "online", label: "Online" },
  { value: "in_person", label: "In person" },
  { value: "either", label: "Either" },
] as const;

export type StudyMode = (typeof studyModeOptions)[number]["value"];

export interface StudyPreferences {
  readonly studyTimes: readonly StudyTime[];
  readonly studyMode: StudyMode | null;
}

export const emptyStudyPreferences: StudyPreferences = {
  studyTimes: [],
  studyMode: null,
};

/** Validated study profile, ready to store. */
export interface StudyProfile {
  readonly academicMajor: string | null;
  readonly yearOfStudy: number | null;
  readonly interests: readonly string[];
  readonly preferences: StudyPreferences;
  readonly isDiscoverable: boolean;
}

/** Raw values submitted by a form. */
export interface StudyProfileFormValues {
  readonly academicMajor: string;
  readonly yearOfStudy: string;
  readonly interests: string;
  readonly studyTimes: readonly string[];
  readonly studyMode: string;
  readonly isDiscoverable: boolean;
}

export type StudyProfileField =
  | "academicMajor"
  | "yearOfStudy"
  | "interests"
  | "studyTimes"
  | "studyMode";

export type StudyProfileErrors = Partial<Record<StudyProfileField, string>>;

export const profileLimits = {
  fullNameMin: 2,
  fullNameMax: 120,
  usernameMin: 3,
  usernameMax: 30,
  majorMax: 120,
  bioMax: 500,
  interestsMax: 20,
  interestLengthMax: 40,
  yearOfStudyMin: 1,
  yearOfStudyMax: 6,
} as const;

export const usernamePattern = /^[a-z0-9_]{3,30}$/;

/** Names that would let a student impersonate staff or the platform. */
const reservedUsernames = new Set([
  "admin",
  "administrator",
  "moderator",
  "support",
  "system",
  "root",
  "learntogether",
]);

const studyTimeValues = new Set<string>(studyTimeOptions.map((o) => o.value));
const studyModeValues = new Set<string>(studyModeOptions.map((o) => o.value));

export function normaliseUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function validateFullName(value: string): string | undefined {
  const name = value.trim();

  if (name.length < profileLimits.fullNameMin) {
    return "Enter your full name.";
  }

  if (name.length > profileLimits.fullNameMax) {
    return `Name must be ${profileLimits.fullNameMax} characters or fewer.`;
  }

  return undefined;
}

/** Expects a normalised username. Returns an error message, if any. */
export function validateUsername(
  username: string,
  { required }: { required: boolean },
): string | undefined {
  if (!username) {
    return required ? "Choose a username." : undefined;
  }

  if (!usernamePattern.test(username)) {
    return "Use 3–30 lowercase letters, numbers or underscores.";
  }

  if (reservedUsernames.has(username)) {
    return "That username is reserved. Please choose another.";
  }

  return undefined;
}

export function parseInterests(value: string): string[] {
  const seen = new Set<string>();
  const interests: string[] = [];

  for (const part of value.split(",")) {
    const interest = part.trim().replace(/\s+/g, " ");
    const key = interest.toLowerCase();

    if (interest && !seen.has(key)) {
      seen.add(key);
      interests.push(interest);
    }
  }

  return interests;
}

/** Reads stored preferences defensively; unknown values are dropped. */
export function parseStudyPreferences(value: {
  studyTimes?: unknown;
  studyMode?: unknown;
}): StudyPreferences {
  const studyTimes = Array.isArray(value.studyTimes)
    ? value.studyTimes.filter(
        (time): time is StudyTime =>
          typeof time === "string" && studyTimeValues.has(time),
      )
    : [];
  const studyMode =
    typeof value.studyMode === "string" && studyModeValues.has(value.studyMode)
      ? (value.studyMode as StudyMode)
      : null;

  return { studyTimes, studyMode };
}

export function toStudyProfileFormValues(
  profile: StudyProfile,
): StudyProfileFormValues {
  return {
    academicMajor: profile.academicMajor ?? "",
    yearOfStudy: profile.yearOfStudy?.toString() ?? "",
    interests: profile.interests.join(", "),
    studyTimes: profile.preferences.studyTimes,
    studyMode: profile.preferences.studyMode ?? "",
    isDiscoverable: profile.isDiscoverable,
  };
}

export const emptyStudyProfileFormValues: StudyProfileFormValues = {
  academicMajor: "",
  yearOfStudy: "",
  interests: "",
  studyTimes: [],
  studyMode: "",
  isDiscoverable: true,
};

export type StudyProfileValidation =
  | { readonly ok: true; readonly value: StudyProfile }
  | { readonly ok: false; readonly fieldErrors: StudyProfileErrors };

export function validateStudyProfile(
  values: StudyProfileFormValues,
): StudyProfileValidation {
  const fieldErrors: StudyProfileErrors = {};
  const academicMajor = values.academicMajor.trim() || null;
  const interests = parseInterests(values.interests);
  let yearOfStudy: number | null = null;

  if (academicMajor && academicMajor.length > profileLimits.majorMax) {
    fieldErrors.academicMajor = `Major must be ${profileLimits.majorMax} characters or fewer.`;
  }

  if (values.yearOfStudy.trim()) {
    const year = Number(values.yearOfStudy);

    if (
      !Number.isInteger(year) ||
      year < profileLimits.yearOfStudyMin ||
      year > profileLimits.yearOfStudyMax
    ) {
      fieldErrors.yearOfStudy = "Choose a year between 1 and 6.";
    } else {
      yearOfStudy = year;
    }
  }

  if (interests.length > profileLimits.interestsMax) {
    fieldErrors.interests = `Add up to ${profileLimits.interestsMax} interests.`;
  } else if (
    interests.some((interest) => interest.length > profileLimits.interestLengthMax)
  ) {
    fieldErrors.interests = `Keep each interest under ${profileLimits.interestLengthMax} characters.`;
  }

  if (values.studyTimes.some((time) => !studyTimeValues.has(time))) {
    fieldErrors.studyTimes = "Choose from the listed study times.";
  }

  if (values.studyMode && !studyModeValues.has(values.studyMode)) {
    fieldErrors.studyMode = "Choose a study mode from the list.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    value: {
      academicMajor,
      yearOfStudy,
      interests,
      preferences: parseStudyPreferences({
        studyTimes: [...new Set(values.studyTimes)],
        studyMode: values.studyMode,
      }),
      isDiscoverable: values.isDiscoverable,
    },
  };
}
