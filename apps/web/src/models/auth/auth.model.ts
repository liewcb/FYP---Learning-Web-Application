import {
  normaliseUsername,
  validateFullName,
  validateStudyProfile,
  validateUsername,
  type StudyProfile,
  type StudyProfileErrors,
  type StudyProfileFormValues,
} from "@/models/profile/study-profile.model";

export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
}

/** What Supabase Auth needs to sign someone in. */
export interface EmailCredentials {
  readonly email: string;
  readonly password: string;
}

/** What the login form collects: a username or an email address. */
export interface SignInFormValues {
  readonly identifier: string;
  readonly password: string;
}

export interface SignInFormState {
  readonly error?: string;
  readonly fieldErrors?: Partial<Record<"identifier" | "password", string>>;
  readonly values?: { readonly identifier: string };
}

export interface SignUpInput extends EmailCredentials {
  readonly fullName: string;
  readonly username: string;
  readonly studyProfile: StudyProfile;
}

export interface SignUpFormValues extends StudyProfileFormValues {
  readonly fullName: string;
  readonly username: string;
  readonly email: string;
  readonly password: string;
  readonly confirmPassword: string;
}

/** Fields on the first ("Account") step of the sign-up form. */
export const signUpAccountFields = [
  "fullName",
  "username",
  "email",
  "password",
  "confirmPassword",
] as const;

export type SignUpAccountField = (typeof signUpAccountFields)[number];

export type SignUpFieldErrors = StudyProfileErrors &
  Partial<Record<SignUpAccountField, string>>;

/** Passwords are never echoed back to the browser. */
export type SignUpEchoValues = Omit<SignUpFormValues, "password" | "confirmPassword">;

export interface SignUpFormState {
  readonly error?: string;
  readonly notice?: string;
  readonly fieldErrors?: SignUpFieldErrors;
  readonly values?: SignUpEchoValues;
}

export interface UsernameCheck {
  readonly available: boolean;
  readonly message: string;
}

export type AuthFailureReason =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "account_suspended"
  | "email_taken"
  | "invalid_email"
  | "weak_password"
  | "rate_limited"
  | "email_rate_limited"
  | "signup_disabled"
  | "unavailable";

export type SignInOutcome =
  | { readonly status: "signed_in" }
  | { readonly status: "failed"; readonly reason: AuthFailureReason };

export type SignUpOutcome =
  | { readonly status: "signed_in" }
  | { readonly status: "confirmation_required" }
  | { readonly status: "failed"; readonly reason: AuthFailureReason };

export const emailConfirmationTypes = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
] as const;

export type EmailConfirmationType = (typeof emailConfirmationTypes)[number];

export type EmailConfirmation =
  | { readonly tokenHash: string; readonly type: EmailConfirmationType }
  | { readonly code: string };

export const authFailureMessages: Record<AuthFailureReason, string> = {
  invalid_credentials: "Incorrect username/email or password.",
  email_not_confirmed:
    "Please confirm your email address first. Check your inbox for the confirmation link.",
  account_suspended:
    "This account has been suspended. Please contact an administrator.",
  email_taken: "An account with this email already exists. Try logging in instead.",
  invalid_email: "Please use a valid email address.",
  weak_password: "Please choose a stronger password.",
  rate_limited: "Too many attempts. Please wait a minute and try again.",
  email_rate_limited:
    "We couldn't send the confirmation email because too many emails were sent recently. Please try again later.",
  signup_disabled: "New registrations are currently closed.",
  unavailable: "Something went wrong. Please try again.",
};

export const usernameTakenMessage =
  "That username is already taken. Try another one.";

export const confirmationSentNotice =
  "Account created. We've sent a confirmation link to your email. Open it to activate your account, then log in with your username or email.";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const passwordRules = {
  minLength: 8,
  maxLength: 72,
} as const;

export function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** Anything containing "@" is treated as an email, otherwise a username. */
export function isEmailIdentifier(identifier: string): boolean {
  return identifier.includes("@");
}

function validateEmail(email: string): string | undefined {
  if (!email) {
    return "Enter your email address.";
  }

  if (email.length > 254 || !emailPattern.test(email)) {
    return "Enter a valid email address.";
  }

  return undefined;
}

function validatePassword(password: string): string | undefined {
  if (password.length < passwordRules.minLength) {
    return `Use at least ${passwordRules.minLength} characters.`;
  }

  if (password.length > passwordRules.maxLength) {
    return `Use ${passwordRules.maxLength} characters or fewer.`;
  }

  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "Include at least one letter and one number.";
  }

  return undefined;
}

export function validateSignIn(
  values: SignInFormValues,
): SignInFormState["fieldErrors"] {
  const errors: NonNullable<SignInFormState["fieldErrors"]> = {};

  if (!values.identifier) {
    errors.identifier = "Enter your username or email.";
  }

  if (!values.password) {
    errors.password = "Enter your password.";
  }

  return errors;
}

export type SignUpValidation =
  | { readonly ok: true; readonly input: SignUpInput }
  | { readonly ok: false; readonly fieldErrors: SignUpFieldErrors };

export type SignUpAccountValues = Pick<SignUpFormValues, SignUpAccountField>;

/**
 * Checks only the first ("Account") step. Pure, so the browser can run it
 * before moving to the next step and the server runs the same rules again.
 */
export function validateSignUpAccount(
  values: SignUpAccountValues,
): Partial<Record<SignUpAccountField, string>> {
  const checks: Record<SignUpAccountField, string | undefined> = {
    fullName: validateFullName(values.fullName),
    username: validateUsername(normaliseUsername(values.username), {
      required: true,
    }),
    email: validateEmail(normaliseEmail(values.email)),
    password: validatePassword(values.password),
    confirmPassword: !values.confirmPassword
      ? "Confirm your password."
      : values.confirmPassword !== values.password
        ? "Passwords do not match."
        : undefined,
  };
  const errors: Partial<Record<SignUpAccountField, string>> = {};

  for (const field of signUpAccountFields) {
    const message = checks[field];

    if (message) {
      errors[field] = message;
    }
  }

  return errors;
}

export function validateSignUp(values: SignUpFormValues): SignUpValidation {
  const username = normaliseUsername(values.username);
  const email = normaliseEmail(values.email);
  const study = validateStudyProfile(values);
  const fieldErrors: SignUpFieldErrors = {
    ...(study.ok ? {} : study.fieldErrors),
    ...validateSignUpAccount(values),
  };

  if (!study.ok || Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    input: {
      fullName: values.fullName.trim(),
      username,
      email,
      password: values.password,
      studyProfile: study.value,
    },
  };
}

export function toSignUpEchoValues(values: SignUpFormValues): SignUpEchoValues {
  return {
    fullName: values.fullName,
    username: normaliseUsername(values.username),
    email: normaliseEmail(values.email),
    academicMajor: values.academicMajor,
    yearOfStudy: values.yearOfStudy,
    interests: values.interests,
    studyTimes: values.studyTimes,
    studyMode: values.studyMode,
    isDiscoverable: values.isDiscoverable,
  };
}

export function hasAccountStepErrors(errors: SignUpFieldErrors | undefined): boolean {
  return signUpAccountFields.some((field) => Boolean(errors?.[field]));
}

export function isEmailConfirmationType(
  value: string,
): value is EmailConfirmationType {
  return (emailConfirmationTypes as readonly string[]).includes(value);
}

export function getInitials(name: string, fallback = "ST"): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

  return initials || fallback;
}
