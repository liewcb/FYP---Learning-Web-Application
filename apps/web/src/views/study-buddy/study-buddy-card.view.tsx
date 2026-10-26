"use client";

import { useRef, type MouseEvent } from "react";

import {
  matchReasons,
  studyModeLabel,
  studyTimeLabel,
  type StudyBuddy,
} from "@/models/peers/study-buddy.model";
import {
  StudyBuddyActions,
  type StudyBuddyAction,
} from "@/views/study-buddy/study-buddy-actions.view";

const maxCardInterests = 5;

const memberSinceFormatter = new Intl.DateTimeFormat("en-MY", {
  month: "long",
  year: "numeric",
});

interface StudyBuddyCardProps {
  readonly buddy: StudyBuddy;
  readonly action: StudyBuddyAction;
  /** Show the match score and reasons (recommendations and search). */
  readonly showMatch?: boolean;
}

function academicLine(buddy: StudyBuddy): string {
  return [
    buddy.academicMajor,
    buddy.yearOfStudy === null ? null : `Year ${buddy.yearOfStudy}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function InterestChips({
  buddy,
  limit,
}: {
  readonly buddy: StudyBuddy;
  readonly limit?: number;
}) {
  const shared = new Set(buddy.sharedInterests.map((interest) => interest.toLowerCase()));
  // Shared interests first, so the reason for a match is visible at a glance.
  const ordered = [...buddy.interests].sort(
    (a, b) => Number(shared.has(b.toLowerCase())) - Number(shared.has(a.toLowerCase())),
  );
  const visible = limit === undefined ? ordered : ordered.slice(0, limit);
  const hidden = ordered.length - visible.length;

  if (ordered.length === 0) {
    return null;
  }

  return (
    <ul className="buddy-chips" aria-label="Learning interests">
      {visible.map((interest) => (
        <li
          className={shared.has(interest.toLowerCase()) ? "buddy-chip shared" : "buddy-chip"}
          key={interest}
          title={shared.has(interest.toLowerCase()) ? "You share this interest" : undefined}
        >
          {interest}
        </li>
      ))}
      {hidden > 0 ? <li className="buddy-chip more">+{hidden}</li> : null}
    </ul>
  );
}

export function StudyBuddyCard({ buddy, action, showMatch = false }: StudyBuddyCardProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const reasons = matchReasons(buddy);
  const academic = academicLine(buddy);
  const nameId = `buddy-${buddy.id}-name`;
  const showScore = showMatch && buddy.matchScore > 0;

  function openProfile() {
    dialogRef.current?.showModal();
  }

  function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) {
      event.currentTarget.close();
    }
  }

  return (
    <article className="buddy-card">
      <button
        className="buddy-card-open"
        type="button"
        onClick={openProfile}
        aria-haspopup="dialog"
      >
        <span className="buddy-avatar" aria-hidden="true">{buddy.initials}</span>
        <span className="buddy-identity">
          <strong>{buddy.fullName}</strong>
          {buddy.username ? <small>@{buddy.username}</small> : null}
        </span>
        {showScore ? (
          <span className="buddy-match" title="Match score">
            {buddy.matchScore}% match
          </span>
        ) : null}
      </button>

      {academic ? <p className="buddy-meta">{academic}</p> : null}

      {showMatch && reasons.length > 0 ? (
        <p className="buddy-reasons">{reasons.join(" · ")}</p>
      ) : null}

      <InterestChips buddy={buddy} limit={maxCardInterests} />

      <div className="buddy-card-footer">
        <button className="text-action" type="button" onClick={openProfile}>
          View profile
        </button>
        <StudyBuddyActions buddy={buddy} action={action} />
      </div>

      <dialog
        className="buddy-dialog"
        ref={dialogRef}
        aria-labelledby={nameId}
        onClick={closeOnBackdrop}
      >
        <div className="buddy-profile">
          <button
            className="buddy-dialog-close"
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close profile"
          >
            ×
          </button>

          <header className="buddy-profile-header">
            <span className="buddy-avatar large" aria-hidden="true">{buddy.initials}</span>
            <div className="buddy-profile-identity">
              <h2 id={nameId}>{buddy.fullName}</h2>
              {buddy.username ? <p>@{buddy.username}</p> : null}
              {academic ? <p className="buddy-profile-academic">{academic}</p> : null}
            </div>
            {buddy.matchScore > 0 ? (
              <span className="buddy-match large">{buddy.matchScore}% match</span>
            ) : null}
          </header>

          <div className="buddy-profile-body">
            <div className="buddy-profile-main">
              <section className="buddy-profile-section">
                <h3>About</h3>
                <p>{buddy.bio?.trim() || "This student has not written a bio yet."}</p>
              </section>

              <section className="buddy-profile-section">
                <h3>Learning interests</h3>
                {buddy.interests.length > 0 ? (
                  <InterestChips buddy={buddy} />
                ) : (
                  <p>No interests added yet.</p>
                )}
              </section>
            </div>

            <aside className="buddy-profile-side">
              {reasons.length > 0 ? (
                <section className="buddy-profile-section">
                  <h3>Why you match</h3>
                  <ul className="buddy-reason-list">
                    {reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className="buddy-profile-section">
                <h3>Study preferences</h3>
                <dl className="buddy-preferences">
                  <div>
                    <dt>Prefers to study</dt>
                    <dd>
                      {buddy.studyTimes.length > 0
                        ? buddy.studyTimes.map(studyTimeLabel).join(", ")
                        : "Not specified"}
                    </dd>
                  </div>
                  <div>
                    <dt>Study style</dt>
                    <dd>
                      {buddy.studyMode ? studyModeLabel(buddy.studyMode) : "Not specified"}
                    </dd>
                  </div>
                  <div>
                    <dt>Member since</dt>
                    <dd>{memberSinceFormatter.format(new Date(buddy.memberSince))}</dd>
                  </div>
                </dl>
              </section>
            </aside>
          </div>

          <footer className="buddy-profile-footer">
            <StudyBuddyActions buddy={buddy} action={action} allowRemove />
          </footer>
        </div>
      </dialog>
    </article>
  );
}
