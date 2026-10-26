import type {
  ContentAnalysisRequest,
  ContentAnalysisResult,
} from "@/models/analysis/content-analysis.model";
import type { DocumentProcessingResult } from "@/models/document/document.model";
import type {
  GeneratedQuiz,
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
  generateQuiz(request: QuizGenerationRequest): Promise<GeneratedQuiz>;
}
