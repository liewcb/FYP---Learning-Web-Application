import { createAiController } from "@/lib/dependencies/server";

export async function GET() {
  try {
    const status = await createAiController().checkHealth();

    return Response.json(status);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI service is unavailable.";

    return Response.json({ status: "error", message }, { status: 503 });
  }
}
