import type {
  AiService,
  AiServiceStatus,
} from "@/interfaces/services/ai-service.interface";
import type {
  ContentAnalysisRequest,
  ContentAnalysisResult,
} from "@/models/analysis/content-analysis.model";
import type {
  GeneratedQuiz,
  QuizGenerationRequest,
} from "@/models/quiz/quiz.model";

export class HttpAiService implements AiService {
  constructor(
    private readonly baseUrl = process.env.AI_SERVICE_URL ??
      "http://localhost:8000",
  ) {}

  async checkHealth(): Promise<AiServiceStatus> {
    const response = await fetch(`${this.baseUrl}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      throw new Error(`AI service returned HTTP ${response.status}.`);
    }

    const body: unknown = await response.json();

    if (
      typeof body !== "object" ||
      body === null ||
      !("status" in body) ||
      body.status !== "ok"
    ) {
      throw new Error("AI service returned an invalid health response.");
    }

    return { status: "ok" };
  }

  analyseContent(
    request: ContentAnalysisRequest,
  ): Promise<ContentAnalysisResult> {
    // The first run can download and initialise the local NLP models.
    return this.post<ContentAnalysisResult>(
      "/analysis/content",
      request,
      180_000,
    );
  }

  generateQuiz(request: QuizGenerationRequest): Promise<GeneratedQuiz> {
    // Gemini may retry temporary 429/5xx responses inside the AI service.
    return this.post<GeneratedQuiz>("/quiz/generate", request, 190_000);
  }

  private async post<T>(
    path: string,
    body: unknown,
    timeoutMs: number,
  ): Promise<T> {
    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new Error("The AI service took too long to respond.");
      }

      throw new Error(
        "The AI service is unavailable. Start it with pnpm.cmd dev:ai and try again.",
      );
    }

    const responseBody: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const detail =
        typeof responseBody === "object" &&
        responseBody !== null &&
        "detail" in responseBody &&
        typeof responseBody.detail === "string"
          ? responseBody.detail
          : `AI service returned HTTP ${response.status}.`;

      throw new Error(detail);
    }

    return responseBody as T;
  }
}
