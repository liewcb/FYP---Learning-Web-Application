export interface AiServiceStatus {
  readonly status: "ok";
}

export interface AiService {
  checkHealth(): Promise<AiServiceStatus>;
}
