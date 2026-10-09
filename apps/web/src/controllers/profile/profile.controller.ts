import { loadCurrentAccount } from "@/controllers/shared/current-viewer";
import type { ProfileRepository } from "@/interfaces/repositories/profile.repository";
import type { AuthService } from "@/interfaces/services/auth-service.interface";
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
  ) {}

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
