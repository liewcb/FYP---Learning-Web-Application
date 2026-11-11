"use client";

import { useActionState } from "react";

import {
  storageQuotaOptions,
  suspensionReasonMax,
  type AdminUser,
  type AdminUserActionState,
} from "@/models/admin/admin-users.model";

export type AdminUserFormAction = (
  state: AdminUserActionState,
  formData: FormData,
) => Promise<AdminUserActionState>;

interface AdminUserActionsProps {
  readonly user: AdminUser;
  readonly statusAction: AdminUserFormAction;
  readonly quotaAction: AdminUserFormAction;
}

function Feedback({ state }: { readonly state: AdminUserActionState }) {
  if (state.error) {
    return <p className="field-error" role="alert">{state.error}</p>;
  }

  return state.notice ? <p className="field-hint success" role="status">{state.notice}</p> : null;
}

export function AdminUserActions({ user, statusAction, quotaAction }: AdminUserActionsProps) {
  const [statusState, statusFormAction, statusPending] = useActionState(statusAction, {});
  const [quotaState, quotaFormAction, quotaPending] = useActionState(quotaAction, {});
  const suspended = user.status === "suspended";
  const currentQuota = storageQuotaOptions.some((option) => option.bytes === user.storageQuotaBytes)
    ? String(user.storageQuotaBytes)
    : "";

  return (
    <details className="admin-user-manage">
      <summary>Manage account</summary>

      <div className="admin-user-forms">
        <form action={statusFormAction} className="admin-inline-form">
          <input type="hidden" name="userId" value={user.id} />
          {suspended ? (
            <>
              <p>
                Reactivating lets {user.fullName} sign in again. Their documents
                and history were kept while suspended.
              </p>
              <input type="hidden" name="intent" value="reactivate" />
              <button className="button button-dark" type="submit" disabled={statusPending}>
                {statusPending ? "Reactivating..." : "Reactivate account"}
              </button>
            </>
          ) : (
            <>
              <label htmlFor={`reason-${user.id}`}>Suspend this account</label>
              <textarea
                id={`reason-${user.id}`}
                name="reason"
                rows={2}
                maxLength={suspensionReasonMax}
                required
                placeholder="Reason (required). The student sees a suspended-account message when signing in."
              />
              <input type="hidden" name="intent" value="suspend" />
              <button className="button lib-button-danger" type="submit" disabled={statusPending}>
                {statusPending ? "Suspending..." : "Suspend and sign out"}
              </button>
            </>
          )}
          <Feedback state={statusState} />
        </form>

        <form action={quotaFormAction} className="admin-inline-form">
          <input type="hidden" name="userId" value={user.id} />
          <label htmlFor={`quota-${user.id}`}>Storage quota</label>
          <div className="admin-inline-row">
            <select id={`quota-${user.id}`} name="quotaBytes" defaultValue={currentQuota}>
              {currentQuota === "" ? <option value="" disabled>Custom quota</option> : null}
              {storageQuotaOptions.map((option) => (
                <option key={option.bytes} value={option.bytes}>{option.label}</option>
              ))}
            </select>
            <button className="button button-outline" type="submit" disabled={quotaPending}>
              {quotaPending ? "Saving..." : "Save quota"}
            </button>
          </div>
          <Feedback state={quotaState} />
        </form>
      </div>
    </details>
  );
}
