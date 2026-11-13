import Link from "next/link";
import type { ReactNode } from "react";

import { createStudentNavigation } from "@/models/home/home.model";
import type {
  StudyBuddy,
  StudyBuddyPageModel,
  StudyBuddyTab,
} from "@/models/peers/study-buddy.model";
import {
  profileLimits,
  studyModeOptions,
} from "@/models/profile/study-profile.model";
import type { Viewer } from "@/models/profile/profile.model";
import { StudentTopbar } from "@/views/student/student-topbar.view";
import type { StudyBuddyAction } from "@/views/study-buddy/study-buddy-actions.view";
import { StudyBuddyCard } from "@/views/study-buddy/study-buddy-card.view";

interface StudyBuddyPageViewProps {
  readonly viewer: Viewer;
  readonly page: StudyBuddyPageModel;
  readonly action: StudyBuddyAction;
  readonly signOutAction: () => Promise<void>;
}

const yearOptions = Array.from(
  { length: profileLimits.yearOfStudyMax - profileLimits.yearOfStudyMin + 1 },
  (_, index) => profileLimits.yearOfStudyMin + index,
);

function formatList(items: readonly string[]): string {
  if (items.length <= 1) {
    return items.join("");
  }

  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function BuddyGrid({
  buddies,
  action,
  showMatch = false,
}: {
  readonly buddies: readonly StudyBuddy[];
  readonly action: StudyBuddyAction;
  readonly showMatch?: boolean;
}) {
  return (
    <div className="buddy-grid">
      {buddies.map((buddy) => (
        <StudyBuddyCard
          key={buddy.id}
          buddy={buddy}
          action={action}
          showMatch={showMatch}
        />
      ))}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  children,
}: {
  readonly icon: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="module-card">
      <div className="document-empty">
        <span aria-hidden="true">{icon}</span>
        <strong>{title}</strong>
        {children}
      </div>
    </div>
  );
}

function DiscoverSection({
  page,
  action,
}: {
  readonly page: StudyBuddyPageModel;
  readonly action: StudyBuddyAction;
}) {
  const { filters } = page;
  const resultLabel = `${page.discover.length} student${page.discover.length === 1 ? "" : "s"} found`;

  return (
    <>
      <form
        className="module-card buddy-filters"
        action="/study-buddy"
        method="get"
        role="search"
        aria-label="Find study buddies"
      >
        <input type="hidden" name="tab" value="discover" />
        <div className="form-field buddy-filter-username">
          <label htmlFor="buddy-username">Username</label>
          <input
            id="buddy-username"
            name="q"
            type="search"
            defaultValue={filters.username}
            placeholder="Search by @username"
            autoComplete="off"
          />
        </div>
        <div className="form-field">
          <label htmlFor="buddy-major">Major</label>
          <input
            id="buddy-major"
            name="major"
            defaultValue={filters.major}
            placeholder="e.g. Computer Science"
          />
        </div>
        <div className="form-field">
          <label htmlFor="buddy-year">Year of study</label>
          <select id="buddy-year" name="year" defaultValue={filters.year ?? ""}>
            <option value="">Any year</option>
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                Year {year}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="buddy-interest">Interest</label>
          <input
            id="buddy-interest"
            name="interest"
            defaultValue={filters.interest}
            placeholder="e.g. Databases"
          />
        </div>
        <div className="form-field">
          <label htmlFor="buddy-mode">Study style</label>
          <select id="buddy-mode" name="mode" defaultValue={filters.studyMode ?? ""}>
            <option value="">Any style</option>
            {studyModeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="buddy-filter-actions">
          <button className="button button-dark" type="submit">
            Search
          </button>
          {page.isSearching ? (
            <Link className="button button-outline" href="/study-buddy">
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      <div className="buddy-section-heading">
        <div>
          <h2>{page.isSearching ? "Search results" : "Recommended for you"}</h2>
          <p>
            {page.isSearching
              ? resultLabel
              : "Ranked by shared major, year of study, learning interests and study preferences."}
          </p>
        </div>
      </div>

      {!page.isSearching && page.missingProfileFields.length > 0 ? (
        <p className="form-notice buddy-profile-nudge">
          Add your {formatList(page.missingProfileFields)} to{" "}
          <Link href="/profile">your profile</Link> to get better matches.
        </p>
      ) : null}

      {page.discover.length > 0 ? (
        <BuddyGrid buddies={page.discover} action={action} showMatch />
      ) : (
        <EmptyState
          icon="⌕"
          title={page.isSearching ? "No students match your search" : "No recommendations yet"}
        >
          <p>
            {page.isSearching
              ? "Try a shorter username or remove a filter."
              : "No other students are available in peer search right now. Check back soon."}
          </p>
        </EmptyState>
      )}
    </>
  );
}

function RequestsSection({
  page,
  action,
}: {
  readonly page: StudyBuddyPageModel;
  readonly action: StudyBuddyAction;
}) {
  return (
    <>
      <div className="buddy-section-heading">
        <div>
          <h2>Received requests</h2>
          <p>Students who would like to study with you.</p>
        </div>
      </div>
      {page.incoming.length > 0 ? (
        <BuddyGrid buddies={page.incoming} action={action} showMatch />
      ) : (
        <EmptyState icon="✉" title="No new requests">
          <p>When someone adds you as a study buddy, it will appear here.</p>
        </EmptyState>
      )}

      <div className="buddy-section-heading">
        <div>
          <h2>Sent requests</h2>
          <p>Waiting for the other student to accept.</p>
        </div>
      </div>
      {page.outgoing.length > 0 ? (
        <BuddyGrid buddies={page.outgoing} action={action} />
      ) : (
        <EmptyState icon="↗" title="No pending requests">
          <p>
            Find classmates in <Link href="/study-buddy">Discover</Link> and add
            them as study buddies.
          </p>
        </EmptyState>
      )}
    </>
  );
}

function BuddiesSection({
  page,
  action,
}: {
  readonly page: StudyBuddyPageModel;
  readonly action: StudyBuddyAction;
}) {
  return (
    <>
      <div className="buddy-section-heading">
        <div>
          <h2>My study buddies</h2>
          <p>Open a profile card to see their interests or remove a buddy.</p>
        </div>
      </div>
      {page.buddies.length > 0 ? (
        <BuddyGrid buddies={page.buddies} action={action} />
      ) : (
        <EmptyState icon="☺" title="No study buddies yet">
          <p>
            Browse your <Link href="/study-buddy">recommendations</Link> to find
            classmates with similar interests.
          </p>
        </EmptyState>
      )}
    </>
  );
}

export function StudyBuddyPageView({
  viewer,
  page,
  action,
  signOutAction,
}: StudyBuddyPageViewProps) {
  const tabs: readonly { key: StudyBuddyTab; label: string; count?: number }[] = [
    { key: "discover", label: "Discover" },
    { key: "requests", label: "Requests", count: page.incoming.length },
    { key: "buddies", label: "My buddies", count: page.buddies.length },
  ];

  return (
    <main className="student-app">
      <StudentTopbar
        navigation={createStudentNavigation("Study Buddy")}
        displayName={viewer.displayName}
        initials={viewer.initials}
        avatarUrl={viewer.avatarUrl}
        signOutAction={signOutAction}
      />

      <div className="app-shell module-page-content">
        <header className="module-page-header">
          <div>
            <h1>Study buddy</h1>
            <p>
              Find classmates who share your major, year and interests.
            </p>
          </div>
          <Link className="button button-outline" href="/profile">
            Edit my study profile
          </Link>
        </header>

        <nav className="page-tabs" aria-label="Study Buddy sections">
          {tabs.map((tab) => (
            <Link
              className={tab.key === page.tab ? "page-tab active" : "page-tab"}
              href={tab.key === "discover" ? "/study-buddy" : `/study-buddy?tab=${tab.key}`}
              key={tab.key}
              aria-current={tab.key === page.tab ? "page" : undefined}
            >
              {tab.label}
              {tab.count ? <span className="page-tab-count">{tab.count}</span> : null}
            </Link>
          ))}
        </nav>

        {page.tab === "discover" ? <DiscoverSection page={page} action={action} /> : null}
        {page.tab === "requests" ? <RequestsSection page={page} action={action} /> : null}
        {page.tab === "buddies" ? <BuddiesSection page={page} action={action} /> : null}
      </div>
    </main>
  );
}
