"use client";

import Link from "next/link";
import { useActionState } from "react";

import { authRoutes } from "@/models/auth/auth-routes";
import {
  initialPasswordResetState,
  type PasswordResetFormState,
} from "@/models/auth/password-reset.model";
import { AuthShell } from "@/views/auth/auth-shell.view";
import { FormField } from "@/views/auth/form-field.view";

interface ForgotPasswordViewProps {
  readonly action: (
    state: PasswordResetFormState,
    formData: FormData,
  ) => Promise<PasswordResetFormState>;
  /** Shown when the user arrives from an expired or invalid reset link. */
  readonly initialError?: string;
}

export function ForgotPasswordView({ action, initialError }: ForgotPasswordViewProps) {
  const [state, formAction, pending] = useActionState(action, {
    ...initialPasswordResetState,
    error: initialError,
  });
  const sent = state.step === "sent";

  return (
    <AuthShell
      title={sent ? "Check your email" : "Forgot your password?"}
      subtitle={
        sent
          ? "Open the link in the email to choose a new password."
          : "Enter your username or email and we'll email you a link to reset your password."
      }
      back={
        <Link className="back-link" href={authRoutes.signIn}>
          <span aria-hidden="true">←</span> Back to log in
        </Link>
      }
      footer={
        <>
          Remembered it? <Link href={authRoutes.signIn}>Log in</Link>
        </>
      }
    >
      <form className="auth-form" action={formAction} noValidate>
        {state.error ? (
          <p className="form-alert" role="alert">
            {state.error}
          </p>
        ) : state.notice ? (
          <p className="form-notice" role="status">
            {state.notice}
          </p>
        ) : null}

        {sent ? (
          <>
            <input type="hidden" name="identifier" value={state.identifier ?? ""} />
            <p className="reset-account">
              Account: <strong>{state.identifier}</strong>
            </p>
            <p className="step-intro">
              The link works once and expires after one hour. Open it in this
              browser for the smoothest experience.
            </p>
            <div className="reset-secondary-actions">
              <button
                className="text-action"
                type="submit"
                name="intent"
                value="send"
                disabled={pending}
              >
                {pending ? "Sending..." : "Resend link"}
              </button>
              <button
                className="text-action"
                type="submit"
                name="intent"
                value="restart"
                disabled={pending}
              >
                Use a different account
              </button>
            </div>
          </>
        ) : (
          <>
            <FormField
              id="identifier"
              label="Username or email"
              autoComplete="username"
              autoCapitalize="none"
              defaultValue={state.identifier}
              error={state.fieldErrors?.identifier}
            />
            <button
              className="button button-dark"
              type="submit"
              name="intent"
              value="send"
              disabled={pending}
            >
              {pending ? "Sending..." : "Send reset link"}
            </button>
          </>
        )}
      </form>
    </AuthShell>
  );
}
