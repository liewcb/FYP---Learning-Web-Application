import type { DocumentRepository } from "@/interfaces/repositories/document.repository";
import type { LibraryRepository } from "@/interfaces/repositories/library.repository";
import type { LibraryStorage } from "@/interfaces/services/library-storage.interface";
import {
  libraryDecisionRules,
  libraryRules,
  validateLibrarySubmission,
  validateReviewNote,
  type LibraryBrowseFilters,
  type LibraryDecision,
  type LibraryDetailModel,
  type LibraryPageModel,
  type LibraryReviewFilter,
  type LibraryReviewFormState,
  type LibraryReviewModel,
  type LibrarySubmitFormState,
  type LibrarySubmitFormValues,
  type LibrarySubmitPageModel,
  type LibraryTab,
} from "@/models/library/library.model";
import type { Viewer } from "@/models/profile/profile.model";

export type LibrarySubmitResult =
  | { readonly ok: true; readonly materialId: number }
  | { readonly ok: false; readonly state: LibrarySubmitFormState };

export class LibraryController {
  constructor(
    private readonly library: LibraryRepository,
    private readonly storage: LibraryStorage,
    private readonly documents: DocumentRepository,
  ) {}

  /* ---------- Students ---------- */

  async loadPage(input: {
    readonly viewerId: string;
    readonly tab: LibraryTab;
    readonly filters: LibraryBrowseFilters;
  }): Promise<LibraryPageModel> {
    const browsing = input.tab === "browse";
    const [materials, subjects, mine] = await Promise.all([
      browsing
        ? this.library.listPublished(input.filters, libraryRules.pageSize)
        : Promise.resolve([]),
      browsing ? this.library.listPublishedSubjects() : Promise.resolve([]),
      this.library.listMine(input.viewerId),
    ]);

    return { tab: input.tab, filters: input.filters, materials, subjects, mine };
  }

  async loadMaterial(id: number, viewer: Viewer): Promise<LibraryDetailModel | null> {
    // Row-level security hides unpublished materials from other students.
    const material = await this.library.findById(id);

    if (!material) {
      return null;
    }

    const isOwner = material.submittedBy === viewer.id;
    const events = isOwner ? await this.library.listEvents(id) : [];

    if (material.status === "published" && !isOwner) {
      await this.library.recordView(id).catch((error: unknown) => {
        console.error("Recording library view failed.", error);
      });
    }

    return { material, events, isOwner };
  }

  async loadSubmitPage(input: {
    readonly viewerId: string;
    readonly requestedDocumentId: number | null;
  }): Promise<LibrarySubmitPageModel> {
    const [documents, mine, subjects] = await Promise.all([
      this.documents.listForCurrentUser(),
      this.library.listMine(input.viewerId),
      this.library.listPublishedSubjects(),
    ]);

    // A document with a pending or published submission cannot be sent again.
    const busy = new Set<number>();

    for (const material of mine) {
      if (
        material.sourceDocumentId !== null &&
        (material.status === "pending_review" || material.status === "published")
      ) {
        busy.add(material.sourceDocumentId);
      }
    }

    const available = documents
      .filter((document) => document.status === "ready" && !busy.has(document.id))
      .map((document) => ({
        id: document.id,
        title: document.title,
        fileName: document.fileName,
        sizeBytes: document.data.sizeBytes,
        mimeType: document.data.mimeType,
      }));

    return {
      documents: available,
      selectedId: available.some((item) => item.id === input.requestedDocumentId)
        ? input.requestedDocumentId
        : null,
      subjects,
    };
  }

  async submit(input: {
    readonly viewerId: string;
    readonly values: LibrarySubmitFormValues;
  }): Promise<LibrarySubmitResult> {
    const { values } = input;
    const fail = (error: string): LibrarySubmitResult => ({
      ok: false,
      state: { error, values },
    });
    const validation = validateLibrarySubmission(values);

    if (!validation.ok) {
      return { ok: false, state: { fieldErrors: validation.fieldErrors, values } };
    }

    const submission = validation.value;
    let storedPath: string | null = null;

    try {
      // The lookup runs with the student's session, so it only finds their own documents.
      const document = await this.documents.findById(submission.documentId);

      if (!document) {
        return fail("That document could not be found in My Documents.");
      }

      if (document.status !== "ready") {
        return fail("Only documents whose status is Ready can be submitted.");
      }

      const data = document.data;
      const stored = await this.storage.copyFromDocument({
        submitterId: input.viewerId,
        sourcePath: document.storagePath,
        fileName: document.fileName,
        mimeType: data.mimeType,
      });
      storedPath = stored.path;

      const materialId = await this.library.createSubmission({
        sourceDocumentId: document.id,
        submittedBy: input.viewerId,
        title: submission.title,
        description: submission.description,
        subjectName: submission.subjectName,
        moduleCode: submission.moduleCode,
        tags: submission.tags,
        storagePath: stored.path,
        fileName: document.fileName.slice(-255),
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
      });

      return { ok: true, materialId };
    } catch (error) {
      if (storedPath) {
        await this.storage.remove([storedPath]).catch((cleanupError: unknown) => {
          console.error("Unsubmitted library file cleanup failed.", cleanupError);
        });
      }

      if (error instanceof Error && error.message === "duplicate_submission") {
        return fail("This document already has a submission that is pending review or published.");
      }

      console.error("Library submission failed.", error);
      return fail("Your material could not be submitted. Please try again.");
    }
  }

  /**
   * Signed link for a material the viewer is allowed to read (published,
   * their own, or any material for an administrator). Row-level security
   * answers that question, so an unseen material simply returns null.
   */
  async downloadUrl(id: number): Promise<string | null> {
    const file = await this.library.findStorage(id);

    if (!file) {
      return null;
    }

    const url = await this.storage.createDownloadUrl(file.path, file.fileName);

    await this.library.recordDownload(id).catch((error: unknown) => {
      console.error("Recording library download failed.", error);
    });

    return url;
  }

  /* ---------- Administrators (callers must check admin access first) ---------- */

  async reviewQueue(filter: LibraryReviewFilter): Promise<LibraryReviewModel> {
    const [materials, counts] = await Promise.all([
      this.library.listForReview(filter, libraryRules.pageSize),
      this.library.countByStatus(),
    ]);

    return { filter, counts, materials };
  }

  async decide(input: {
    readonly materialId: number;
    readonly reviewerId: string;
    readonly decision: LibraryDecision;
    readonly rawNote: string;
  }): Promise<LibraryReviewFormState> {
    const validation = validateReviewNote(input.decision, input.rawNote);

    if (!validation.ok) {
      return { error: validation.error, note: input.rawNote };
    }

    const rule = libraryDecisionRules[input.decision];

    try {
      const changed = await this.library.decide({
        materialId: input.materialId,
        reviewerId: input.reviewerId,
        from: rule.from,
        to: rule.to,
        note: validation.note,
      });

      return changed
        ? { notice: rule.success }
        : {
            error: "This material is no longer in the right state. Refresh the page.",
            note: input.rawNote,
          };
    } catch (error) {
      console.error("Library decision failed.", error);
      return { error: "The decision could not be saved. Please try again.", note: input.rawNote };
    }
  }
}