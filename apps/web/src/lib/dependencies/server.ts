import { AdminController } from "@/controllers/admin/admin.controller";
import { AdminUsersController } from "@/controllers/admin/admin-users.controller";
import { AuditLogController } from "@/controllers/admin/audit-log.controller";
import { ForumModerationController } from "@/controllers/admin/forum-moderation.controller";
import { SystemMonitoringController } from "@/controllers/admin/system-monitoring.controller";
import { AiController } from "@/controllers/ai/ai.controller";
import { ContentAnalysisController } from "@/controllers/analysis/content-analysis.controller";
import { LearningResultsController } from "@/controllers/learning-results.controller";
import { AuthController } from "@/controllers/auth/auth.controller";
import { ChatController } from "@/controllers/chat/chat.controller";
import { ReportReviewController } from "@/controllers/admin/report-review.controller";
import { ReportController } from "@/controllers/reports/report.controller";
import { ChatGroupController } from "@/controllers/chat/chat-group.controller";
import { PasswordResetController } from "@/controllers/auth/password-reset.controller";
import { DocumentController } from "@/controllers/documents/document.controller";
import { ForumController } from "@/controllers/forum/forum.controller";
import { NotificationController } from "@/controllers/notifications/notification.controller";
import { StudyBuddyController } from "@/controllers/peers/study-buddy.controller";
import { ProfileController } from "@/controllers/profile/profile.controller";
import { QuizController } from "@/controllers/quizzes/quiz.controller";
import { QuizAttemptController } from "@/controllers/quizzes/quiz-attempt.controller";
import { RevisionController } from "@/controllers/revision/revision.controller";
import { VideoCallController } from "@/controllers/video/video-call.controller";
import { LiveKitVideoRoomService } from "@/lib/livekit/livekit-video-room.service";
import { HttpAiService } from "@/lib/ai/http-ai-service";
import { AfterBackgroundTaskRunner } from "@/lib/next/after-background-task-runner";
import { SupabaseChatGroupRepository } from "@/lib/supabase/repositories/supabase-chat-group.repository";
import { SupabaseChatRepository } from "@/lib/supabase/repositories/supabase-chat.repository";
import { SupabaseReportModerationRepository } from "@/lib/supabase/repositories/supabase-report-moderation.repository";
import { SupabaseReportRepository } from "@/lib/supabase/repositories/supabase-report.repository";
import { SupabaseDocumentRepository } from "@/lib/supabase/repositories/supabase-document.repository";
import { SupabaseForumRepository } from "@/lib/supabase/repositories/supabase-forum.repository";
import { SupabaseLearningResultsRepository } from "@/lib/supabase/repositories/supabase-learning-results.repository";
import { SupabaseQuizAttemptRepository } from "@/lib/supabase/repositories/supabase-quiz-attempt.repository";
import { SupabaseNotificationRepository } from "@/lib/supabase/repositories/supabase-notification.repository";
import { SupabaseProfileRepository } from "@/lib/supabase/repositories/supabase-profile.repository";
import { SupabaseRevisionRepository } from "@/lib/supabase/repositories/supabase-revision.repository";
import { SupabaseStudyBuddyRepository } from "@/lib/supabase/repositories/supabase-study-buddy.repository";
import { SupabaseVideoCallRepository } from "@/lib/supabase/repositories/supabase-video-call.repository";
import { SupabaseChatAttachmentStorage } from "@/lib/supabase/storage/supabase-chat-attachment-storage";
import { SupabaseDocumentStorage } from "@/lib/supabase/storage/supabase-document-storage";
import { SupabaseForumAttachmentStorage } from "@/lib/supabase/storage/supabase-forum-attachment-storage";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { SupabaseAdminUsersRepository } from "@/lib/supabase/repositories/supabase-admin-users.repository";
import { SupabaseAuditLogRepository } from "@/lib/supabase/repositories/supabase-audit-log.repository";
import { SupabaseForumModerationRepository } from "@/lib/supabase/repositories/supabase-forum-moderation.repository";
import { SupabaseSystemMonitoringRepository } from "@/lib/supabase/repositories/supabase-system-monitoring.repository";
import { SupabaseAccountAccessService } from "@/lib/supabase/services/supabase-account-access.service";
import { defaultPlatformStorageCapacityBytes } from "@/models/admin/system-monitoring.model";
import { SupabaseAuthService } from "@/lib/supabase/services/supabase-auth.service";
import { SupabaseLoginAttemptStore } from "@/lib/supabase/services/supabase-login-attempt-store";
import { SupabaseUsernameDirectory } from "@/lib/supabase/services/supabase-username-directory";
import { LibraryController } from "@/controllers/library/library.controller";
import { SupabaseLibraryRepository } from "@/lib/supabase/repositories/supabase-library.repository";
import { SupabaseLibraryStorage } from "@/lib/supabase/storage/supabase-library-storage";
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

