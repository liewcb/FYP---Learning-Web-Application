import type { AuditArea, AuditEvent } from "@/models/admin/audit-log.model";

export interface AuditLogRepository {
  list(area: AuditArea, limit: number, offset: number): Promise<{ events: AuditEvent[]; total: number }>;
}
