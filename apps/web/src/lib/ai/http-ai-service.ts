import type {
  AiService,
  AiServiceStatus,
} from "@/interfaces/services/ai-service.interface";

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
}
