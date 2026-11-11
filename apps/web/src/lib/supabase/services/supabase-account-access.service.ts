import type { SupabaseClient } from "@supabase/supabase-js";

import type { AccountAccessService } from "@/interfaces/services/account-access.interface";

/** About 100 years: Supabase Auth has no "forever" ban duration. */
const indefiniteBan = "876000h";

/**
 * Uses the Auth admin API (secret key) to ban or unban a user. A banned user
 * cannot sign in or refresh a session; sign-in reports "user_banned", which
 * the sign-in page already shows as a suspended account.
 */
export class SupabaseAccountAccessService implements AccountAccessService {
  constructor(private readonly createAdminClient: () => SupabaseClient) {}

  async block(userId: string): Promise<void> {
    await this.setBan(userId, indefiniteBan);
  }

  async restore(userId: string): Promise<void> {
    await this.setBan(userId, "none");
  }

  private async setBan(userId: string, duration: string): Promise<void> {
    const { error } = await this.createAdminClient().auth.admin.updateUserById(userId, {
      ban_duration: duration,
    });

    if (error) {
      throw new Error(`Unable to update sign-in access: ${error.message}`);
    }
  }
}
