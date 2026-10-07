import { AiController } from "@/controllers/ai/ai.controller";
import { DocumentController } from "@/controllers/documents/document.controller";
import { HttpAiService } from "@/lib/ai/http-ai-service";
import { SupabaseDocumentRepository } from "@/lib/supabase/repositories/supabase-document.repository";
import { createClient } from "@/lib/supabase/server";

export function createAiController(): AiController {
  return new AiController(new HttpAiService());
}

export async function createDocumentController(): Promise<DocumentController> {
  const supabase = await createClient();
  const documents = new SupabaseDocumentRepository(supabase);

  return new DocumentController(documents);
}
