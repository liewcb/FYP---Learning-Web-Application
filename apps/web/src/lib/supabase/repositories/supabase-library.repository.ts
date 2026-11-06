import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  CreateLibrarySubmissionInput,
  LibraryDecisionInput,
  LibraryRepository,
} from "@/interfaces/repositories/library.repository";
import {
  isLibraryStatus,
  libraryReviewFilters,
  librarySearchTerm,
  type LibraryBrowseFilters,
  type LibraryEvent,
  type LibraryEventType,
  type LibraryMaterial,
  type LibraryReviewFilter,
} from "@/models/library/library.model";

interface SubmitterRow {
  full_name: string;
  username: string | null;
  is_discoverable: boolean;
}

interface MaterialRow {
  id: number;
  source_document_id: number | null;
  submitted_by: string;
  title: string;
  description: string;
  subject_name: string;
  module_code: string | null;
  tags: string[] | null;
  status: string;
  reviewed_by: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  published_at: string | null;
  archived_at: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  view_count: number;
  download_count: number;
  created_at: string;
  updated_at: string;
  submitter: SubmitterRow | SubmitterRow[] | null;
}

interface EventRow {
  id: number;
  actor_id: string | null;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  created_at: string;
}

const materialColumns = `
  id,
  source_document_id,
  submitted_by,
  title,
  description,
  subject_name,
  module_code,
  tags,
  status,
  reviewed_by,
  review_note,
  reviewed_at,
  published_at,
  archived_at,
  file_name,
  mime_type,
  size_bytes,
  view_count,
  download_count,
  created_at,
  updated_at,
  submitter:profiles!library_materials_submitted_by_fkey(full_name, username, is_discoverable)
`;

const uniqueViolation = "23505";

