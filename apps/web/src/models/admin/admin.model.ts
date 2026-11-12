import type { Viewer } from "@/models/profile/profile.model";
import {
  formatStorage,
  percentOf,
  type MonitoringAlert,
  type MonitoringModel,
} from "@/models/admin/system-monitoring.model";

export interface AdminSection {
  readonly slug: string;
  readonly label: string;
  readonly description: string;
  readonly icon: string;
  /** False while the module is still a placeholder. */
  readonly ready: boolean;
}

export interface AdminNavItem {
  readonly label: string;
  readonly href: string;
  readonly icon: string;
}

export interface AdminStat {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
}

export interface AdminDashboardModel {
  readonly viewer: Viewer;
  readonly stats: readonly AdminStat[];
  readonly sections: readonly AdminSection[];
  readonly alerts: readonly MonitoringAlert[];
  /** Set when live figures could not be loaded. */
  readonly loadError?: string;
}

export const adminBasePath = "/admin";
export const adminProfilePath = "/admin/profile";

export const adminSections: readonly AdminSection[] = [
  {
    slug: "users",
    label: "User management",
    description: "View accounts, suspend or reactivate users.",
    icon: "◎",
    ready: true,
  },
  {
    slug: "library",
    label: "Learning library",
    description: "Review, approve or reject uploaded learning materials.",
    icon: "▤",
    ready: true,
  },
  {
    slug: "forum",
    label: "Forum moderation",
    description: "Review threads and comments, remove inappropriate content.",
    icon: "✎",
    ready: true,
  },
  {
    slug: "report-review",
    label: "Report review",
    description: "Decide reports about profiles, messages, posts and materials; reporters are notified.",
    icon: "⚑",
    ready: true,
  },
  {
    slug: "storage-requests",
    label: "Storage requests",
    description: "Approve or reject requests for additional storage.",
    icon: "⬒",
    ready: true,
  },
  {
    slug: "monitoring",
    label: "System monitoring",
    description: "Storage utilisation, active sessions and system status.",
    icon: "◔",
    ready: true,
  },
  {
    slug: "reports",
    label: "Reports",
    description: "Generate and download usage and activity reports.",
    icon: "▦",
    ready: true,
  },
  {
    slug: "audit-log",
    label: "Audit log",
    description: "History of administrative actions.",
    icon: "☰",
    ready: true,
  },
];

export const adminNavigation: readonly AdminNavItem[] = [
  { label: "Overview", href: adminBasePath, icon: "⌂" },
  ...adminSections.map((section) => ({
    label: section.label,
    href: `${adminBasePath}/${section.slug}`,
    icon: section.icon,
  })),
  { label: "My profile", href: adminProfilePath, icon: "☺" },
];

export function findAdminSection(slug: string): AdminSection | null {
  return adminSections.find((section) => section.slug === slug) ?? null;
}

export function createAdminDashboardModel(
  viewer: Viewer,
  monitoring: MonitoringModel | null,
): AdminDashboardModel {
  if (!monitoring) {
    const unavailable = "Could not load live figures";

    return {
      viewer,
      stats: [
        { label: "Registered users", value: "—", detail: unavailable },
        { label: "Pending materials", value: "—", detail: unavailable },
        { label: "Open reports", value: "—", detail: unavailable },
        { label: "Platform storage used", value: "—", detail: unavailable },
      ],
      sections: adminSections,
      alerts: [],
      loadError: "Live figures are unavailable. Check that the latest database migration is applied.",
    };
  }

  const { overview } = monitoring;

  return {
    viewer,
    stats: [
      {
        label: "Registered users",
        value: overview.users.total.toLocaleString("en-MY"),
        detail: `${overview.users.newLast7Days} new this week · ${overview.users.suspended} suspended`,
      },
      {
        label: "Pending materials",
        value: overview.community.pendingLibraryMaterials.toLocaleString("en-MY"),
        detail: "Waiting for library review",
      },
      {
        label: "Open reports",
        value: overview.community.pendingReports.toLocaleString("en-MY"),
        detail: `${overview.community.pendingForumReports} about forum posts`,
      },
      {
        label: "Platform storage used",
        value: formatStorage(monitoring.platformBytes),
        detail: `${percentOf(monitoring.platformBytes, monitoring.platformCapacityBytes)}% of ${formatStorage(monitoring.platformCapacityBytes)}`,
      },
    ],
    sections: adminSections,
    alerts: monitoring.alerts,
  };
}
