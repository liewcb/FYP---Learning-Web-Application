import Link from "next/link";

import { createStudentNavigation } from "@/models/home/home.model";
import { hasLibraryFilters, type LibraryPageModel } from "@/models/library/library.model";
import type { Viewer } from "@/models/profile/profile.model";
import { LibraryMaterialCard } from "@/views/library/library-material-card.view";
import { StudentTopbar } from "@/views/student/student-topbar.view";

interface LibraryPageViewProps {
  readonly viewer: Viewer;
  readonly model: LibraryPageModel;
  readonly justSubmitted: boolean;
  readonly signOutAction: () => Promise<void>;
}

export function LibraryPageView({
  viewer,
  model,
  justSubmitted,
  signOutAction,
}: LibraryPageViewProps) {
  const { filters } = model;
  const searching = hasLibraryFilters(filters);

  return (
    <main className="student-app">
      <StudentTopbar
        navigation={createStudentNavigation("Library")}
        displayName={viewer.displayName}
        initials={viewer.initials}
        signOutAction={signOutAction}
      />

      <div className="app-shell module-page-content">
        <header className="module-page-header">
          <div>
            <p className="section-kicker">Learning Material Library</p>
            <h1>Verified notes, shared by students.</h1>
            <p>
              Browse materials that moderators have approved, or share one of your own
              documents. Your private files stay private until a moderator publishes them.
            </p>
          </div>
          <Link className="button button-outline" href="/library/submit">
            Share a document <span aria-hidden="true">↑</span>
          </Link>
        </header>

        <nav className="page-tabs" aria-label="Library sections">
          <Link
            className={model.tab === "browse" ? "page-tab active" : "page-tab"}
            href="/library"
            aria-current={model.tab === "browse" ? "page" : undefined}
          >
            Browse
          </Link>
          <Link
            className={model.tab === "mine" ? "page-tab active" : "page-tab"}
            href="/library?tab=mine"
            aria-current={model.tab === "mine" ? "page" : undefined}
          >
            My submissions
            {model.mine.length > 0 ? (
              <span className="page-tab-count">{model.mine.length}</span>
            ) : null}
          </Link>
        </nav>

        {model.tab === "browse" ? (
          <>
            <form
              className="module-card lib-filters"
              action="/library"
              method="get"
              role="search"
              aria-label="Search the library"
            >
              <div className="form-field lib-filter-query">
                <label htmlFor="library-search">Search</label>
                <input
                  id="library-search"
                  name="q"
                  type="search"
                  defaultValue={filters.query}
                  placeholder="Title, description, module code or tag"
                  autoComplete="off"
                />
              </div>
              <div className="form-field">
                <label htmlFor="library-subject">Subject</label>
                <select id="library-subject" name="subject" defaultValue={filters.subject}>
                  <option value="">All subjects</option>
                  {model.subjects.map((subject) => (
                    <option key={subject} value={subject}>
                      {subject}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="library-sort">Sort by</label>
                <select id="library-sort" name="sort" defaultValue={filters.sort}>
                  <option value="latest">Latest</option>
                  <option value="popular">Most downloaded</option>
                </select>
              </div>
              <div className="buddy-filter-actions">
                <button className="button button-dark" type="submit">
                  Search
                </button>
                {searching ? (
                  <Link className="button button-outline" href="/library">
                    Clear
                  </Link>
                ) : null}
              </div>
            </form>

            {model.materials.length > 0 ? (
              <div className="lib-grid">
                {model.materials.map((material) => (
                  <LibraryMaterialCard key={material.id} material={material} viewer={viewer} />
                ))}
              </div>
            ) : (
              <div className="module-card">
                <div className="document-empty">
                  <span aria-hidden="true">▤</span>
                  <strong>
                    {searching ? "No materials match your search" : "The Library is empty for now"}
                  </strong>
                  <p>
                    {searching
                      ? "Try a shorter search or remove a filter."
                      : "Approved materials will appear here. Be the first to share one."}
                  </p>
                  {searching ? null : (
                    <Link className="button button-dark" href="/library/submit">
                      Share a document
                    </Link>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {justSubmitted ? (
              <p className="form-notice" role="status">
                Your material was submitted. It will appear in the Library once a moderator
                approves it.
              </p>
            ) : null}

            {model.mine.length > 0 ? (
              <div className="lib-grid">
                {model.mine.map((material) => (
                  <LibraryMaterialCard
                    key={material.id}
                    material={material}
                    viewer={viewer}
                    showStatus
                  />
                ))}
              </div>
            ) : (
              <div className="module-card">
                <div className="document-empty">
                  <span aria-hidden="true">□</span>
                  <strong>You have not submitted anything yet</strong>
                  <p>Share one of your ready documents to start contributing.</p>
                  <Link className="button button-dark" href="/library/submit">
                    Share a document
                  </Link>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}