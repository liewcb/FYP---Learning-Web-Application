import type { StorageRequestRepository } from "@/interfaces/repositories/storage-request.repository";
import {
  amountsWithinLimit,
  isRequestAmount,
  storageRequestMessages,
  storageRequestRules,
  type AdminStorageRequestFilter,
  type AdminStorageRequestsModel,
  type StoragePageModel,
  type StorageRequestFormState,
} from "@/models/storage/storage-request.model";

/** Students ask for more storage; administrators approve or reject it. */
export class StorageRequestController {
  constructor(private readonly requests: StorageRequestRepository) {}

  /* ---------- Students ---------- */

  async loadPage(): Promise<StoragePageModel | null> {
    const [usage, requests] = await Promise.all([
      this.requests.myUsage(),
      this.requests.listMine(),
    ]);

    if (!usage) {
      return null;
    }

    return {
      usage,
      requests,
      pending: requests.find((request) => request.status === "pending") ?? null,
      availableAmounts: amountsWithinLimit(usage.quotaBytes),
    };
  }

  async request(rawBytes: string, rawReason: string): Promise<StorageRequestFormState> {
    const bytes = Number(rawBytes);
    const reason = rawReason.trim();

    if (!isRequestAmount(bytes)) {
      return { error: storageRequestMessages.invalid_amount, reason: rawReason };
    }

    if (reason.length < storageRequestRules.reasonMin || reason.length > storageRequestRules.reasonMax) {
      return { error: storageRequestMessages.reason_required, reason: rawReason };
    }

    try {
      const outcome = await this.requests.create(bytes, reason);

      return outcome === "created"
        ? { notice: storageRequestMessages.created }
        : { error: storageRequestMessages[outcome], reason: rawReason };
    } catch (error) {
      console.error("Storage request failed.", error);
      return { error: "Your request could not be sent. Please try again.", reason: rawReason };
    }
  }

  async cancel(requestId: number): Promise<StorageRequestFormState> {
    try {
      const outcome = await this.requests.cancel(requestId);

      return outcome === "cancelled"
        ? { notice: storageRequestMessages.cancelled }
        : { error: storageRequestMessages[outcome] };
    } catch (error) {
      console.error("Cancelling storage request failed.", error);
      return { error: "The request could not be cancelled. Please try again." };
    }
  }

  /* ---------- Administrators (callers must check admin access first) ---------- */

  async reviewQueue(filter: AdminStorageRequestFilter): Promise<AdminStorageRequestsModel> {
    const [requests, pending] = await Promise.all([
      this.requests.listForReview(filter, 100),
      filter === "pending" ? Promise.resolve(null) : this.requests.listForReview("pending", 200),
    ]);

    return {
      filter,
      requests,
      pendingCount: (pending ?? requests).length,
    };
  }

  async pendingCount(): Promise<number> {
    return (await this.requests.listForReview("pending", 200)).length;
  }

  async decide(requestId: number, approve: boolean, rawNote: string): Promise<StorageRequestFormState> {
    const note = rawNote.trim();

    if (note.length > storageRequestRules.noteMax) {
      return { error: `Keep the note under ${storageRequestRules.noteMax} characters.` };
    }

    try {
      const outcome = await this.requests.decide(requestId, approve, note || null);

      return outcome === "approved" || outcome === "rejected"
        ? { notice: storageRequestMessages[outcome] }
        : { error: storageRequestMessages[outcome] };
    } catch (error) {
      console.error("Storage request decision failed.", error);
      return { error: "The decision could not be saved. Please try again." };
    }
  }
}