function toMaterial(row: MaterialRow): LibraryMaterial {
  const submitter = Array.isArray(row.submitter) ? row.submitter[0] : row.submitter;

  return {
    id: row.id,
    sourceDocumentId: row.source_document_id,
    submittedBy: row.submitted_by,
    submitterName: submitter?.full_name.trim() || submitter?.username || "Student",
    submitterDiscoverable: submitter?.is_discoverable ?? false,
    title: row.title,
    description: row.description,
    subjectName: row.subject_name,
    moduleCode: row.module_code,
    tags: row.tags ?? [],
    status: isLibraryStatus(row.status) ? row.status : "draft",
    reviewedBy: row.reviewed_by,
    reviewNote: row.review_note,
    reviewedAt: row.reviewed_at,
    publishedAt: row.published_at,
    archivedAt: row.archived_at,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes === null ? null : Number(row.size_bytes),
    viewCount: row.view_count,
    downloadCount: row.download_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toEvent(row: EventRow): LibraryEvent {
  return {
    id: row.id,
    actorId: row.actor_id,
    eventType: row.event_type as LibraryEventType,
    fromStatus: isLibraryStatus(row.from_status) ? row.from_status : null,
    toStatus: isLibraryStatus(row.to_status) ? row.to_status : null,
    note: row.note,
    createdAt: row.created_at,
  };
}

/**
 * Reads and moderation updates use the signed-in session, so row-level
 * security decides who can see or change a row. Creating a submission writes
 * storage metadata that students may not set, so it uses the service role
 * after the controller has verified ownership.
 */
export class SupabaseLibraryRepository implements LibraryRepository {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly createServiceClient: () => SupabaseClient,
  ) {}

  async listPublished(filters: LibraryBrowseFilters, limit: number): Promise<LibraryMaterial[]> {
    let query = this.supabase
      .from("library_materials")
      .select(materialColumns)
      .eq("status", "published")
      .eq("visibility_scope", "authenticated")
      .limit(limit);

    if (filters.subject) {
      query = query.eq("subject_name", filters.subject);
    }

    const term = librarySearchTerm(filters.query);

    if (term) {
      const pattern = `%${term}%`;
      const clauses = [
        `title.ilike.${pattern}`,
        `description.ilike.${pattern}`,
        `subject_name.ilike.${pattern}`,
        `module_code.ilike.${pattern}`,
      ];

      // Tags are stored lowercase; match a single word exactly.
      if (/^[\p{L}\p{N}_-]+$/u.test(term)) {
        clauses.push(`tags.cs.{${term.toLowerCase()}}`);
      }

      query = query.or(clauses.join(","));
    }

    query =
      filters.sort === "popular"
        ? query
            .order("download_count", { ascending: false })
            .order("published_at", { ascending: false })
        : query.order("published_at", { ascending: false }).order("id", { ascending: false });

    const { data, error } = await query;

    if (error) {
      throw new Error(`Unable to load library materials: ${error.message}`);
    }

    return (data as unknown as MaterialRow[]).map(toMaterial);
  }

  async listPublishedSubjects(): Promise<string[]> {
    const { data, error } = await this.supabase
      .from("library_materials")
      .select("subject_name")
      .eq("status", "published")
      .limit(1000);

    if (error) {
      throw new Error(`Unable to load library subjects: ${error.message}`);
    }

    const subjects = new Set((data as { subject_name: string }[]).map((row) => row.subject_name));

    return [...subjects].sort((a, b) => a.localeCompare(b));
  }

  async listMine(viewerId: string): Promise<LibraryMaterial[]> {
    const { data, error } = await this.supabase
      .from("library_materials")
      .select(materialColumns)
      .eq("submitted_by", viewerId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      throw new Error(`Unable to load your submissions: ${error.message}`);
    }

    return (data as unknown as MaterialRow[]).map(toMaterial);
  }

  async listForReview(status: LibraryReviewFilter, limit: number): Promise<LibraryMaterial[]> {
    const { data, error } = await this.supabase
      .from("library_materials")
      .select(materialColumns)
      .eq("status", status)
      .order("created_at", { ascending: status === "pending_review" })
      .limit(limit);

    if (error) {
      throw new Error(`Unable to load the review queue: ${error.message}`);
    }

    return (data as unknown as MaterialRow[]).map(toMaterial);
  }

  async countByStatus(): Promise<Record<LibraryReviewFilter, number>> {
    const entries = await Promise.all(
      libraryReviewFilters.map(async (status) => {
        const { count, error } = await this.supabase
          .from("library_materials")
          .select("id", { count: "exact", head: true })
          .eq("status", status);

        if (error) {
          throw new Error(`Unable to count library materials: ${error.message}`);
        }

        return [status, count ?? 0] as const;
      }),
    );

    return Object.fromEntries(entries) as Record<LibraryReviewFilter, number>;
  }

  async findById(id: number): Promise<LibraryMaterial | null> {
    const { data, error } = await this.supabase
      .from("library_materials")
      .select(materialColumns)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to load library material: ${error.message}`);
    }

    return data ? toMaterial(data as unknown as MaterialRow) : null;
  }

  async findStorage(
    id: number,
  ): Promise<{ readonly path: string; readonly fileName: string } | null> {
    const { data, error } = await this.supabase
      .from("library_materials")
      .select("storage_path, file_name")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to load library file: ${error.message}`);
    }

    const row = data as { storage_path: string | null; file_name: string | null } | null;

    return row?.storage_path && row.file_name
      ? { path: row.storage_path, fileName: row.file_name }
      : null;
  }

  async listEvents(materialId: number): Promise<LibraryEvent[]> {
    const { data, error } = await this.supabase
      .from("library_material_events")
      .select("id, actor_id, event_type, from_status, to_status, note, created_at")
      .eq("material_id", materialId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      throw new Error(`Unable to load submission history: ${error.message}`);
    }

    return (data as EventRow[]).map(toEvent);
  }

  async createSubmission(input: CreateLibrarySubmissionInput): Promise<number> {
    const { data, error } = await this.createServiceClient()
      .from("library_materials")
      .insert({
        source_document_id: input.sourceDocumentId,
        submitted_by: input.submittedBy,
        title: input.title,
        description: input.description,
        subject_name: input.subjectName,
        module_code: input.moduleCode,
        tags: [...input.tags],
        storage_path: input.storagePath,
        file_name: input.fileName,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(
        error.code === uniqueViolation
          ? "duplicate_submission"
          : `Unable to submit material: ${error.message}`,
      );
    }

    return (data as { id: number }).id;
  }

  async decide(input: LibraryDecisionInput): Promise<boolean> {
    const now = new Date().toISOString();
    const update: Record<string, unknown> = {
      status: input.to,
      reviewed_by: input.reviewerId,
      reviewed_at: now,
      review_note: input.note,
    };

    if (input.to === "published") {
      update.published_at = now;
    }

    if (input.to === "archived") {
      update.archived_at = now;
    }

    const { data, error } = await this.supabase
      .from("library_materials")
      .update(update)
      .eq("id", input.materialId)
      .eq("status", input.from)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to save the decision: ${error.message}`);
    }

    return data !== null;
  }

  async recordView(id: number): Promise<void> {
    const { error } = await this.supabase.rpc("record_library_view", { p_material: id });

    if (error) {
      throw new Error(`Unable to record view: ${error.message}`);
    }
  }

  async recordDownload(id: number): Promise<void> {
    const { error } = await this.supabase.rpc("record_library_download", { p_material: id });

    if (error) {
      throw new Error(`Unable to record download: ${error.message}`);
    }
  }
}