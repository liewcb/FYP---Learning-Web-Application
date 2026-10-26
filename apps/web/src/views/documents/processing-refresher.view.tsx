"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const firstRefreshMs = 5_000;
const maxRefreshMs = 60_000;

interface ProcessingRefresherProps {
  readonly active: boolean;
}

/**
 * Re-renders the page while text extraction runs, keeping client state. Each
 * refresh also lets the server restart missed extractions, so the delay grows
 * to avoid hammering an AI service that is offline.
 */
export function ProcessingRefresher({ active }: ProcessingRefresherProps) {
  const router = useRouter();

  useEffect(() => {
    if (!active) {
      return;
    }

    let delay = firstRefreshMs;
    let timer = 0;

    function schedule() {
      timer = window.setTimeout(() => {
        router.refresh();
        delay = Math.min(delay * 1.5, maxRefreshMs);
        schedule();
      }, delay);
    }

    schedule();

    return () => window.clearTimeout(timer);
  }, [active, router]);

  return null;
}
