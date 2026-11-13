import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AvatarStorage } from "@/interfaces/services/avatar-storage.interface";
import { avatarExtensions, type AvatarType } from "@/models/profile/avatar.model";

const avatarsBucket = "avatars";

/** Signed links last a day; the app's own link is cached for less than that. */
export const avatarUrlLifetimeSeconds = 24 * 60 * 60;

export class SupabaseAvatarStorage implements AvatarStorage {
  constructor(private readonly supabase: SupabaseClient) {}

  async upload(ownerId: string, body: Blob, type: AvatarType): Promise<string> {
    // The owner's id must be the first folder: Storage policies check it.
    const path = `${ownerId}/${randomUUID()}.${avatarExtensions[type]}`;
    const { error } = await this.supabase.storage.from(avatarsBucket).upload(path, body, {
      // Each picture has its own name and never changes.
      cacheControl: "31536000",
      contentType: type,
      upsert: false,
    });

    if (error) {
      throw new Error(`Unable to upload profile picture: ${error.message}`);
    }

    return path;
  }

  async remove(path: string): Promise<void> {
    const { error } = await this.supabase.storage.from(avatarsBucket).remove([path]);

    if (error) {
      throw new Error(`Unable to remove profile picture: ${error.message}`);
    }
  }

  async createViewUrl(path: string): Promise<string | null> {
    const { data, error } = await this.supabase.storage
      .from(avatarsBucket)
      .createSignedUrl(path, avatarUrlLifetimeSeconds);

    if (error) {
      // Not found, or not visible to this user.
      return null;
    }

    return data.signedUrl;
  }
}
