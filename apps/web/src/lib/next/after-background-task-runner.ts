import { after } from "next/server";

import type { BackgroundTaskRunner } from "@/interfaces/services/background-task-runner.interface";

/**
 * Uses Next.js `after`, which keeps the server alive until the task finishes.
 * Must be called during a request, such as inside a Server Action.
 */
export class AfterBackgroundTaskRunner implements BackgroundTaskRunner {
  run(task: () => Promise<void>): void {
    after(task);
  }
}
