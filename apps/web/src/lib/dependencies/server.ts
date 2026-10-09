import { AdminController } from "@/controllers/admin/admin.controller";
import { AiController } from "@/controllers/ai/ai.controller";
import { AuthController } from "@/controllers/auth/auth.controller";
import { DocumentController } from "@/controllers/documents/document.controller";
import { ProfileController } from "@/controllers/profile/profile.controller";
import { HttpAiService } from "@/lib/ai/http-ai-service";
import { SupabaseDocumentRepository } from "@/lib/supabase/repositories/supabase-document.repository";
import { SupabaseProfileRepository } from "@/lib/supabase/repositories/supabase-profile.repository";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { SupabaseAuthService } from "@/lib/supabase/services/supabase-auth.service";
import { SupabaseUsernameDirectory } from "@/lib/supabase/services/supabase-username-directory";

export function createAiController(): AiController {
  return new AiController(new HttpAiService());
}

export async function createAuthController(): Promise<AuthController> {
  const supabase = await createClient();

  return new AuthController(
    new SupabaseAuthService(supabase),
    new SupabaseUsernameDirectory(supabase, createServiceRoleClient),
  );
}

export async function createProfileController(): Promise<ProfileController> {
  const supabase = await createClient();

  return new ProfileController(
    new SupabaseAuthService(supabase),
    new SupabaseProfileRepository(supabase),
  );
}

export async function createAdminController(): Promise<AdminController> {
  const supabase = await createClient();

  return new AdminController(
    new SupabaseAuthService(supabase),
    new SupabaseProfileRepository(supabase),
  );
}

export async function createDocumentController(): Promise<DocumentController> {
  const supabase = await createClient();
  const documents = new SupabaseDocumentRepository(supabase);

  return new DocumentController(documents);
}
