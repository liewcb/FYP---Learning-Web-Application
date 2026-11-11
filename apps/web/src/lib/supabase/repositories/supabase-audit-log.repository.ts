import type { SupabaseClient } from "@supabase/supabase-js";

import type { AuditLogRepository } from "@/interfaces/repositories/audit-log.repository";
import type { AuditArea, AuditEvent } from "@/models/admin/audit-log.model";

interface AuditRow {
  id: number;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id: number | null;
  metadata: unknown;
  created_at: string;
  total_count: number | string;
}

export class SupabaseAuditLogRepository implements AuditLogRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async list(area: AuditArea, limit: number, offset: number) {
    const { data, error } = await this.supabase.rpc("admin_list_audit_events", {
      p_area: area,
      p_limit: limit,
      p_offset: offset,
    });

    if (error) {
      throw new Error(`Unable to load the audit log: ${error.message}`);
    }

    const rows = (data ?? []) as AuditRow[];
    const events: AuditEvent[] = rows.map((row) => ({
      id: row.id,
      actorName: row.actor_name,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      metadata:
        typeof row.metadata === "object" && row.metadata !== null && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {},
      createdAt: row.created_at,
    }));

    return { events, total: rows.length > 0 ? Number(rows[0].total_count) : 0 };
  }
}
