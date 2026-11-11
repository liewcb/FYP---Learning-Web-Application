import type { AuditLogRepository } from "@/interfaces/repositories/audit-log.repository";
import {
  auditLogPageSize,
  type AuditLogFilters,
  type AuditLogModel,
} from "@/models/admin/audit-log.model";

export class AuditLogController {
  constructor(private readonly log: AuditLogRepository) {}

  async load(filters: AuditLogFilters): Promise<AuditLogModel> {
    const { events, total } = await this.log.list(
      filters.area,
      auditLogPageSize,
      (filters.page - 1) * auditLogPageSize,
    );

    return {
      filters,
      events,
      total,
      pageCount: Math.max(1, Math.ceil(total / auditLogPageSize)),
    };
  }
}
