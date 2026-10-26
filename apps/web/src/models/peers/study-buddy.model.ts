import { getInitials } from "@/models/auth/auth.model";
import {
  profileLimits,
  studyModeOptions,
  studyTimeOptions,
  type StudyMode,
  type StudyTime,
} from "@/models/profile/study-profile.model";

export const connectionStatuses = [
  "none",
  "pending_sent",
  "pending_received",
  "accepted",
] as const;

export type ConnectionStatus = (typeof connectionStatuses)[number];

export const studyBuddyTabs = ["discover", "requests", "buddies"] as const;

export type StudyBuddyTab = (typeof studyBuddyTabs)[number];

/** Another student as shown on a study-buddy card and profile card. */
export interface StudyBuddy {
  readonly id: string;
  readonly fullName: string;
  readonly username: string | null;
  readonly initials: string;
  readonly academicMajor: string | null;
  readonly yearOfStudy: number | null;
  readonly bio: string | null;
  readonly interests: readonly string[];
  readonly studyTimes: readonly StudyTime[];
  readonly studyMode: StudyMode | null;
  readonly memberSince: string;
  /** 0-100; see the scoring rules in the study_buddy_connections migration. */
  readonly matchScore: number;
  readonly sameMajor: boolean;
  readonly yearGap: number | null;
  readonly sharedInterests: readonly string[];
  readonly sharedStudyTimes: readonly StudyTime[];
  readonly compatibleStudyMode: boolean;
  readonly connectionStatus: ConnectionStatus;
}

export interface StudyBuddyFilters {
  readonly username: string;
  readonly major: string;
  readonly year: number | null;
  readonly interest: string;
  readonly studyMode: StudyMode | null;
}

export const emptyStudyBuddyFilters: StudyBuddyFilters = {
  username: "",
  major: "",
  year: null,
  interest: "",
  studyMode: null,
};

export const studyBuddyLimits = {
  resultsPerPage: 24,
  searchMaxLength: 60,
} as const;

export const studyBuddyActionIntents = [
  "add",
  "accept",
  "decline",
  "cancel",
  "remove",
] as const;

export type StudyBuddyActionIntent = (typeof studyBuddyActionIntents)[number];

/** Outcomes returned by the study-buddy database functions. */
export type StudyBuddyRequestOutcome =
  | "pending"
  | "accepted"
  | "self"
  | "forbidden"
  | "unavailable"
  | "limit"
  | "unauthenticated";

export type StudyBuddyResponseOutcome =
  | "accepted"
  | "declined"
  | "not_found"
  | "unauthenticated";

export type StudyBuddyRemoveOutcome = "removed" | "not_found" | "unauthenticated";

export interface StudyBuddyActionState {
  readonly error?: string;
  readonly notice?: string;
}

export interface StudyBuddyPageModel {
  readonly tab: StudyBuddyTab;
  readonly filters: StudyBuddyFilters;
  readonly isSearching: boolean;
  readonly discover: readonly StudyBuddy[];
  readonly incoming: readonly StudyBuddy[];
  readonly outgoing: readonly StudyBuddy[];
  readonly buddies: readonly StudyBuddy[];
  /** Missing parts of the viewer's own profile that would improve matches. */
  readonly missingProfileFields: readonly string[];
}

type SearchParamValue = string | string[] | undefined;

function firstValue(value: SearchParamValue): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function clip(value: string): string {
  return value.slice(0, studyBuddyLimits.searchMaxLength);
}

export function parseStudyBuddyTab(value: SearchParamValue): StudyBuddyTab {
  const tab = firstValue(value);

  return (studyBuddyTabs as readonly string[]).includes(tab)
    ? (tab as StudyBuddyTab)
    : "discover";
}

export function parseStudyBuddyFilters(params: {
  readonly q?: SearchParamValue;
  readonly major?: SearchParamValue;
  readonly year?: SearchParamValue;
  readonly interest?: SearchParamValue;
  readonly mode?: SearchParamValue;
}): StudyBuddyFilters {
  const year = Number(firstValue(params.year));
  const mode = firstValue(params.mode);

  return {
    username: clip(firstValue(params.q).replace(/^@/, "").toLowerCase()),
    major: clip(firstValue(params.major)),
    year:
      Number.isInteger(year) &&
      year >= profileLimits.yearOfStudyMin &&
      year <= profileLimits.yearOfStudyMax
        ? year
        : null,
    interest: clip(firstValue(params.interest)),
    studyMode: studyModeOptions.some((option) => option.value === mode)
      ? (mode as StudyMode)
      : null,
  };
}

