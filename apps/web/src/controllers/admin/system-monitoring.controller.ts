import type { SystemMonitoringRepository } from "@/interfaces/repositories/system-monitoring.repository";
import type { AiService } from "@/interfaces/services/ai-service.interface";
import {
  buildMonitoringAlerts,
  totalStoredBytes,
  type MonitoringModel,
  type ServiceStatus,
  type SystemOverview,
} from "@/models/admin/system-monitoring.model";

/** Database round trips slower than this are reported as degraded. */
const slowDatabaseMs = 1_500;

/** Collects platform health, storage and usage figures for administrators. */
export class SystemMonitoringController {
  constructor(
    private readonly monitoring: SystemMonitoringRepository,
    private readonly aiService: AiService,
    private readonly platformCapacityBytes: number,
  ) {}

  async load(): Promise<MonitoringModel> {
    const [overview, heaviestUsers, databaseMs, aiStatus] = await Promise.all([
      this.monitoring.overview(),
      this.monitoring.heaviestUsers(8),
      this.monitoring.pingDatabase().catch(() => null),
      this.checkAiService(),
    ]);
    const services = this.services(overview, databaseMs, aiStatus);

    return {
      overview,
      services,
      alerts: buildMonitoringAlerts(overview, services, this.platformCapacityBytes),
      platformBytes: totalStoredBytes(overview),
      platformCapacityBytes: this.platformCapacityBytes,
      heaviestUsers,
    };
  }

  private async checkAiService(): Promise<ServiceStatus> {
    try {
      await this.aiService.checkHealth();

      return { name: "AI service", state: "operational", detail: "Analysis and quiz generation are reachable." };
    } catch (error) {
      return {
        name: "AI service",
        state: "down",
        detail: error instanceof Error ? error.message : "The AI service did not respond.",
      };
    }
  }

  private services(
    overview: SystemOverview,
    databaseMs: number | null,
    ai: ServiceStatus,
  ): ServiceStatus[] {
    return [
      { name: "Web application", state: "operational", detail: "Serving this page." },
      databaseMs === null
        ? { name: "Database", state: "down", detail: "A test query failed." }
        : {
            name: "Database",
            state: databaseMs > slowDatabaseMs ? "degraded" : "operational",
            detail: `Responded in ${databaseMs} ms.`,
          },
      ai,
      overview.storage.buckets
        ? { name: "File storage", state: "operational", detail: `${overview.storage.buckets.length} buckets in use.` }
        : { name: "File storage", state: "degraded", detail: "Storage usage could not be read from the database." },
      overview.sessions
        ? { name: "Authentication", state: "operational", detail: `${overview.sessions.active} active sessions.` }
        : { name: "Authentication", state: "degraded", detail: "Session data could not be read from the database." },
    ];
  }
}
