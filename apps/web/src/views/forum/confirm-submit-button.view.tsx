"use client";

import type { MouseEvent } from "react";

interface ConfirmSubmitButtonProps {
  readonly children: string;
  readonly className?: string;
  readonly message: string;
}

export function ConfirmSubmitButton({
  children,
  className,
  message,
}: ConfirmSubmitButtonProps) {
  function confirmSubmission(event: MouseEvent<HTMLButtonElement>) {
    if (!window.confirm(message)) {
      event.preventDefault();
    }
  }

  return (
    <button className={className} type="submit" onClick={confirmSubmission}>
      {children}
    </button>
  );
}