export async function createQuizAttemptController(): Promise<QuizAttemptController> {
  const supabase = await createClient();

  return new QuizAttemptController(new SupabaseQuizAttemptRepository(supabase));
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

// Admin modules run with the admin's own session: every admin_* database
// function re-checks the caller's role, so a stolen form post cannot act as
// an administrator. Only the Auth ban uses the secret key.
export async function createAdminUsersController(): Promise<AdminUsersController> {
  const supabase = await createClient();

  return new AdminUsersController(
    new SupabaseAdminUsersRepository(supabase),
    new SupabaseAccountAccessService(createServiceRoleClient),
  );
}

export async function createReportController(): Promise<ReportController> {
  return new ReportController(new SupabaseReportRepository(await createClient()));
}

export async function createReportReviewController(): Promise<ReportReviewController> {
  return new ReportReviewController(
    new SupabaseReportModerationRepository(await createClient()),
    await createAdminUsersController(),
    () => new SupabaseChatAttachmentStorage(createServiceRoleClient()),
  );
}

export async function createForumModerationController(): Promise<ForumModerationController> {
  return new ForumModerationController(
    new SupabaseForumModerationRepository(await createClient()),
  );
}

export async function createAuditLogController(): Promise<AuditLogController> {
  return new AuditLogController(new SupabaseAuditLogRepository(await createClient()));
}

function platformStorageCapacityBytes(): number {
  const configured = Number(process.env.PLATFORM_STORAGE_CAPACITY_BYTES);

  return Number.isFinite(configured) && configured > 0
    ? configured
    : defaultPlatformStorageCapacityBytes;
}

export async function createSystemMonitoringController(): Promise<SystemMonitoringController> {
  return new SystemMonitoringController(
    new SupabaseSystemMonitoringRepository(await createClient()),
    new HttpAiService(),
    platformStorageCapacityBytes(),
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
    new SupabaseChatGroupRepository(supabase),
  );
}

export async function createVideoCallController(): Promise<VideoCallController> {
  const supabase = await createClient();

  return new VideoCallController(
    new SupabaseVideoCallRepository(supabase, createServiceRoleClient),
    new LiveKitVideoRoomService(),
    new SupabaseStudyBuddyRepository(supabase),
    new SupabaseDocumentRepository(supabase),
    () => new SupabaseDocumentStorage(createServiceRoleClient()),
  );
}

export async function createChatGroupController(): Promise<ChatGroupController> {
  const supabase = await createClient();

  return new ChatGroupController(new SupabaseChatGroupRepository(supabase));
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

export async function createLibraryController(): Promise<LibraryController> {
  const supabase = await createClient();

  return new LibraryController(
    new SupabaseLibraryRepository(supabase, createServiceRoleClient),
    new SupabaseLibraryStorage(createServiceRoleClient),
    new SupabaseDocumentRepository(supabase),
  );
}