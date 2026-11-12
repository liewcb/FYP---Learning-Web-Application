import type {
  AdminStorageRequest,
  StorageRequest,
  StorageRequestOutcome,
  StorageUsage,
} from "@/models/storage/storage-request.model";

/** Storage requests. Every write goes through a database function that enforces the rules. */
export interface StorageRequestRepository {
  /** The signed-in student's quota and current usage. */
  myUsage(): Promise<StorageUsage | null>;
  listMine(): Promise<StorageRequest[]>;
  create(additionalBytes: number, reason: string): Promise<StorageRequestOutcome>;
  cancel(requestId: number): Promise<StorageRequestOutcome>;
  /** Administrators only; the database refuses anyone else. */
  listForReview(status: string, limit: number): Promise<AdminStorageRequest[]>;
  decide(requestId: number, approve: boolean, note: string | null): Promise<StorageRequestOutcome>;
}
