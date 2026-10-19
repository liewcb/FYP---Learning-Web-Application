"use client";

import {
  useState,
  type ChangeEventHandler,
  type FocusEventHandler,
} from "react";

interface FormFieldProps {
  readonly id: string;
  readonly label: string;
  readonly type?: "text" | "email" | "password";
  readonly autoComplete: string;
  readonly defaultValue?: string;
  readonly error?: string;
  readonly hint?: string;
  readonly hintTone?: "default" | "success";
  readonly required?: boolean;
  readonly pattern?: string;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly autoCapitalize?: "none" | "words";
  readonly inputMode?: "text" | "numeric" | "email";
  readonly onBlur?: FocusEventHandler<HTMLInputElement>;
  readonly onChange?: ChangeEventHandler<HTMLInputElement>;
}

function EyeIcon({ crossed }: { readonly crossed: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {crossed ? <path d="M4 4l16 16" /> : null}
    </svg>
  );
}

export function FormField({
  id,
  label,
  type = "text",
  autoComplete,
  defaultValue,
  error,
  hint,
  hintTone = "default",
  required = true,
  pattern,
  minLength,
  maxLength,
  autoCapitalize,
  inputMode,
  onBlur,
  onChange,
}: FormFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === "password";
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  const input = (
    <input
      id={id}
      name={id}
      type={isPassword && revealed ? "text" : type}
      autoComplete={autoComplete}
      autoCapitalize={isPassword ? "none" : autoCapitalize}
      autoCorrect={isPassword ? "off" : undefined}
      inputMode={inputMode}
      spellCheck={isPassword ? false : undefined}
      defaultValue={defaultValue}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy}
      required={required}
      pattern={pattern}
      minLength={minLength}
      maxLength={maxLength}
      onBlur={onBlur}
      onChange={onChange}
    />
  );

  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      {isPassword ? (
        <div className="password-input">
          {input}
          <button
            className="password-toggle"
            type="button"
            onClick={() => setRevealed((current) => !current)}
            aria-label={revealed ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
            aria-pressed={revealed}
            aria-controls={id}
            title={revealed ? "Hide password" : "Show password"}
          >
            <EyeIcon crossed={revealed} />
          </button>
        </div>
      ) : (
        input
      )}
      {error ? (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      ) : hint ? (
        <p
          className={hintTone === "success" ? "field-hint success" : "field-hint"}
          id={`${id}-hint`}
          aria-live="polite"
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}
