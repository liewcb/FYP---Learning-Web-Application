"use client";

import Link from "next/link";
import { useActionState } from "react";

import { authRoutes } from "@/models/auth/auth-routes";
import { passwordRules } from "@/models/auth/auth.model";
import {
  passwordResetMessages,
  type NewPasswordFormState,
} from "@/models/auth/password-reset.model";
import { AuthShell } from "@/views/auth/auth-shell.view";
import { FormField } from "@/views/auth/form-field.view";

interface ResetPasswordViewProps {
  /** Null when the recovery session has expired. */
  readonly email: string | null;
  readonly action: (
    state: NewPasswordFormState,
    formData: FormData,
  ) => Promise<NewPasswordFormState>;
}

export function ResetPasswordView({ email, action }: ResetPasswordViewProps) {
  const [state, formAction, pending] = useActionState(action, {});

  if (!email) {
    return (
      <AuthShell
        title="Reset session expired"
        subtitle="For your security, a new password must be set soon after opening the reset link."
        footer={
          <>
            Back to <Link href={authRoutes.signIn}>Log in</Link>
          </>
        }
      >
        <div className="form-notice" role="status">
          <p>{passwordResetMessages.sessionExpired}</p>
          <Link className="button button-dark" href={authRoutes.forgotPassword}>
            Request a new reset link
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Set a new password"
      subtitle={`Choose a new password for ${email}.`}
      footer={
        <>
          Changed your mind? <Link href={authRoutes.home}>Go to the dashboard</Link>
        </>
      }
    >
      <form className="auth-form" action={formAction} noValidate>
        {state.error ? (
          <p className="form-alert" role="alert">
            {state.error}{" "}
            <Link href={authRoutes.forgotPassword}>Request a new reset link</Link>
          </p>
        ) : null}

        <FormField
          id="password"
          label="New password"
          type="password"
          autoComplete="new-password"
          error={state.fieldErrors?.password}
          hint={`At least ${passwordRules.minLength} characters, with a letter and a number.`}
        />
        <FormField
          id="confirmPassword"
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          error={state.fieldErrors?.confirmPassword}
        />

        <button className="button button-dark" type="submit" disabled={pending}>
          {pending ? "Updating..." : "Update password"}
        </button>
      </form>
    </AuthShell>
  );
}
