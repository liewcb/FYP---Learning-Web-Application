"use client";

import { useActionState } from "react";

import type {
  ProfileFormState,
  ProfileFormValues,
} from "@/models/profile/profile.model";
import { profileLimits } from "@/models/profile/study-profile.model";
import { StudyProfileFields } from "@/views/profile/study-profile-fields.view";

interface ProfileFormViewProps {
  readonly initialValues: ProfileFormValues;
  readonly action: (
    state: ProfileFormState,
    formData: FormData,
  ) => Promise<ProfileFormState>;
}

export function ProfileFormView({ initialValues, action }: ProfileFormViewProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? initialValues;
  const errors = state.fieldErrors ?? {};
  const usernameHint =
    "Used to log in and to let classmates find you. Lowercase letters, numbers and _.";

  return (
    <form className="profile-form" action={formAction} noValidate>
      {state.error ? (
        <p className="form-alert" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.notice ? (
        <p className="form-notice" role="status">
          {state.notice}
        </p>
      ) : null}

      <div className="profile-form-grid">
        <div className="form-field">
          <label htmlFor="fullName">Full name</label>
          <input
            id="fullName"
            name="fullName"
            autoComplete="name"
            defaultValue={values.fullName}
            maxLength={profileLimits.fullNameMax}
            aria-invalid={errors.fullName ? true : undefined}
            aria-describedby={errors.fullName ? "fullName-error" : undefined}
            required
          />
          {errors.fullName ? (
            <p className="field-error" id="fullName-error">
              {errors.fullName}
            </p>
          ) : null}
        </div>

        <div className="form-field">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            defaultValue={values.username}
            maxLength={profileLimits.usernameMax}
            aria-invalid={errors.username ? true : undefined}
            aria-describedby={errors.username ? "username-error" : "username-hint"}
          />
          {errors.username ? (
            <p className="field-error" id="username-error">
              {errors.username}
            </p>
          ) : (
            <p className="field-hint" id="username-hint">
              {usernameHint}
            </p>
          )}
        </div>
      </div>

      <div className="form-field">
        <label htmlFor="bio">Bio</label>
        <textarea
          id="bio"
          name="bio"
          rows={4}
          defaultValue={values.bio}
          maxLength={profileLimits.bioMax}
          aria-invalid={errors.bio ? true : undefined}
          aria-describedby={errors.bio ? "bio-error" : "bio-hint"}
        />
        {errors.bio ? (
          <p className="field-error" id="bio-error">
            {errors.bio}
          </p>
        ) : (
          <p className="field-hint" id="bio-hint">
            Up to {profileLimits.bioMax} characters.
          </p>
        )}
      </div>

      <StudyProfileFields values={values} errors={errors} />

      <div className="profile-form-actions">
        <button className="button button-dark" type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save changes"}
        </button>
      </div>
    </form>
  );
}
