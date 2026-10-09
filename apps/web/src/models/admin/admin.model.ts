import type { Viewer } from "@/models/profile/profile.model";

export interface AdminSection {
  readonly slug: string;
  readonly label: string;
  readonly description: string;
  readonly icon: string;
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
}

export const adminBasePath = "/admin";
export const adminProfilePath = "/admin/profile";

export const adminSections: readonly AdminSection[] = [
  {
    slug: "users",
    label: "User management",
    description: "View accounts, suspend or reactivate users.",
    icon: "◎",
  },
  {
    slug: "library",
    label: "Learning library",
    description: "Review, approve or reject uploaded learning materials.",
    icon: "▤",
  },
  {
    slug: "forum",
    label: "Forum moderation",
    description: "Review threads and comments, remove inappropriate content.",
    icon: "✎",
  },
  {
    slug: "storage-requests",
    label: "Storage requests",
    description: "Approve or reject requests for additional storage.",
    icon: "⬒",
  },
  {
    slug: "monitoring",
    label: "System monitoring",
    description: "Storage utilisation, active sessions and system status.",
    icon: "◔",
  },
  {
    slug: "reports",
    label: "Reports",
    description: "Generate and download usage and activity reports.",
    icon: "▦",
  },
  {
    slug: "audit-log",
    label: "Audit log",
    description: "History of administrative actions.",
    icon: "☰",
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

export function createAdminDashboardModel(viewer: Viewer): AdminDashboardModel {
  const notConnected = "Not connected yet";

  return {
    viewer,
    stats: [
      { label: "Registered users", value: "—", detail: notConnected },
      { label: "Pending materials", value: "—", detail: notConnected },
      { label: "Storage requests", value: "—", detail: notConnected },
      { label: "Platform storage used", value: "—", detail: notConnected },
    ],
    sections: adminSections,
  };
}
