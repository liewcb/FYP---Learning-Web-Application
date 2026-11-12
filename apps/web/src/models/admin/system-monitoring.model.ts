export const adminMonitoringPath = "/admin/monitoring";

/** A student is flagged once they use this share of their quota. */
export const userStorageWarningRatio = 0.8;
/** The platform is flagged once total storage reaches these shares of capacity. */
export const platformStorageWarningRatio = 0.75;
export const platformStorageCriticalRatio = 0.9;
/** Supabase Free plan file storage. Override with PLATFORM_STORAGE_CAPACITY_BYTES. */
export const defaultPlatformStorageCapacityBytes = 1_073_741_824;

export interface StorageBucketUsage {
  readonly bucket: string;
  readonly objects: number;
  readonly bytes: number;
}

export interface ActivityDay {
  readonly day: string;
  readonly newUsers: number;
  readonly uploads: number;
  readonly quizAttempts: number;
  readonly forumPosts: number;
}

export interface SystemOverview {
  readonly generatedAt: string;
  readonly users: {
    readonly total: number;
    readonly students: number;
    readonly admins: number;
    readonly suspended: number;
    readonly newLast7Days: number;
    readonly seenLast15Minutes: number;
    readonly seenLast24Hours: number;
  };
  /** Null when the database role cannot read Supabase Auth sessions. */
  readonly sessions: {
    readonly active: number;
    readonly refreshedLastHour: number;
    readonly usersWithSessions: number;
  } | null;
  readonly storage: {
    /** Null when the database role cannot read Supabase Storage metadata. */
    readonly buckets: readonly StorageBucketUsage[] | null;
    readonly documentBytes: number;
    readonly quotaBytes: number;
    readonly usersOver80Percent: number;
  };
  readonly documents: {
    readonly total: number;
    readonly ready: number;
    readonly processing: number;
    readonly failed: number;
    readonly uploadedLast24Hours: number;
  };
  readonly ai: {
    readonly analysesReady: number;
    readonly analysesFailed: number;
    readonly analysesStuck: number;
    readonly quizzesReady: number;
    readonly quizzesFailed: number;
    readonly quizAttempts: number;
    readonly quizAttemptsLast24Hours: number;
  };
  readonly community: {
    readonly forumThreads: number;
    readonly forumComments: number;
    readonly pendingForumReports: number;
    /** Every open report: profiles, messages, posts and materials. */
    readonly pendingReports: number;
    readonly pendingLibraryMaterials: number;
  };
  readonly activity: readonly ActivityDay[];
}

export type ServiceState = "operational" | "degraded" | "down";

export interface ServiceStatus {
  readonly name: string;
  readonly state: ServiceState;
  readonly detail: string;
}

export type AlertLevel = "warning" | "critical";

export interface MonitoringAlert {
  readonly level: AlertLevel;
  readonly title: string;
  readonly detail: string;
  readonly href?: string;
}

export interface StorageHeavyUser {
  readonly id: string;
  readonly name: string;
  readonly usedBytes: number;
  readonly quotaBytes: number;
}

export interface MonitoringModel {
  readonly overview: SystemOverview;
  readonly services: readonly ServiceStatus[];
  readonly alerts: readonly MonitoringAlert[];
  readonly platformBytes: number;
  readonly platformCapacityBytes: number;
  readonly heaviestUsers: readonly StorageHeavyUser[];
}

export function totalStoredBytes(overview: SystemOverview): number {
  return overview.storage.buckets
    ? overview.storage.buckets.reduce((total, bucket) => total + bucket.bytes, 0)
    : overview.storage.documentBytes;
}

export function percentOf(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/**
 * Turns raw numbers into the warnings an administrator should act on. The
 * same list feeds the monitoring page and the admin dashboard banner, which
 * is how administrators are notified about threshold breaches.
 */
export function buildMonitoringAlerts(
  overview: SystemOverview,
  services: readonly ServiceStatus[],
  platformCapacityBytes: number,
): MonitoringAlert[] {
  const alerts: MonitoringAlert[] = [];
  const platformRatio = platformCapacityBytes > 0
    ? totalStoredBytes(overview) / platformCapacityBytes
    : 0;

  if (platformRatio >= platformStorageWarningRatio) {
    alerts.push({
      level: platformRatio >= platformStorageCriticalRatio ? "critical" : "warning",
      title: `Platform storage at ${Math.round(platformRatio * 100)}%`,
      detail: "Ask students to remove old uploads or raise the storage plan before uploads start failing.",
      href: adminMonitoringPath,
    });
  }

  if (overview.storage.usersOver80Percent > 0) {
    const count = overview.storage.usersOver80Percent;
    alerts.push({
      level: "warning",
      title: `${count} ${count === 1 ? "student is" : "students are"} near their storage quota`,
      detail: `Using at least ${Math.round(userStorageWarningRatio * 100)}% of their quota.`,
      href: "/admin/users?sort=storage",
    });
  }

  for (const service of services) {
    if (service.state !== "operational") {
      alerts.push({
        level: service.state === "down" ? "critical" : "warning",
        title: `${service.name} is ${service.state}`,
        detail: service.detail,
        href: adminMonitoringPath,
      });
    }
  }

  if (overview.ai.analysesStuck > 0) {
    alerts.push({
      level: "warning",
      title: `${overview.ai.analysesStuck} content analyses look stuck`,
      detail: "They have been pending for over 15 minutes. Check the AI service logs.",
    });
  }

  if (overview.community.pendingReports > 0) {
    alerts.push({
      level: "warning",
      title: `${overview.community.pendingReports} reports waiting`,
      detail: "Students have reported profiles, messages, posts or materials.",
      href: "/admin/report-review",
    });
  }

  return alerts;
}

export function formatStorage(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;

  return `${bytes} B`;
}

export const bucketLabels: Record<string, string> = {
  "learning-materials": "Uploaded documents",
  "library-materials": "Library materials",
  "forum-attachments": "Forum attachments",
  "chat-attachments": "Chat attachments",
  avatars: "Profile pictures",
};
