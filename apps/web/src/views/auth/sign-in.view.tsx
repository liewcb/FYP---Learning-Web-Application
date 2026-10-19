"use client";

import Link from "next/link";
import { useActionState } from "react";

import { authRoutes } from "@/models/auth/auth-routes";
import type { SignInFormState } from "@/models/auth/auth.model";
import { AuthShell } from "@/views/auth/auth-shell.view";
import { FormField } from "@/views/auth/form-field.view";

interface SignInViewProps {
  readonly action: (
    state: SignInFormState,
    formData: FormData,
  ) => Promise<SignInFormState>;
  readonly next?: string;
  readonly initialError?: string;
  readonly initialNotice?: string;
}

export function SignInView({
  action,
  next,
  initialError,
  initialNotice,
}: SignInViewProps) {
  const [state, formAction, pending] = useActionState(action, {
    error: initialError,
    notice: initialNotice,
  });

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to continue to Athenix."
      footer={
        <>
          New to Athenix? <Link href={authRoutes.signUp}>Create an account</Link>
        </>
      }
    >
      <form className="auth-form" action={formAction} noValidate>
        {state.error ? (
          <p className="form-alert" role="alert">
            {state.error}
            {state.locked ? (
              <>
                {" "}
                <Link href={authRoutes.forgotPassword}>Reset your password</Link>
              </>
            ) : null}
          </p>
        ) : state.notice ? (
          <p className="form-notice" role="status">
            {state.notice}
          </p>
        ) : null}

        {next ? <input type="hidden" name="next" value={next} /> : null}

        <FormField
          id="identifier"
          label="Username or email"
          autoComplete="username"
          autoCapitalize="none"
          placeholder="you@university.edu"
          defaultValue={state.values?.identifier}
          error={state.fieldErrors?.identifier}
        />
        <FormField
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          error={state.fieldErrors?.password}
          labelAction={
            <Link className="label-link" href={authRoutes.forgotPassword}>
              Forgot password?
            </Link>
          }
        />

        <label className="remember-field">
          <input
            type="checkbox"
            name="remember"
            defaultChecked={state.values?.remember ?? false}
          />
          <span>Remember me</span>
        </label>

        <button className="button button-dark" type="submit" disabled={pending}>
          {pending ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </AuthShell>
  );
}
