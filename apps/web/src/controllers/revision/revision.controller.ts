import type { DocumentRepository } from "@/interfaces/repositories/document.repository";
import type { LearningResultsRepository } from "@/interfaces/repositories/learning-results.repository";
import type { QuizAttemptRepository } from "@/interfaces/repositories/quiz-attempt.repository";
import type { RevisionRepository } from "@/interfaces/repositories/revision.repository";
import type { AiService } from "@/interfaces/services/ai-service.interface";
import type { SavedContentAnalysis } from "@/models/analysis/content-analysis.model";
import { limitSentencesForAi, type LearningDocument } from "@/models/document/document.model";
import type {
  CreateStudyHighlightInput,
  HighlightColour,
  StudyHighlight,
} from "@/models/revision/highlight.model";
import type { SavedQuiz } from "@/models/quiz/quiz.model";
import {
  buildReaderBlocks,
  isSubjectColour,
  quoteFromText,
  revisionQuizLimit,
  revisionRules,
  revisionStreak,
  subjectColours,
  validateNote,
  validateSubjectName,
  type ReaderDocument,
  type ReadingProgress,
  type RevisionActionState,
  type RevisionAnalysis,
  type RevisionDashboardModel,
  type RevisionQuiz,
  type RevisionSource,
  type StudyNote,
  type StudySubject,
  type UpdateStudyNoteInput,
} from "@/models/revision/revision.model";

/** Same request sizes as the content-analysis page defaults. */
const analysisRequest = { top_keywords: 12, top_sentences: 6, max_topics: 4 } as const;

/** Recent attempts read to work out each quiz's best score. */
const attemptLookback = 200;

function failed<T>(error: unknown, message: string, log: string): RevisionActionState<T> {
  console.error(log, error);
  return { error: message };
}

export class RevisionController {
  constructor(
    private readonly revision: RevisionRepository,
    private readonly documents: DocumentRepository,
    private readonly ai: AiService,
    private readonly results: LearningResultsRepository,
    private readonly attempts: QuizAttemptRepository,
  ) {}

  async loadDashboard(input: {
    readonly viewerName: string;
    readonly documentId: number | null;
  }): Promise<RevisionDashboardModel> {
    const [documents, subjects, documentSubjects, notes, progress, days] = await Promise.all([
      this.documents.listForCurrentUser(),
      this.revision.listSubjects(),
      this.revision.listDocumentSubjects(),
      this.revision.listNotes(revisionRules.maxNotes),
      this.revision.listProgress(),
      this.revision.listActivityDays(revisionRules.streakLookbackDays),
    ]);

    const progressByDocument = new Map(progress.map((item) => [item.documentId, item]));
    const sources = documents.map((document) =>
      this.toSource(document, documentSubjects.get(document.id) ?? null, progressByDocument.get(document.id)),
    );

    // Open the requested document, else the one read most recently, else the newest ready one.
    const ready = sources.filter((source) => source.status === "ready");
    const recent = progress.find((item) => ready.some((source) => source.id === item.documentId));
    const openId =
      ready.find((source) => source.id === input.documentId)?.id ?? recent?.documentId ?? ready[0]?.id ?? null;

    const now = Date.now();
    const streak = revisionStreak(days, now);

    return {
      viewerName: input.viewerName,
      generatedAt: new Date(now).toISOString(),
      subjects,
      sources,
      notes,
      reader: openId === null ? null : await this.loadReader(openId, progressByDocument.get(openId)),
      streakDays: streak.days,
      revisedToday: streak.today,
    };
  }

  async openDocument(documentId: number): Promise<RevisionActionState<ReaderDocument>> {
    try {
      const progress = (await this.revision.listProgress()).find((item) => item.documentId === documentId);
      const reader = await this.loadReader(documentId, progress);

      return reader ? { value: reader } : { error: "This document is not ready to read yet." };
    } catch (error) {
      return failed(error, "The document could not be opened. Please try again.", "Opening document failed.");
    }
  }

  async createSubject(ownerId: string, rawName: string, rawColour: string): Promise<RevisionActionState<StudySubject>> {
    const validation = validateSubjectName(rawName);

    if (!validation.ok) {
      return { error: validation.error };
    }

    const colour = isSubjectColour(rawColour) ? rawColour : subjectColours[0];

    try {
      return { value: await this.revision.createSubject(ownerId, validation.name, colour) };
    } catch (error) {
      if (error instanceof Error && error.message === "duplicate_subject") {
        return { error: "You already have a subject with that name." };
      }

      return failed(error, "The subject could not be created.", "Creating subject failed.");
    }
  }

