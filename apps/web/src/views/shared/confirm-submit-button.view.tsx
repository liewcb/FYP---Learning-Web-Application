"use client";

import type { MouseEvent } from "react";

interface ConfirmSubmitButtonProps {
  readonly children: string;
  readonly className?: string;
  readonly message: string;
  readonly disabled?: boolean;
}

export function ConfirmSubmitButton({
  children,
  className,
  message,
  disabled,
}: ConfirmSubmitButtonProps) {
  function confirmSubmission(event: MouseEvent<HTMLButtonElement>) {
    if (!window.confirm(message)) {
      event.preventDefault();
    }
  }

  return (
    <button
      className={className}
      type="submit"
      onClick={confirmSubmission}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
