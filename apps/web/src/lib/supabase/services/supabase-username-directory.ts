import type { SupabaseClient } from "@supabase/supabase-js";

import type { UsernameDirectory } from "@/interfaces/services/username-directory.interface";

export class SupabaseUsernameDirectory implements UsernameDirectory {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly createServiceClient: () => SupabaseClient,
  ) {}

  async isAvailable(username: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc("is_username_available", {
      p_username: username,
    });

    if (error) {
      throw new Error(`Unable to check username: ${error.message}`);
    }

    return data === true;
  }

  async findLoginEmail(username: string): Promise<string | null> {
    const { data, error } = await this.createServiceClient().rpc(
      "get_login_email",
      { p_username: username },
    );

    if (error) {
      throw new Error(`Unable to look up username: ${error.message}`);
    }

    return typeof data === "string" && data ? data : null;
  }
}