export function hasActiveFilters(filters: StudyBuddyFilters): boolean {
  return Boolean(
    filters.username ||
      filters.major ||
      filters.year !== null ||
      filters.interest ||
      filters.studyMode,
  );
}

export function isStudyBuddyActionIntent(
  value: string,
): value is StudyBuddyActionIntent {
  return (studyBuddyActionIntents as readonly string[]).includes(value);
}

export function studyBuddyInitials(fullName: string, username: string | null): string {
  return getInitials(fullName || username || "", "SB");
}

const studyTimeLabels = new Map<string, string>(
  studyTimeOptions.map((option) => [option.value, option.label]),
);
const studyModeLabels = new Map<string, string>(
  studyModeOptions.map((option) => [option.value, option.label]),
);

export function studyTimeLabel(time: StudyTime): string {
  return studyTimeLabels.get(time) ?? time;
}

export function studyModeLabel(mode: StudyMode): string {
  return studyModeLabels.get(mode) ?? mode;
}

/** Short, human explanations of why a student was recommended. */
export function matchReasons(buddy: StudyBuddy): string[] {
  const reasons: string[] = [];

  if (buddy.sameMajor) {
    reasons.push("Same major");
  }

  if (buddy.yearGap === 0) {
    reasons.push("Same year");
  } else if (buddy.yearGap === 1) {
    reasons.push("One year apart");
  }

  if (buddy.sharedInterests.length > 0) {
    const count = buddy.sharedInterests.length;
    reasons.push(`${count} shared interest${count === 1 ? "" : "s"}`);
  }

  if (buddy.sharedStudyTimes.length > 0) {
    reasons.push(`Both study in the ${studyTimeLabel(buddy.sharedStudyTimes[0]!).toLowerCase()}`);
  }

  if (buddy.compatibleStudyMode) {
    reasons.push("Compatible study style");
  }

  return reasons;
}

export function missingProfileFields(profile: {
  readonly academicMajor: string | null;
  readonly yearOfStudy: number | null;
  readonly interests: readonly string[];
}): string[] {
  const missing: string[] = [];

  if (!profile.academicMajor) {
    missing.push("major");
  }

  if (profile.yearOfStudy === null) {
    missing.push("year of study");
  }

  if (profile.interests.length === 0) {
    missing.push("learning interests");
  }

  return missing;
}

const requestMessages: Record<StudyBuddyRequestOutcome, StudyBuddyActionState> = {
  pending: { notice: "Study buddy request sent." },
  accepted: { notice: "You are now study buddies." },
  self: { error: "You cannot add yourself." },
  forbidden: { error: "Only student accounts can add study buddies." },
  unavailable: { error: "This student is no longer available as a study buddy." },
  limit: {
    error: "You have too many pending requests. Wait for replies or cancel some first.",
  },
  unauthenticated: { error: "Your session expired. Sign in and try again." },
};

const responseMessages: Record<StudyBuddyResponseOutcome, StudyBuddyActionState> = {
  accepted: { notice: "You are now study buddies." },
  declined: { notice: "Request declined." },
  not_found: { error: "This request is no longer pending." },
  unauthenticated: { error: "Your session expired. Sign in and try again." },
};

const removeMessages: Record<StudyBuddyRemoveOutcome, StudyBuddyActionState> = {
  removed: { notice: "Done." },
  not_found: { error: "This connection no longer exists." },
  unauthenticated: { error: "Your session expired. Sign in and try again." },
};

export function requestOutcomeState(outcome: StudyBuddyRequestOutcome): StudyBuddyActionState {
  return requestMessages[outcome];
}

export function responseOutcomeState(outcome: StudyBuddyResponseOutcome): StudyBuddyActionState {
  return responseMessages[outcome];
}

export function removeOutcomeState(outcome: StudyBuddyRemoveOutcome): StudyBuddyActionState {
  return removeMessages[outcome];
}
