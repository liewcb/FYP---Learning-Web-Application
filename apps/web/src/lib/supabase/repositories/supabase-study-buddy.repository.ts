import type { SupabaseClient } from "@supabase/supabase-js";

import type { StudyBuddyRepository } from "@/interfaces/repositories/study-buddy.repository";
import {
  connectionStatuses,
  studyBuddyInitials,
  type ConnectionStatus,
  type StudyBuddy,
  type StudyBuddyFilters,
  type StudyBuddyRemoveOutcome,
  type StudyBuddyRequestOutcome,
  type StudyBuddyResponseOutcome,
} from "@/models/peers/study-buddy.model";
import { parseStudyPreferences } from "@/models/profile/study-profile.model";

interface StudyBuddyRow {
  id: string;
  full_name: string;
  username: string | null;
  academic_major: string | null;
  year_of_study: number | null;
  bio: string | null;
  interests: string[] | null;
  study_times: string[] | null;
  study_mode: string | null;
  member_since: string;
  match_score: number;
  same_major: boolean;
  year_gap: number | null;
  shared_interests: string[] | null;
  shared_study_times: string[] | null;
  compatible_study_mode: boolean;
  connection_status: string;
}

const requestOutcomes = new Set<StudyBuddyRequestOutcome>([
  "pending",
  "accepted",
  "self",
  "forbidden",
  "unavailable",
  "limit",
  "unauthenticated",
]);
const responseOutcomes = new Set<StudyBuddyResponseOutcome>([
  "accepted",
  "declined",
  "not_found",
  "unauthenticated",
]);
const removeOutcomes = new Set<StudyBuddyRemoveOutcome>([
  "removed",
  "not_found",
  "unauthenticated",
]);

function toConnectionStatus(value: string): ConnectionStatus {
  return (connectionStatuses as readonly string[]).includes(value)
    ? (value as ConnectionStatus)
    : "none";
}

function toStudyBuddy(row: StudyBuddyRow): StudyBuddy {
  // Reuse the profile parser so unknown stored values are dropped consistently.
  const preferences = parseStudyPreferences({
    studyTimes: row.study_times ?? [],
    studyMode: row.study_mode,
  });
  const sharedTimes = parseStudyPreferences({
    studyTimes: row.shared_study_times ?? [],
  }).studyTimes;

  return {
    id: row.id,
    fullName: row.full_name.trim() || row.username || "Student",
    username: row.username,
    initials: studyBuddyInitials(row.full_name, row.username),
    academicMajor: row.academic_major,
    yearOfStudy: row.year_of_study,
    bio: row.bio,
    interests: row.interests ?? [],
    studyTimes: preferences.studyTimes,
    studyMode: preferences.studyMode,
    memberSince: row.member_since,
    matchScore: row.match_score,
    sameMajor: row.same_major,
    yearGap: row.year_gap,
    sharedInterests: row.shared_interests ?? [],
    sharedStudyTimes: sharedTimes,
    compatibleStudyMode: row.compatible_study_mode,
    connectionStatus: toConnectionStatus(row.connection_status),
  };
}

function outcome<T extends string>(value: unknown, allowed: Set<T>, name: string): T {
  if (typeof value === "string" && allowed.has(value as T)) {
    return value as T;
  }

  throw new Error(`Unexpected ${name} result: ${String(value)}`);
}

export class SupabaseStudyBuddyRepository implements StudyBuddyRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async discover(filters: StudyBuddyFilters, limit: number): Promise<StudyBuddy[]> {
    const { data, error } = await this.supabase.rpc("discover_study_buddies", {
      p_username: filters.username || null,
      p_major: filters.major || null,
      p_year: filters.year,
      p_interest: filters.interest || null,
      p_study_mode: filters.studyMode,
      p_limit: limit,
    });

    if (error) {
      throw new Error(`Unable to load study buddies: ${error.message}`);
    }

    return (data as StudyBuddyRow[]).map(toStudyBuddy);
  }

  async listConnections(): Promise<StudyBuddy[]> {
    const { data, error } = await this.supabase.rpc("list_my_study_buddies");

    if (error) {
      throw new Error(`Unable to load study buddy connections: ${error.message}`);
    }

    return (data as StudyBuddyRow[]).map(toStudyBuddy);
  }

  async sendRequest(studentId: string): Promise<StudyBuddyRequestOutcome> {
    const { data, error } = await this.supabase.rpc("send_study_buddy_request", {
      p_addressee: studentId,
    });

    if (error) {
      throw new Error(`Unable to send study buddy request: ${error.message}`);
    }

    return outcome(data, requestOutcomes, "study buddy request");
  }

  async respondToRequest(
    requesterId: string,
    accept: boolean,
  ): Promise<StudyBuddyResponseOutcome> {
    const { data, error } = await this.supabase.rpc(
      "respond_to_study_buddy_request",
      { p_requester: requesterId, p_accept: accept },
    );

    if (error) {
      throw new Error(`Unable to respond to study buddy request: ${error.message}`);
    }

    return outcome(data, responseOutcomes, "study buddy response");
  }

  async remove(studentId: string): Promise<StudyBuddyRemoveOutcome> {
    const { data, error } = await this.supabase.rpc("remove_study_buddy", {
      p_other: studentId,
    });

    if (error) {
      throw new Error(`Unable to update study buddy: ${error.message}`);
    }

    return outcome(data, removeOutcomes, "study buddy removal");
  }
}
