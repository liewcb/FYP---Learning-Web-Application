import type { AvatarType } from "@/models/profile/avatar.model";

/** Profile picture files. Paths are <owner id>/<random id>.<extension>. */
export interface AvatarStorage {
  /** Stores a new picture for the owner and returns its path. */
  upload(ownerId: string, body: Blob, type: AvatarType): Promise<string>;
  remove(path: string): Promise<void>;
  /** A short-lived link to the picture, or null when it no longer exists. */
  createViewUrl(path: string): Promise<string | null>;
}
