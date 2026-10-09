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
}

export function SignInView({ action, next, initialError }: SignInViewProps) {
  const [state, formAction, pending] = useActionState(action, {
    error: initialError,
  });

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to continue to your learning workspace."
      footer={
        <>
          New to LearnTogether?{" "}
          <Link href={authRoutes.signUp}>Create an account</Link>
        </>
      }
    >
      <form className="auth-form" action={formAction} noValidate>
        {state.error ? (
          <p className="form-alert" role="alert">
            {state.error}
          </p>
        ) : null}

        {next ? <input type="hidden" name="next" value={next} /> : null}

        <FormField
          id="identifier"
          label="Username or email"
          autoComplete="username"
          autoCapitalize="none"
          defaultValue={state.values?.identifier}
          error={state.fieldErrors?.identifier}
        />
        <FormField
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          error={state.fieldErrors?.password}
        />

        <button className="button button-dark" type="submit" disabled={pending}>
          {pending ? "Logging in..." : "Log in"}
        </button>
      </form>
    </AuthShell>
  );
}
