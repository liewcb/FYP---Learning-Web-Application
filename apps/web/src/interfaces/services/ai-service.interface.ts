import type {
  ContentAnalysisRequest,
  ContentAnalysisResult,
  PersistedContentAnalysisResult,
} from "@/models/analysis/content-analysis.model";
import type { DocumentProcessingResult } from "@/models/document/document.model";
import type {
  GeneratedQuiz,
  PersistedGeneratedQuiz,
  QuizGenerationRequest,
} from "@/models/quiz/quiz.model";

export interface AiServiceStatus {
  readonly status: "ok";
}

export interface AiService {
  checkHealth(): Promise<AiServiceStatus>;
  /** Extract, clean and store the text of an uploaded document. */
  processDocument(documentId: number): Promise<DocumentProcessingResult>;
  analyseContent(request: ContentAnalysisRequest): Promise<ContentAnalysisResult>;
  /** Analyse a document's sentences and save the result to document_analyses. */
  analyseAndSaveDocument(
    documentId: number,
    request: ContentAnalysisRequest,
  ): Promise<PersistedContentAnalysisResult>;
  generateQuiz(request: QuizGenerationRequest): Promise<GeneratedQuiz>;
  /** Generate a quiz linked to a saved document analysis. */
  generateAndSaveQuiz(
    documentId: number,
    analysisId: number,
    request: QuizGenerationRequest,
  ): Promise<PersistedGeneratedQuiz>;
}
