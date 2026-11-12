import Link from "next/link";

import {
  formatBytes,
  storageUsagePercent,
  type ProfileFormState,
  type ProfilePageModel,
} from "@/models/profile/profile.model";
import { ProfileFormView } from "@/views/profile/profile-form.view";

interface ProfileViewProps {
  readonly model: ProfilePageModel;
  readonly updateAction: (
    state: ProfileFormState,
    formData: FormData,
  ) => Promise<ProfileFormState>;
}

const dateFormat = new Intl.DateTimeFormat("en-MY", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function ProfileView({ model, updateAction }: ProfileViewProps) {
  const { viewer, profile, account } = model;
  const usage = account ? storageUsagePercent(account) : 0;

  return (
    <div className="profile-page">
      <section className="profile-header" aria-labelledby="profile-title">
        <span className="profile-avatar" aria-hidden="true">
          {viewer.initials}
        </span>
        <div>
          <p className="section-kicker">My profile</p>
          <h1 id="profile-title">{viewer.displayName}</h1>
          <p className="profile-meta">
            {profile.username ? `@${profile.username} · ` : ""}
            {viewer.email}
          </p>
        </div>
        <span className={`role-badge ${profile.role}`}>{profile.role}</span>
      </section>

      <div className="profile-layout">
        <section className="profile-card" aria-labelledby="profile-details-title">
          <h2 id="profile-details-title">Profile details</h2>
          <p className="profile-card-intro">
            This information is visible to other signed-in students.
          </p>
          <ProfileFormView
            initialValues={model.formValues}
            action={updateAction}
          />
        </section>

        <aside className="profile-side">
          <section className="profile-card" aria-labelledby="account-title">
            <h2 id="account-title">Account</h2>
            <dl className="account-details">
              <div>
                <dt>Email</dt>
                <dd>{viewer.email}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd className="capitalize">{profile.role}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <span
                    className={`status-pill ${account?.status ?? "active"}`}
                  >
                    {account?.status ?? "active"}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Member since</dt>
                <dd>{dateFormat.format(new Date(profile.createdAt))}</dd>
              </div>
            </dl>
          </section>

          {account ? (
            <section className="profile-card" aria-labelledby="storage-title">
              <h2 id="storage-title">Storage</h2>
              <p className="storage-figure">
                <strong>{formatBytes(account.storageUsedBytes)}</strong> of{" "}
                {formatBytes(account.storageQuotaBytes)} used
              </p>
              <div
                className="storage-bar"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={usage}
                aria-label="Storage used"
              >
                <span style={{ width: `${usage}%` }} />
              </div>
              <div className="storage-request-cta">
                <p className="field-hint">Running low on space?</p>
                <Link className="button button-outline" href="/storage">
                  <span aria-hidden="true">＋</span> Request more storage
                </Link>
              </div>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
