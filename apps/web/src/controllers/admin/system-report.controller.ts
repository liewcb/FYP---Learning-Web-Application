import type { SystemReportRepository } from "@/interfaces/repositories/system-report.repository";
import type { SystemMonitoringController } from "@/controllers/admin/system-monitoring.controller";
import type { ReportRequest, SystemReport } from "@/models/admin/system-report.model";
import type { Viewer } from "@/models/profile/profile.model";

/**
 * Generate System Report: combines live monitoring (status, storage,
 * sessions) with figures for the chosen period, using the latest data on
 * every request.
 */
export class SystemReportController {
  constructor(
    private readonly reports: SystemReportRepository,
    private readonly monitoring: SystemMonitoringController,
  ) {}

  async generate(request: ReportRequest, viewer: Viewer, record: boolean): Promise<SystemReport> {
    const [monitoring, activity] = await Promise.all([
      this.monitoring.load(),
      this.reports.activity(request.days, record),
    ]);

    return {
      request,
      generatedAt: new Date().toISOString(),
      generatedBy: viewer.displayName,
      monitoring,
      activity,
    };
  }
}
