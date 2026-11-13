import { loadCurrentAccount } from "@/controllers/shared/current-viewer";
import type { ProfileRepository } from "@/interfaces/repositories/profile.repository";
import type { AuthService } from "@/interfaces/services/auth-service.interface";
import type { AvatarStorage } from "@/interfaces/services/avatar-storage.interface";
import {
  avatarHref,
  avatarMessages,
  avatarRules,
  detectAvatarType,
  parseAvatarPath,
  type AvatarUpdateState,
} from "@/models/profile/avatar.model";
import {
  profileUpdateMessages,
  toProfileFormValues,
  validateProfileForm,
  type ProfileFormState,
  type ProfileFormValues,
  type ProfilePageModel,
  type Viewer,
} from "@/models/profile/profile.model";
import { emptyStudyPreferences } from "@/models/profile/study-profile.model";

export class ProfileController {
  constructor(
    private readonly auth: AuthService,
    private readonly profiles: ProfileRepository,
    private readonly avatars: AvatarStorage,
  ) {}

  /** Saves a new profile picture (already cropped and shrunk by the browser). */
  async uploadAvatar(file: Blob | null): Promise<AvatarUpdateState> {
    const user = await this.auth.getCurrentUser();

    if (!user) {
      return { status: "failed", error: avatarMessages.signedOut };
    }

    if (!file || file.size === 0) {
      return { status: "failed", error: avatarMessages.notImage };
    }

    if (file.size > avatarRules.maxBytes) {
      return { status: "failed", error: avatarMessages.tooLarge };
    }

    // Trust the bytes, not the name or the type the browser claimed.
    const type = detectAvatarType(new Uint8Array(await file.slice(0, 16).arrayBuffer()));

    if (!type) {
      return { status: "failed", error: avatarMessages.notImage };
    }

    const previous = (await this.profiles.findById(user.id))?.avatarPath ?? null;
    let path: string;

    try {
      path = await this.avatars.upload(user.id, file, type);
    } catch (error) {
      console.error("Uploading profile picture failed.", error);
      return { status: "failed", error: avatarMessages.unavailable };
    }

    try {
      await this.profiles.setOwnAvatar(user.id, path);
    } catch (error) {
      console.error("Saving profile picture failed.", error);
      await this.avatars.remove(path).catch(() => undefined);
      return { status: "failed", error: avatarMessages.unavailable };
    }

    await this.removeStoredAvatar(previous);

    return { status: "saved", avatarUrl: avatarHref(path) };
  }

  async removeAvatar(): Promise<AvatarUpdateState> {
    const user = await this.auth.getCurrentUser();

    if (!user) {
      return { status: "failed", error: avatarMessages.signedOut };
    }

    const previous = (await this.profiles.findById(user.id))?.avatarPath ?? null;

    try {
      await this.profiles.setOwnAvatar(user.id, null);
    } catch (error) {
      console.error("Removing profile picture failed.", error);
      return { status: "failed", error: avatarMessages.unavailable };
    }

    await this.removeStoredAvatar(previous);

    return { status: "saved", avatarUrl: null };
  }

  /** A short-lived link to anyone's picture, for signed-in users only. */
  async avatarViewUrl(path: string): Promise<string | null> {
    const parsed = parseAvatarPath(path);

    if (!parsed || !(await this.auth.getCurrentUser())) {
      return null;
    }

    return this.avatars.createViewUrl(parsed.path);
  }

  /** The old file is only clutter once the profile no longer points at it. */
  private async removeStoredAvatar(path: string | null) {
    if (path && parseAvatarPath(path)) {
      await this.avatars.remove(path).catch((error: unknown) => {
        console.error("Removing the old profile picture failed.", error);
      });
    }
  }

  async currentViewer(): Promise<Viewer | null> {
    const current = await loadCurrentAccount(this.auth, this.profiles);

    return current?.viewer ?? null;
  }

  async page(): Promise<ProfilePageModel | null> {
    const current = await loadCurrentAccount(this.auth, this.profiles);

    if (!current) {
      return null;
    }

    const account = await this.profiles.getOwnAccount();

    return {
      viewer: current.viewer,
      profile: current.profile,
      account,
      formValues: toProfileFormValues({
        ...current.profile,
        preferences: account?.preferences ?? emptyStudyPreferences,
      }),
    };
  }

  async update(values: ProfileFormValues): Promise<ProfileFormState> {
    const user = await this.auth.getCurrentUser();

    if (!user) {
      return { error: "Your session has expired. Please log in again.", values };
    }

    const result = validateProfileForm(values);

    if (!result.ok) {
      return { fieldErrors: result.fieldErrors, values };
    }

    const outcome = await this.profiles.updateOwn(user.id, result.update);

    if (outcome.status === "failed") {
      return outcome.reason === "username_taken"
        ? {
            fieldErrors: { username: profileUpdateMessages.username_taken },
            values,
          }
        : { error: profileUpdateMessages.unavailable, values };
    }

    return {
      notice: profileUpdateMessages.saved,
      values: toProfileFormValues(result.update),
    };
  }
}
