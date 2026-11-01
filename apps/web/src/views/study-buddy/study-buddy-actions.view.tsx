"use client";

import Link from "next/link";
import { useActionState } from "react";

import { chatWithHref } from "@/models/chat/chat.model";
import type {
  StudyBuddy,
  StudyBuddyActionIntent,
  StudyBuddyActionState,
} from "@/models/peers/study-buddy.model";
import { ConfirmSubmitButton } from "@/views/shared/confirm-submit-button.view";

export type StudyBuddyAction = (
  state: StudyBuddyActionState,
  formData: FormData,
) => Promise<StudyBuddyActionState>;

interface StudyBuddyActionsProps {
  readonly buddy: StudyBuddy;
  readonly action: StudyBuddyAction;
  /** Removing a buddy is offered on the profile card, not on every card. */
  readonly allowRemove?: boolean;
}

export function StudyBuddyActions({
  buddy,
  action,
  allowRemove = false,
}: StudyBuddyActionsProps) {
  const [state, formAction, pending] = useActionState(action, {});

  function intentForm(
    intent: StudyBuddyActionIntent,
    label: string,
    pendingLabel: string,
    className: string,
  ) {
    return (
      <form action={formAction}>
        <input type="hidden" name="intent" value={intent} />
        <input type="hidden" name="studentId" value={buddy.id} />
        <button
          className={className}
          type="submit"
          disabled={pending}
          aria-label={`${label}: ${buddy.fullName}`}
        >
          {pending ? pendingLabel : label}
        </button>
      </form>
    );
  }

  return (
    <div className="buddy-actions">
      <div className="buddy-action-buttons">
        {buddy.connectionStatus === "none"
          ? intentForm("add", "Add buddy", "Sending...", "button button-dark buddy-button")
          : null}

        {buddy.connectionStatus === "pending_sent" ? (
          <>
            <span className="buddy-status">Request sent</span>
            {intentForm("cancel", "Cancel", "Cancelling...", "text-action")}
          </>
        ) : null}

        {buddy.connectionStatus === "pending_received" ? (
          <>
            {intentForm("accept", "Accept", "Accepting...", "button button-dark buddy-button")}
            {intentForm("decline", "Decline", "Declining...", "button button-outline buddy-button")}
          </>
        ) : null}

        {buddy.connectionStatus === "accepted" ? (
          <>
            <span className="buddy-status accepted">
              <span aria-hidden="true">✓</span> Study buddies
            </span>
            <Link
              className="button button-dark buddy-button"
              href={chatWithHref(buddy.id)}
              aria-label={`Message ${buddy.fullName}`}
            >
              Message
            </Link>
            {allowRemove ? (
              <form action={formAction}>
                <input type="hidden" name="intent" value="remove" />
                <input type="hidden" name="studentId" value={buddy.id} />
                <ConfirmSubmitButton
                  className="text-action danger"
                  message={`Remove ${buddy.fullName} from your study buddies?`}
                  disabled={pending}
                >
                  {pending ? "Removing..." : "Remove buddy"}
                </ConfirmSubmitButton>
              </form>
            ) : null}
          </>
        ) : null}
      </div>

      {state.error ? (
        <p className="buddy-action-message error" role="alert">{state.error}</p>
      ) : null}
      {state.notice ? (
        <p className="buddy-action-message" role="status">{state.notice}</p>
      ) : null}
    </div>
  );
}
