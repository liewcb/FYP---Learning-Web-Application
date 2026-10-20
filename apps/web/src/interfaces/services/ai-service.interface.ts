import type {
  ContentAnalysisRequest,
  ContentAnalysisResult,
} from "@/models/analysis/content-analysis.model";
import type {
  GeneratedQuiz,
  QuizGenerationRequest,
} from "@/models/quiz/quiz.model";

export interface AiServiceStatus {
  readonly status: "ok";
}

export interface AiService {
  checkHealth(): Promise<AiServiceStatus>;
  analyseContent(request: ContentAnalysisRequest): Promise<ContentAnalysisResult>;
  generateQuiz(request: QuizGenerationRequest): Promise<GeneratedQuiz>;
}
