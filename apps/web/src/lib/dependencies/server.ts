import { AdminController } from "@/controllers/admin/admin.controller";
import { AiController } from "@/controllers/ai/ai.controller";
import { ContentAnalysisController } from "@/controllers/analysis/content-analysis.controller";
import { LearningResultsController } from "@/controllers/learning-results.controller";
import { AuthController } from "@/controllers/auth/auth.controller";
import { ChatController } from "@/controllers/chat/chat.controller";
import { PasswordResetController } from "@/controllers/auth/password-reset.controller";
import { DocumentController } from "@/controllers/documents/document.controller";
import { ForumController } from "@/controllers/forum/forum.controller";
import { NotificationController } from "@/controllers/notifications/notification.controller";
import { StudyBuddyController } from "@/controllers/peers/study-buddy.controller";
import { ProfileController } from "@/controllers/profile/profile.controller";
import { QuizController } from "@/controllers/quizzes/quiz.controller";
import { RevisionController } from "@/controllers/revision/revision.controller";
import { HttpAiService } from "@/lib/ai/http-ai-service";
import { AfterBackgroundTaskRunner } from "@/lib/next/after-background-task-runner";
import { SupabaseChatRepository } from "@/lib/supabase/repositories/supabase-chat.repository";
import { SupabaseDocumentRepository } from "@/lib/supabase/repositories/supabase-document.repository";
import { SupabaseForumRepository } from "@/lib/supabase/repositories/supabase-forum.repository";
import { SupabaseLearningResultsRepository } from "@/lib/supabase/repositories/supabase-learning-results.repository";
import { SupabaseNotificationRepository } from "@/lib/supabase/repositories/supabase-notification.repository";
import { SupabaseProfileRepository } from "@/lib/supabase/repositories/supabase-profile.repository";
import { SupabaseRevisionRepository } from "@/lib/supabase/repositories/supabase-revision.repository";
import { SupabaseStudyBuddyRepository } from "@/lib/supabase/repositories/supabase-study-buddy.repository";
import { SupabaseChatAttachmentStorage } from "@/lib/supabase/storage/supabase-chat-attachment-storage";
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

export async function createContentAnalysisController(): Promise<ContentAnalysisController> {
  const supabase = await createClient();

  return new ContentAnalysisController(
    new HttpAiService(),
    new SupabaseDocumentRepository(supabase),
  );
}

export async function createQuizController(): Promise<QuizController> {
  const supabase = await createClient();

  return new QuizController(
    new HttpAiService(),
    new SupabaseDocumentRepository(supabase),
    new SupabaseLearningResultsRepository(supabase),
  );
}

export async function createLearningResultsController(): Promise<LearningResultsController> {
  const supabase = await createClient();

  return new LearningResultsController(new SupabaseLearningResultsRepository(supabase));
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

  return new DocumentController(
    documents,
    new SupabaseDocumentStorage(supabase),
    new HttpAiService(),
    new AfterBackgroundTaskRunner(),
  );
}

export async function createForumController(): Promise<ForumController> {
  const supabase = await createClient();

  return new ForumController(
    new SupabaseForumRepository(supabase),
    new SupabaseForumAttachmentStorage(supabase),
  );
}

export async function createStudyBuddyController(): Promise<StudyBuddyController> {
  const supabase = await createClient();

  return new StudyBuddyController(
    new SupabaseStudyBuddyRepository(supabase),
    new SupabaseProfileRepository(supabase),
  );
}

export async function createChatController(): Promise<ChatController> {
  const supabase = await createClient();

  return new ChatController(
    new SupabaseChatRepository(supabase),
    new SupabaseChatAttachmentStorage(supabase),
    new SupabaseStudyBuddyRepository(supabase),
    new SupabaseDocumentRepository(supabase),
  );
}

export async function createRevisionController(): Promise<RevisionController> {
  const supabase = await createClient();

  return new RevisionController(
    new SupabaseRevisionRepository(supabase),
    new SupabaseDocumentRepository(supabase),
    new HttpAiService(),
  );
}

export async function createNotificationController(): Promise<NotificationController> {
  const supabase = await createClient();

  return new NotificationController(new SupabaseNotificationRepository(supabase));
}