  async renameSubject(subjectId: number, rawName: string): Promise<RevisionActionState> {
    const validation = validateSubjectName(rawName);

    if (!validation.ok) {
      return { error: validation.error };
    }

    try {
      await this.revision.renameSubject(subjectId, validation.name);
      return {};
    } catch (error) {
      if (error instanceof Error && error.message === "duplicate_subject") {
        return { error: "You already have a subject with that name." };
      }

      return failed(error, "The subject could not be renamed.", "Renaming subject failed.");
    }
  }

  async deleteSubject(subjectId: number): Promise<RevisionActionState> {
    try {
      await this.revision.deleteSubject(subjectId);
      return {};
    } catch (error) {
      return failed(error, "The subject could not be deleted.", "Deleting subject failed.");
    }
  }

  async moveDocument(documentId: number, subjectId: number | null): Promise<RevisionActionState> {
    try {
      await this.revision.setDocumentSubject(documentId, subjectId);
      return {};
    } catch (error) {
      return failed(error, "The document could not be moved.", "Moving document failed.");
    }
  }

  async createNote(input: {
    readonly ownerId: string;
    readonly subjectId: number | null;
    readonly documentId: number | null;
    readonly sentenceIndex: number | null;
    readonly quote: string | null;
    readonly title: string;
  }): Promise<RevisionActionState<StudyNote>> {
    const title = input.title.trim().slice(0, revisionRules.noteTitleMaxLength);

    try {
      return {
        value: await this.revision.createNote({
          ...input,
          title,
          body: "",
          quote: input.quote ? quoteFromText(input.quote) : null,
          // A quote only makes sense with the passage it came from.
          sentenceIndex: input.documentId === null ? null : input.sentenceIndex,
        }),
      };
    } catch (error) {
      return failed(error, "The note could not be created.", "Creating note failed.");
    }
  }

  async updateNote(noteId: number, input: UpdateStudyNoteInput): Promise<RevisionActionState<StudyNote>> {
    const problem = validateNote(input);

    if (problem) {
      return { error: problem };
    }

    try {
      return { value: await this.revision.updateNote(noteId, input) };
    } catch (error) {
      return failed(error, "Your note could not be saved. Check your connection.", "Saving note failed.");
    }
  }

  async deleteNote(noteId: number): Promise<RevisionActionState> {
    try {
      await this.revision.deleteNote(noteId);
      return {};
    } catch (error) {
      return failed(error, "The note could not be deleted.", "Deleting note failed.");
    }
  }

  async addHighlight(input: CreateStudyHighlightInput): Promise<RevisionActionState<StudyHighlight>> {
    try {
      return { value: await this.revision.addHighlight(input) };
    } catch (error) {
      return failed(error, "The highlight could not be saved.", "Saving highlight failed.");
    }
  }

  async recolourHighlight(highlightId: number, colour: HighlightColour): Promise<RevisionActionState> {
    try {
      await this.revision.recolourHighlight(highlightId, colour);
      return {};
    } catch (error) {
      return failed(error, "The colour could not be changed.", "Changing highlight colour failed.");
    }
  }

  async removeHighlights(highlightIds: readonly number[]): Promise<RevisionActionState> {
    try {
      await this.revision.removeHighlights(highlightIds);
      return {};
    } catch (error) {
      return failed(error, "The highlight could not be removed.", "Removing highlights failed.");
    }
  }

  async recordProgress(documentId: number, sentenceIndex: number): Promise<number | null> {
    try {
      return await this.revision.recordProgress(documentId, sentenceIndex);
    } catch (error) {
      console.error("Saving reading progress failed.", error);
      return null;
    }
  }

