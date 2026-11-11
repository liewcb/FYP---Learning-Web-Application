import type { AdminUsersRepository } from "@/interfaces/repositories/admin-users.repository";
import type { AccountAccessService } from "@/interfaces/services/account-access.interface";
import {
  adminChangeMessages,
  adminUsersPageSize,
  isStorageQuotaOption,
  isValidUserId,
  suspensionReasonMax,
  type AdminUserActionState,
  type AdminUserFilters,
  type AdminUsersModel,
} from "@/models/admin/admin-users.model";

/** View, suspend, reactivate and resize storage for user accounts. */
export class AdminUsersController {
  constructor(
    private readonly users: AdminUsersRepository,
    private readonly access: AccountAccessService,
  ) {}

  async load(filters: AdminUserFilters, viewerId: string): Promise<AdminUsersModel> {
    const offset = (filters.page - 1) * adminUsersPageSize;
    const page = await this.users.list(filters, adminUsersPageSize, offset);

    return {
      ...page,
      filters,
      viewerId,
      pageCount: Math.max(1, Math.ceil(page.total / adminUsersPageSize)),
    };
  }

  async suspend(userId: string, rawReason: string): Promise<AdminUserActionState> {
    const reason = rawReason.trim();

    if (!isValidUserId(userId)) {
      return { error: adminChangeMessages.not_found };
    }

    if (reason.length > suspensionReasonMax) {
      return { error: `Keep the reason under ${suspensionReasonMax} characters.` };
    }

    try {
      // Database first: it enforces the rules (not yourself, not an admin)
      // and writes the audit record.
      const outcome = await this.users.setStatus(userId, true, reason || null);

      if (outcome !== "updated") {
        return { error: adminChangeMessages[outcome] };
      }

      try {
        await this.access.block(userId);
      } catch (error) {
        // Keep the two systems consistent: undo the status change if sign-in
        // could not be blocked.
        console.error("Blocking sign-in failed; reverting suspension.", error);
        await this.users.setStatus(userId, false, null);

        return { error: "Sign-in could not be blocked, so the account was left active. Try again." };
      }

      const ended = await this.users.endSessions(userId).catch(() => -1);

      return {
        notice:
          ended >= 0
            ? "Account suspended and signed out on every device."
            : "Account suspended. Open sessions will end within an hour.",
      };
    } catch (error) {
      console.error("Suspending account failed.", error);

      return { error: "The account could not be suspended. Please try again." };
    }
  }

  async reactivate(userId: string): Promise<AdminUserActionState> {
    if (!isValidUserId(userId)) {
      return { error: adminChangeMessages.not_found };
    }

    try {
      await this.access.restore(userId);
      const outcome = await this.users.setStatus(userId, false, null);

      return outcome === "updated"
        ? { notice: "Account reactivated. The student can sign in again." }
        : { error: adminChangeMessages[outcome] };
    } catch (error) {
      console.error("Reactivating account failed.", error);

      return { error: "The account could not be reactivated. Please try again." };
    }
  }

  async setStorageQuota(userId: string, rawBytes: string): Promise<AdminUserActionState> {
    const bytes = Number(rawBytes);

    if (!isValidUserId(userId) || !isStorageQuotaOption(bytes)) {
      return { error: adminChangeMessages.invalid };
    }

    try {
      const outcome = await this.users.setStorageQuota(userId, bytes);

      return outcome === "updated"
        ? { notice: "Storage quota updated." }
        : { error: adminChangeMessages[outcome] };
    } catch (error) {
      console.error("Changing storage quota failed.", error);

      return { error: "The storage quota could not be changed. Please try again." };
    }
  }
}
