/** Runs work after the response has been sent, so students are not kept waiting. */
export interface BackgroundTaskRunner {
  run(task: () => Promise<void>): void;
}
