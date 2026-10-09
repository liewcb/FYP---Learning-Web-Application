import {
  parseStudyPreferences,
  type StudyPreferences,
  type StudyProfile,
} from "@/models/profile/study-profile.model";

/** Shape of the study keys inside the `profiles.preferences` jsonb column. */
export interface PreferencesJson {
  study_times?: unknown;
  study_mode?: unknown;
  [key: string]: unknown;
}

export function toPreferencesJson(preferences: StudyPreferences): PreferencesJson {
  return {
    study_times: [...preferences.studyTimes],
    study_mode: preferences.studyMode,
  };
}

export function fromPreferencesJson(value: unknown): StudyPreferences {
  const json = (value && typeof value === "object" ? value : {}) as PreferencesJson;

  return parseStudyPreferences({
    studyTimes: json.study_times,
    studyMode: json.study_mode,
  });
}

/** Column values for a study profile, shared by sign-up metadata and updates. */
export function toStudyProfileColumns(profile: StudyProfile) {
  return {
    academic_major: profile.academicMajor,
    year_of_study: profile.yearOfStudy,
    interests: [...profile.interests],
    preferences: toPreferencesJson(profile.preferences),
    is_discoverable: profile.isDiscoverable,
  };
}
