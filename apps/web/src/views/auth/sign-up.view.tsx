"use client";

import Link from "next/link";
import {
  startTransition,
  useActionState,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { authRoutes } from "@/models/auth/auth-routes";
import {
  hasAccountStepErrors,
  passwordRules,
  signUpAccountFields,
  validateSignUpAccount,
  type SignUpAccountField,
  type SignUpEchoValues,
  type SignUpFieldErrors,
  type SignUpFormState,
  type UsernameCheck,
} from "@/models/auth/auth.model";
import {
  emptyStudyProfileFormValues,
  normaliseUsername,
  profileLimits,
} from "@/models/profile/study-profile.model";
import { AuthShell } from "@/views/auth/auth-shell.view";
import { FormField } from "@/views/auth/form-field.view";
import { StudyProfileFields } from "@/views/profile/study-profile-fields.view";

interface SignUpViewProps {
  readonly action: (
    state: SignUpFormState,
    formData: FormData,
  ) => Promise<SignUpFormState>;
  readonly checkUsername: (username: string) => Promise<UsernameCheck>;
}

type Step = "account" | "study";

type UsernameStatus =
  | { readonly state: "idle" }
  | { readonly state: "checking"; readonly value: string }
  | {
      readonly state: "available" | "taken";
      readonly value: string;
      readonly message: string;
    };

const emptyValues: SignUpEchoValues = {
  fullName: "",
  username: "",
  email: "",
  ...emptyStudyProfileFormValues,
};

const usernameHint =
  "You'll use this to log in. 3–30 lowercase letters, numbers or _.";

export function SignUpView({ action, checkUsername }: SignUpViewProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const [step, setStep] = useState<Step>("account");
  const [handledState, setHandledState] = useState(state);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>({
    state: "idle",
  });
  const [errors, setErrors] = useState<SignUpFieldErrors>({});
  const accountStep = useRef<HTMLFieldSetElement>(null);

  // Show the server's field errors, and go back to the account step if one
  // of its fields has a problem.
  if (state !== handledState) {
    setHandledState(state);
    setUsernameStatus({ state: "idle" });
    setErrors(state.fieldErrors ?? {});

    if (hasAccountStepErrors(state.fieldErrors)) {
      setStep("account");
    }
  }

  const values = state.values ?? emptyValues;

  // Editing a field hides its error until the next check.
  function clearError(field: SignUpAccountField) {
    setErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const next = { ...current };
      delete next[field];

      return next;
    });
  }

  const usernameError =
    errors.username ??
    (usernameStatus.state === "taken" ? usernameStatus.message : undefined);
  const usernameMessage =
    usernameStatus.state === "checking"
      ? "Checking availability..."
      : usernameStatus.state === "available"
        ? usernameStatus.message
        : usernameHint;

  async function handleUsernameBlur(value: string) {
    const username = normaliseUsername(value);

    if (!username) {
      setUsernameStatus({ state: "idle" });
      return;
    }

    setUsernameStatus({ state: "checking", value: username });

    try {
      const result = await checkUsername(username);

      setUsernameStatus((current) =>
        current.state !== "idle" && current.value === username
          ? {
              state: result.available ? "available" : "taken",
              value: username,
              message: result.message,
            }
          : current,
      );
    } catch {
      setUsernameStatus({ state: "idle" });
    }
  }

  function goToStudyStep() {
    const form = accountStep.current?.form;

    if (!form) {
      return;
    }

    const data = new FormData(form);
    const text = (name: SignUpAccountField) => {
      const value = data.get(name);

      return typeof value === "string" ? value : "";
    };

    const accountErrors = validateSignUpAccount({
      fullName: text("fullName"),
      username: text("username"),
      email: text("email"),
      password: text("password"),
      confirmPassword: text("confirmPassword"),
    });

    if (!accountErrors.username && usernameStatus.state === "taken") {
      accountErrors.username = usernameStatus.message;
    }

    setErrors((current) => {
      const next: SignUpFieldErrors = { ...current };

      for (const field of signUpAccountFields) {
        delete next[field];
      }

      return { ...next, ...accountErrors };
    });

    const firstInvalid = signUpAccountFields.find((field) => accountErrors[field]);

    if (firstInvalid) {
      form.querySelector<HTMLInputElement>(`#${firstInvalid}`)?.focus();
      return;
    }

    setStep("study");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (
      step === "account" &&
      event.key === "Enter" &&
      event.target instanceof HTMLInputElement
    ) {
      event.preventDefault();
      goToStudyStep();
    }
  }

  // Submitting through startTransition (rather than the form's `action`
  // prop) stops React from resetting the form, so passwords typed on the
  // first step survive a validation error on the second.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(() => formAction(formData));
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Join your classmates and start learning smarter."
      back={
        state.notice ? null : step === "study" ? (
          <button
            className="back-link"
            type="button"
            onClick={() => setStep("account")}
          >
            <span aria-hidden="true">←</span> Back to account details
          </button>
        ) : (
          <Link className="back-link" href={authRoutes.signIn}>
            <span aria-hidden="true">←</span> Back to log in
          </Link>
        )
      }
      footer={
        <>
          Already have an account? <Link href={authRoutes.signIn}>Log in</Link>
        </>
      }
    >
      {state.notice ? (
        <div className="form-notice" role="status">
          <p>{state.notice}</p>
          <Link className="button button-dark" href={authRoutes.signIn}>
            Go to log in
          </Link>
        </div>
      ) : (
        <form
          className="auth-form"
          onSubmit={handleSubmit}
          onKeyDown={handleKeyDown}
          noValidate
        >
          <ol className="step-indicator" aria-label="Sign-up progress">
            <li
              className={step === "account" ? "active" : "done"}
              aria-current={step === "account" ? "step" : undefined}
            >
              <span>1</span> Account
            </li>
            <li
              className={step === "study" ? "active" : undefined}
              aria-current={step === "study" ? "step" : undefined}
            >
              <span>2</span> Study profile
            </li>
          </ol>

          {state.error ? (
            <p className="form-alert" role="alert">
              {state.error}
            </p>
          ) : null}

          <fieldset
            className="form-step"
            ref={accountStep}
            hidden={step !== "account"}
          >
            <legend className="sr-only">Account details</legend>
            <FormField
              id="fullName"
              label="Full name"
              autoComplete="name"
              autoCapitalize="words"
              defaultValue={values.fullName}
              error={errors.fullName}
              onChange={() => clearError("fullName")}
              minLength={profileLimits.fullNameMin}
              maxLength={profileLimits.fullNameMax}
            />
            <FormField
              id="username"
              label="Username"
              autoComplete="username"
              autoCapitalize="none"
              defaultValue={values.username}
              error={usernameError}
              hint={usernameMessage}
              hintTone={usernameStatus.state === "available" ? "success" : "default"}
              pattern="[A-Za-z0-9_]{3,30}"
              maxLength={profileLimits.usernameMax}
              onBlur={(event) => handleUsernameBlur(event.currentTarget.value)}
              onChange={() => {
                setUsernameStatus({ state: "idle" });
                clearError("username");
              }}
            />
            <FormField
              id="email"
              label="Email"
              type="email"
              autoComplete="email"
              defaultValue={values.email}
              error={errors.email}
              onChange={() => clearError("email")}
              hint="We'll send a confirmation link here."
            />
            <FormField
              id="password"
              label="Password"
              type="password"
              autoComplete="new-password"
              error={errors.password}
              onChange={() => clearError("password")}
              minLength={passwordRules.minLength}
              maxLength={passwordRules.maxLength}
              hint={`At least ${passwordRules.minLength} characters, with a letter and a number.`}
            />
            <FormField
              id="confirmPassword"
              label="Confirm password"
              type="password"
              autoComplete="new-password"
              error={errors.confirmPassword}
              onChange={() => clearError("confirmPassword")}
            />

            <button
              className="button button-dark"
              type="button"
              onClick={goToStudyStep}
            >
              Continue
            </button>
          </fieldset>

          <fieldset className="form-step" hidden={step !== "study"}>
            <legend className="sr-only">Study profile</legend>
            <p className="step-intro">
              Help us match you with study partners. Everything here is
              optional and you can change it later in your profile.
            </p>

            <StudyProfileFields values={values} errors={errors} />

            <div className="step-actions">
              <button
                className="button button-outline"
                type="button"
                onClick={() => setStep("account")}
              >
                Back
              </button>
              <button
                className="button button-dark"
                type="submit"
                disabled={pending}
              >
                {pending ? "Creating account..." : "Create account"}
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </AuthShell>
  );
}
