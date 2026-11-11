import { loadCurrentAccount } from "@/controllers/shared/current-viewer";
import type { ProfileRepository } from "@/interfaces/repositories/profile.repository";
import type { AuthService } from "@/interfaces/services/auth-service.interface";
import {
  createAdminDashboardModel,
  findAdminSection,
  type AdminDashboardModel,
  type AdminSection,
} from "@/models/admin/admin.model";
import type { MonitoringModel } from "@/models/admin/system-monitoring.model";
import { authRoutes } from "@/models/auth/auth-routes";
import type { Viewer } from "@/models/profile/profile.model";

export type AdminAccess =
  | { readonly status: "allowed"; readonly viewer: Viewer }
  | { readonly status: "denied"; readonly redirectTo: string };

export class AdminController {
  constructor(
    private readonly auth: AuthService,
    private readonly profiles: ProfileRepository,
  ) {}

  /**
   * Must be checked by every admin page and admin action. Layouts are not
   * re-rendered on client-side navigation, so a layout check alone is not
   * enough.
   */
  async access(): Promise<AdminAccess> {
    const current = await loadCurrentAccount(this.auth, this.profiles);

    if (!current) {
      return { status: "denied", redirectTo: authRoutes.signIn };
    }

    if (current.viewer.role !== "admin") {
      return { status: "denied", redirectTo: authRoutes.home };
    }

    return { status: "allowed", viewer: current.viewer };
  }

  dashboard(viewer: Viewer, monitoring: MonitoringModel | null): AdminDashboardModel {
    return createAdminDashboardModel(viewer, monitoring);
  }

  section(slug: string): AdminSection | null {
    return findAdminSection(slug);
  }
}
