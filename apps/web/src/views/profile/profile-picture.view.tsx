"use client";

import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from "react";

import {
  avatarMessages,
  avatarRules,
  avatarTypes,
  type AvatarUpdateState,
} from "@/models/profile/avatar.model";
import { AvatarImage } from "@/views/shared/avatar.view";
import { prepareAvatar } from "@/views/profile/avatar-image";

interface ProfilePictureProps {
  readonly initials: string;
  readonly avatarUrl: string | null;
  readonly uploadAction: (formData: FormData) => Promise<AvatarUpdateState>;
  readonly removeAction: () => Promise<AvatarUpdateState>;
}

type Busy = "preparing" | "saving" | "removing" | null;

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        d="M4 8h3l2-3h6l2 3h3v11H4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

/** The profile picture on the profile page, with a window to change or remove it. */
export function ProfilePicture({ initials, avatarUrl, uploadAction, removeAction }: ProfilePictureProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Shown at once after saving, before the page reloads its data.
  const [current, setCurrent] = useState(avatarUrl);
  const [chosen, setChosen] = useState<{ readonly blob: Blob; readonly url: string } | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  // The preview is a local object URL; free it when it is replaced or the window closes.
  useEffect(() => {
    return () => {
      if (chosen) {
        URL.revokeObjectURL(chosen.url);
      }
    };
  }, [chosen]);

  function open() {
    setError(null);
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  function reset() {
    setChosen(null);
    setError(null);
    setBusy(null);
  }

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!(avatarTypes as readonly string[]).includes(file.type)) {
      setError(avatarMessages.notImage);
      return;
    }

    if (file.size > avatarRules.maxSourceBytes) {
      setError("That picture is too large. Choose one under 15 MB.");
      return;
    }

    setBusy("preparing");
    setError(null);

    try {
      const blob = await prepareAvatar(file);
      setChosen({ blob, url: URL.createObjectURL(blob) });
    } catch {
      setError(avatarMessages.notImage);
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!chosen) {
      return;
    }

    const formData = new FormData();
    formData.append("avatar", chosen.blob, chosen.blob.type === "image/webp" ? "avatar.webp" : "avatar.jpg");
    setBusy("saving");
    setError(null);

    const state = await uploadAction(formData).catch(
      (): AvatarUpdateState => ({ status: "failed", error: avatarMessages.unavailable }),
    );

    if (state.status === "saved") {
      setCurrent(state.avatarUrl);
      close();
    } else {
      setError(state.error);
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("removing");
    setError(null);

    const state = await removeAction().catch(
      (): AvatarUpdateState => ({ status: "failed", error: avatarMessages.unavailable }),
    );

    if (state.status === "saved") {
      setCurrent(null);
      close();
    } else {
      setError(state.error);
      setBusy(null);
    }
  }

  function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget && !busy) {
      close();
    }
  }

  const shown = chosen?.url ?? current;

  return (
    <>
      <button
        className="profile-picture-button"
        type="button"
        onClick={open}
        aria-label={current ? "Change profile picture" : "Add a profile picture"}
        title={current ? "Change picture" : "Add picture"}
      >
        <span className={current ? "profile-avatar has-avatar" : "profile-avatar"} aria-hidden="true">
          {initials}
          <AvatarImage url={current} />
        </span>
        <span className="profile-picture-badge" aria-hidden="true">
          <CameraIcon />
        </span>
      </button>

      <dialog
        className="buddy-dialog profile-picture-dialog"
        ref={dialogRef}
        aria-labelledby="profile-picture-title"
        onClose={reset}
        onClick={closeOnBackdrop}
      >
        <div className="profile-picture-window">
          <header>
            <h2 id="profile-picture-title">Profile picture</h2>
            <button
              className="buddy-dialog-close"
              type="button"
              onClick={close}
              aria-label="Close"
              disabled={busy === "saving" || busy === "removing"}
            >
              ×
            </button>
          </header>

          <span className={shown ? "profile-picture-preview has-avatar" : "profile-picture-preview"}>
            {initials}
            {shown ? (
              // A local preview (blob:) or the same-site picture link.
              // eslint-disable-next-line @next/next/no-img-element
              <img className="avatar-image" src={shown} alt="Your profile picture" />
            ) : null}
          </span>

          {chosen ? <p className="field-hint">The middle of your picture is used.</p> : null}
          {error ? (
            <p className="form-alert" role="alert">
              {error}
            </p>
          ) : null}

          <input
            ref={inputRef}
            className="visually-hidden"
            type="file"
            accept={avatarTypes.join(",")}
            onChange={(event) => void choose(event)}
            tabIndex={-1}
            aria-hidden="true"
          />

          <div className="profile-picture-actions">
            {chosen ? (
              <>
                <button className="button button-dark" type="button" onClick={() => void save()} disabled={busy !== null}>
                  {busy === "saving" ? "Saving…" : "Save picture"}
                </button>
                <button className="button button-outline" type="button" onClick={() => inputRef.current?.click()} disabled={busy !== null}>
                  Choose another
                </button>
              </>
            ) : (
              <>
                <button className="button button-dark" type="button" onClick={() => inputRef.current?.click()} disabled={busy !== null}>
                  {busy === "preparing" ? "Opening…" : current ? "Choose new picture" : "Choose picture"}
                </button>
                {current ? (
                  <button className="button button-outline danger" type="button" onClick={() => void remove()} disabled={busy !== null}>
                    {busy === "removing" ? "Removing…" : "Remove"}
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
