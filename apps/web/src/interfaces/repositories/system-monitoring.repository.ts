import type { StorageHeavyUser, SystemOverview } from "@/models/admin/system-monitoring.model";

export interface SystemMonitoringRepository {
  overview(): Promise<SystemOverview>;
  heaviestUsers(limit: number): Promise<StorageHeavyUser[]>;
  /** Round-trip time of a trivial database call, in milliseconds. */
  pingDatabase(): Promise<number>;
}
