import type {
  StudyBuddy,
  StudyBuddyFilters,
  StudyBuddyRemoveOutcome,
  StudyBuddyRequestOutcome,
  StudyBuddyResponseOutcome,
} from "@/models/peers/study-buddy.model";

/** Peer discovery and connections for the signed-in student. */
export interface StudyBuddyRepository {
  /** Ranked recommendations, or search results when filters are set. */
  discover(filters: StudyBuddyFilters, limit: number): Promise<StudyBuddy[]>;
  /** Buddies and pending requests in both directions. */
  listConnections(): Promise<StudyBuddy[]>;
  sendRequest(studentId: string): Promise<StudyBuddyRequestOutcome>;
  respondToRequest(
    requesterId: string,
    accept: boolean,
  ): Promise<StudyBuddyResponseOutcome>;
  /** Cancels a sent request or removes an existing buddy. */
  remove(studentId: string): Promise<StudyBuddyRemoveOutcome>;
}
