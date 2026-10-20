import { AdminController } from "@/controllers/admin/admin.controller";
import { AiController } from "@/controllers/ai/ai.controller";
import { ContentAnalysisController } from "@/controllers/analysis/content-analysis.controller";
import { AuthController } from "@/controllers/auth/auth.controller";
import { PasswordResetController } from "@/controllers/auth/password-reset.controller";
import { DocumentController } from "@/controllers/documents/document.controller";
import { ForumController } from "@/controllers/forum/forum.controller";
import { ProfileController } from "@/controllers/profile/profile.controller";
import { QuizController } from "@/controllers/quizzes/quiz.controller";
import { HttpAiService } from "@/lib/ai/http-ai-service";
import { SupabaseDocumentRepository } from "@/lib/supabase/repositories/supabase-document.repository";
import { SupabaseForumRepository } from "@/lib/supabase/repositories/supabase-forum.repository";
import { SupabaseProfileRepository } from "@/lib/supabase/repositories/supabase-profile.repository";
import { SupabaseDocumentStorage } from "@/lib/supabase/storage/supabase-document-storage";
import { SupabaseForumAttachmentStorage } from "@/lib/supabase/storage/supabase-forum-attachment-storage";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { SupabaseAuthService } from "@/lib/supabase/services/supabase-auth.service";
import { SupabaseLoginAttemptStore } from "@/lib/supabase/services/supabase-login-attempt-store";
import { SupabaseUsernameDirectory } from "@/lib/supabase/services/supabase-username-directory";

export function createAiController(): AiController {
  return new AiController(new HttpAiService());
}

export function createContentAnalysisController(): ContentAnalysisController {
  return new ContentAnalysisController(new HttpAiService());
}

export function createQuizController(): QuizController {
  return new QuizController(new HttpAiService());
}

export async function createAuthController(
  options: { persistentSession?: boolean } = {},
): Promise<AuthController> {
  const supabase = await createClient(options);

  return new AuthController(
    new SupabaseAuthService(supabase),
    new SupabaseUsernameDirectory(supabase, createServiceRoleClient),
    new SupabaseLoginAttemptStore(createServiceRoleClient),
  );
}

export async function createPasswordResetController(): Promise<PasswordResetController> {
  const supabase = await createClient();

  return new PasswordResetController(
    new SupabaseAuthService(supabase),
    new SupabaseUsernameDirectory(supabase, createServiceRoleClient),
    new SupabaseLoginAttemptStore(createServiceRoleClient),
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

  return new DocumentController(documents, new SupabaseDocumentStorage(supabase));
}

export async function createForumController(): Promise<ForumController> {
  const supabase = await createClient();

  return new ForumController(
    new SupabaseForumRepository(supabase),
    new SupabaseForumAttachmentStorage(supabase),
  );
}