  /** Runs the existing content analysis on a document and saves the result. */
  async analyse(documentId: number): Promise<RevisionActionState<RevisionAnalysis>> {
    try {
      // Row-level security returns only the student's own documents.
      const document = await this.documents.findById(documentId);

      if (!document || document.status !== "ready") {
        return { error: "This document is not ready for analysis yet." };
      }

      const content = await this.documents.findContent(documentId);
      const sentences = content ? limitSentencesForAi(content.sentences) : [];

      if (sentences.length === 0) {
        return { error: "This document has no text to analyse." };
      }

      await this.ai.analyseAndSaveDocument(documentId, { sentences, ...analysisRequest });
      const { analysis } = await this.revision.findLatestAnalysis(documentId);

      return analysis ? { value: analysis } : { error: "The analysis finished but could not be loaded." };
    } catch (error) {
      return failed(
        error,
        "Analysis is not available right now. Make sure the AI service is running and try again.",
        "Revision analysis failed.",
      );
    }
  }

  /** The full saved analysis of a document, to read on the dashboard. */
  async savedAnalysis(documentId: number): Promise<RevisionActionState<SavedContentAnalysis>> {
    try {
      // Row-level security returns only the student's own documents' analyses.
      const analysis = await this.results.findLatestReadyAnalysis(documentId);

      return analysis ? { value: analysis } : { error: "This document has no saved analysis yet." };
    } catch (error) {
      return failed(error, "The analysis could not be loaded. Please try again.", "Loading saved analysis failed.");
    }
  }

  /** A saved quiz's questions, without answers, to take on the dashboard. */
  async savedQuiz(quizId: number): Promise<RevisionActionState<SavedQuiz>> {
    try {
      const quiz = await this.results.findSavedQuiz(quizId);

      return quiz ? { value: quiz } : { error: "This quiz is no longer available." };
    } catch (error) {
      return failed(error, "The quiz could not be loaded. Please try again.", "Loading saved quiz failed.");
    }
  }

  private async quizzesFor(documentId: number): Promise<RevisionQuiz[]> {
    const [quizzes, attempts] = await Promise.all([
      this.results.listSavedQuizzes(revisionQuizLimit, documentId),
      this.attempts.listAttempts({ limit: attemptLookback }),
    ]);

    return quizzes.map((quiz) => {
      const mine = attempts.filter((attempt) => attempt.quizId === quiz.id);

      return {
        id: quiz.id,
        title: quiz.title,
        difficulty: quiz.difficulty,
        questionCount: quiz.questionCount,
        createdAt: quiz.createdAt,
        attempts: mine.length,
        bestPercentage: mine.length > 0 ? Math.max(...mine.map((attempt) => attempt.percentage)) : null,
      };
    });
  }

  private toSource(
    document: LearningDocument,
    subjectId: number | null,
    progress: ReadingProgress | undefined,
  ): RevisionSource {
    const data = document.data;

    return {
      id: document.id,
      title: document.title,
      fileName: document.fileName,
      mimeType: data.mimeType,
      status: document.status,
      subjectId,
      pageCount: data.content?.pageCount ?? null,
      sentenceCount: data.content?.sentenceCount ?? null,
      progressPercent: progress?.percent ?? 0,
      lastSentence: progress?.lastSentence ?? 0,
      progressUpdatedAt: progress?.updatedAt ?? null,
      createdAt: data.createdAt,
    };
  }

  private async loadReader(
    documentId: number,
    progress: ReadingProgress | undefined,
  ): Promise<ReaderDocument | null> {
    const document = await this.documents.findById(documentId);

    if (!document || document.status !== "ready") {
      return null;
    }

    const [content, highlights, latest, quizzes] = await Promise.all([
      this.documents.findContent(documentId),
      this.revision.listHighlights(documentId),
      this.revision.findLatestAnalysis(documentId),
      // Quizzes are extra: the document still opens if they cannot be listed.
      this.quizzesFor(documentId).catch((error: unknown) => {
        console.error("Listing quizzes for the dashboard failed.", error);
        return [];
      }),
    ]);

    if (!content) {
      return null;
    }

    const keyIndexes = new Set(latest.analysis?.keyPoints.map((point) => point.index) ?? []);

    return {
      id: document.id,
      title: document.title,
      fileName: document.fileName,
      mimeType: document.data.mimeType,
      pageCount: content.pageCount,
      sentenceCount: content.sentences.length,
      blocks: buildReaderBlocks(content.sentences, keyIndexes),
      highlights,
      progressPercent: progress?.percent ?? 0,
      lastSentence: progress?.lastSentence ?? 0,
      analysis: latest.analysis,
      analysisRunning: latest.running,
      quizzes,
    };
  }
}
