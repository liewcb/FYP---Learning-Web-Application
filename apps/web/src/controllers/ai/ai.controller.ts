import type {
  AiService,
  AiServiceStatus,
} from "@/interfaces/services/ai-service.interface";

export class AiController {
  constructor(private readonly aiService: AiService) {}

  checkHealth(): Promise<AiServiceStatus> {
    return this.aiService.checkHealth();
  }
}
