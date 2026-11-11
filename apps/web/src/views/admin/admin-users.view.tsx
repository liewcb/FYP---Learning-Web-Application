import Link from "next/link";

import {
  adminUserSortLabels,
  adminUserSorts,
  adminUserStatusFilterLabels,
  adminUserStatusFilters,
  adminUsersHref,
  adminUsersPath,
  storageUsageRatio,
  type AdminUsersModel,
} from "@/models/admin/admin-users.model";
import {
  formatStorage,
  userStorageWarningRatio,
} from "@/models/admin/system-monitoring.model";
import {
  AdminUserActions,
  type AdminUserFormAction,
} from "@/views/admin/admin-user-actions.view";
import { AdminPagination } from "@/views/admin/admin-pagination.view";
import { formatAdminDate, formatRelative } from "@/views/admin/admin-display";

interface AdminUsersViewProps {
  readonly model: AdminUsersModel;
  readonly statusAction: AdminUserFormAction;
  readonly quotaAction: AdminUserFormAction;
}

export function AdminUsersView({ model, statusAction, quotaAction }: AdminUsersViewProps) {
  const { filters } = model;

  return (
    <>
      <section className="admin-heading">
        <p className="section-kicker">Administration</p>
        <h1>User management</h1>
        <p>
          Find accounts, suspend or reactivate students and adjust storage
          quotas. Every change is recorded in the audit log.
        </p>
      </section>

      <form className="admin-toolbar" action={adminUsersPath} method="get" role="search">
        <label className="visually-hidden" htmlFor="user-search">Search users</label>
        <input
          id="user-search"
          name="q"
          type="search"
          defaultValue={filters.search}
          placeholder="Search name, username or e-mail"
        />
        <label className="visually-hidden" htmlFor="user-status">Show</label>
        <select id="user-status" name="status" defaultValue={filters.status}>
          {adminUserStatusFilters.map((status) => (
            <option key={status} value={status}>{adminUserStatusFilterLabels[status]}</option>
          ))}
        </select>
        <label className="visually-hidden" htmlFor="user-sort">Sort by</label>
        <select id="user-sort" name="sort" defaultValue={filters.sort}>
          {adminUserSorts.map((sort) => (
            <option key={sort} value={sort}>{adminUserSortLabels[sort]}</option>
          ))}
        </select>
        <button className="button button-dark" type="submit">Apply</button>
        {filters.search || filters.status !== "all" || filters.sort !== "recent" ? (
          <Link className="text-action" href={adminUsersPath}>Clear</Link>
        ) : null}
      </form>

      <p className="admin-result-count">
        {model.total.toLocaleString("en-MY")} {model.total === 1 ? "account" : "accounts"}
      </p>

      {model.users.length > 0 ? (
        <ul className="admin-user-list">
          {model.users.map((user) => {
            const ratio = storageUsageRatio(user);
            const warn = ratio >= userStorageWarningRatio;

            return (
              <li className={`admin-user-card${user.status === "suspended" ? " is-suspended" : ""}`} key={user.id}>
                <div className="admin-user-main">
                  <div className="admin-user-identity">
                    <strong>{user.fullName}</strong>
                    <span>
                      {user.username ? `@${user.username}` : "No username"}
                      {user.email ? ` · ${user.email}` : ""}
                    </span>
                  </div>
                  <div className="admin-user-chips">
                    <span className={`status-pill ${user.role === "admin" ? "admin" : ""}`}>
                      {user.role === "admin" ? "Admin" : "Student"}
                    </span>
                    <span className={`status-pill ${user.status}`}>
                      {user.status === "suspended" ? "Suspended" : "Active"}
                    </span>
                  </div>
                </div>

                <dl className="admin-user-facts">
                  <div>
                    <dt>Storage</dt>
                    <dd>
                      <span className={warn ? "is-warning" : ""}>
                        {formatStorage(user.storageUsedBytes)} of {formatStorage(user.storageQuotaBytes)}
                      </span>
                      <span
                        className={`admin-meter${warn ? " is-warning" : ""}`}
                        role="img"
                        aria-label={`${Math.round(ratio * 100)} percent of quota used`}
                      >
                        <span style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }} />
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>Documents</dt>
                    <dd>{user.documentCount}</dd>
                  </div>
                  <div>
                    <dt>Last active</dt>
                    <dd>{formatRelative(user.lastSeenAt ?? user.lastSignInAt)}</dd>
                  </div>
                  <div>
                    <dt>Joined</dt>
                    <dd>{formatAdminDate(user.createdAt)}</dd>
                  </div>
                </dl>

                {user.status === "suspended" ? (
                  <p className="admin-user-note">
                    <strong>Suspended {formatAdminDate(user.suspendedAt)}:</strong>{" "}
                    {user.suspensionReason ?? "No reason recorded."}
                  </p>
                ) : null}

                {user.role === "student" && user.id !== model.viewerId ? (
                  <AdminUserActions
                    user={user}
                    statusAction={statusAction}
                    quotaAction={quotaAction}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <section className="admin-empty">
          <span className="admin-module-icon" aria-hidden="true">◎</span>
          <h2>No accounts found</h2>
          <p>Try a different search or filter.</p>
        </section>
      )}

      <AdminPagination
        page={filters.page}
        pageCount={model.pageCount}
        hrefFor={(page) => adminUsersHref(filters, page)}
      />
    </>
  );
}
