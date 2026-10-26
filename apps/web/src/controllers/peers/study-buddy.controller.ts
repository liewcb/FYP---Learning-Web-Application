import type { ProfileRepository } from "@/interfaces/repositories/profile.repository";
import type { StudyBuddyRepository } from "@/interfaces/repositories/study-buddy.repository";
import {
  hasActiveFilters,
  missingProfileFields,
  removeOutcomeState,
  requestOutcomeState,
  responseOutcomeState,
  studyBuddyLimits,
  type StudyBuddyActionIntent,
  type StudyBuddyActionState,
  type StudyBuddyFilters,
  type StudyBuddyPageModel,
  type StudyBuddyTab,
} from "@/models/peers/study-buddy.model";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class StudyBuddyController {
  constructor(
    private readonly buddies: StudyBuddyRepository,
    private readonly profiles: ProfileRepository,
  ) {}

  async loadPage(input: {
    readonly viewerId: string;
    readonly tab: StudyBuddyTab;
    readonly filters: StudyBuddyFilters;
  }): Promise<StudyBuddyPageModel> {
    const [discover, connections, profile] = await Promise.all([
      input.tab === "discover"
        ? this.buddies.discover(input.filters, studyBuddyLimits.resultsPerPage)
        : Promise.resolve([]),
      this.buddies.listConnections(),
      this.profiles.findById(input.viewerId),
    ]);

    return {
      tab: input.tab,
      filters: input.filters,
      isSearching: hasActiveFilters(input.filters),
      discover,
      incoming: connections.filter(
        (buddy) => buddy.connectionStatus === "pending_received",
      ),
      outgoing: connections.filter(
        (buddy) => buddy.connectionStatus === "pending_sent",
      ),
      buddies: connections.filter((buddy) => buddy.connectionStatus === "accepted"),
      missingProfileFields: profile ? missingProfileFields(profile) : [],
    };
  }

  async act(
    intent: StudyBuddyActionIntent,
    studentId: string,
  ): Promise<StudyBuddyActionState> {
    if (!uuidPattern.test(studentId)) {
      return { error: "This student could not be found." };
    }

    try {
      switch (intent) {
        case "add":
          return requestOutcomeState(await this.buddies.sendRequest(studentId));
        case "accept":
          return responseOutcomeState(
            await this.buddies.respondToRequest(studentId, true),
          );
        case "decline":
          return responseOutcomeState(
            await this.buddies.respondToRequest(studentId, false),
          );
        case "cancel": {
          const state = removeOutcomeState(await this.buddies.remove(studentId));
          return state.error ? state : { notice: "Request cancelled." };
        }
        case "remove": {
          const state = removeOutcomeState(await this.buddies.remove(studentId));
          return state.error ? state : { notice: "Study buddy removed." };
        }
      }
    } catch (error) {
      console.error("Study buddy action failed.", error);
      return { error: "Something went wrong. Please try again." };
    }
  }
}
