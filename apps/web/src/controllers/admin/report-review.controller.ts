import type { ReportModerationRepository } from "@/interfaces/repositories/report-moderation.repository";
import type { ChatAttachmentStorage } from "@/interfaces/services/chat-attachment-storage.interface";
import type { AdminUserActionState } from "@/models/admin/admin-users.model";
import {
  decisionsFor,
  decisionSuspends,
  reportReviewPageSize,
  reportRules,
  resolveMessages,
  type ReportDecision,
  type ReportDecisionState,
  type ReportReviewFilters,
  type ReportReviewModel,
} from "@/models/reports/report.model";

/** Suspends an account the way User management does, sign-in block included. */
export interface AccountSuspender {
  suspend(userId: string, reason: string): Promise<AdminUserActionState>;
}

/** The queue of reports, and the decisions moderators make on them. */
export class ReportReviewController {
  constructor(
    private readonly reports: ReportModerationRepository,
    private readonly accounts: AccountSuspender,
    /**
     * Deletes removed chat attachments, which belong to the sender, so it
     * runs with server privileges; created only when a file was removed.
     */
    private readonly attachments: () => ChatAttachmentStorage,
  ) {}

  async load(filters: ReportReviewFilters): Promise<ReportReviewModel> {
    const offset = (filters.page - 1) * reportReviewPageSize;
    const [page, open, selected] = await Promise.all([
      this.reports.list(filters, reportReviewPageSize, offset),
      filters.status === "pending" && filters.targetType === "all"
        ? null
        : this.reports.list({ status: "pending", targetType: "all" }, 1, 0),
      filters.reportId === null ? null : this.reports.find(filters.reportId),
    ]);

    return {
      filters,
      reports: page.reports,
      total: page.total,
      pageCount: Math.max(1, Math.ceil(page.total / reportReviewPageSize)),
      openCount: open ? open.total : page.total,
      selected,
      decisions: selected ? decisionsFor(selected.targetType, selected.reportedUser) : [],
    };
  }

  async decide(input: {
    readonly reportId: number;
    readonly decision: ReportDecision;
    readonly reporterMessage: string;
    readonly note: string;
  }): Promise<ReportDecisionState> {
    const reporterMessage = input.reporterMessage.trim();
    const note = input.note.trim();

    if (reporterMessage.length > reportRules.messageMax) {
      return { error: `Keep the message to the reporter under ${reportRules.messageMax} characters.` };
    }

    if (note.length > reportRules.noteMax) {
      return { error: `Keep the reason under ${reportRules.noteMax} characters.` };
    }

    if (input.decision !== "no_violation" && !note) {
      return { error: resolveMessages.reason_required };
    }

    try {
      const report = await this.reports.find(input.reportId);

      if (!report) {
        return { error: resolveMessages.not_found };
      }

      if (report.status !== "pending") {
        return { error: resolveMessages.already_resolved };
      }

      if (!decisionsFor(report.targetType, report.reportedUser).includes(input.decision)) {
        return { error: resolveMessages.not_applicable };
      }

      // Suspension first: User management blocks sign-in and writes its own
      // audit record. The decision is recorded only once that worked.
      let suspendedNotice = "";

      if (decisionSuspends(input.decision) && report.reportedUser?.accountStatus !== "suspended") {
        const suspended = await this.accounts.suspend(report.reportedUser!.id, note);

        if (suspended.error) {
          return { error: suspended.error };
        }

        suspendedNotice = ` ${suspended.notice ?? ""}`;
      }

      const result = await this.reports.resolve({
        reportId: input.reportId,
        decision: input.decision,
        reporterMessage: reporterMessage || null,
        note: note || null,
      });

      if (result.outcome !== "resolved") {
        return { error: resolveMessages[result.outcome] };
      }

      if (result.removedPath) {
        await this.attachments()
          .remove([result.removedPath])
          .catch((error: unknown) => console.error("Removed chat attachment cleanup failed.", error));
      }

      const reporters = result.closedReports === 1 ? "The reporter was" : `${result.closedReports} reporters were`;

      return { notice: `Decision saved. ${reporters} notified.${suspendedNotice}` };
    } catch (error) {
      console.error("Report decision failed.", error);
      return { error: "The decision could not be saved. Please try again." };
    }
  }
}
