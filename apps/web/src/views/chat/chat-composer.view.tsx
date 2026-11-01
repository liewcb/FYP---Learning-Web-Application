"use client";

import Link from "next/link";
import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type Ref,
} from "react";

import {
  attachmentLabel,
  chatRules,
  normaliseChatBody,
  validateChatUpload,
  type ShareableDocument,
} from "@/models/chat/chat.model";
import {
  CloseIcon,
  FileIcon,
  PaperclipIcon,
  ReplyIcon,
  SendIcon,
  UploadIcon,
} from "@/views/chat/chat-icons.view";

export interface ChatDraft {
  readonly body: string;
  readonly file: File | null;
  readonly document: ShareableDocument | null;
}

/** Lets the conversation hand over a file dragged onto it. */
export interface ChatComposerHandle {
  attachFile(file: File): void;
}

interface ChatComposerProps {
  readonly ref?: Ref<ChatComposerHandle>;
  readonly documents: readonly ShareableDocument[];
  /** Shown above the input while replying. */
  readonly reply: { readonly name: string; readonly text: string } | null;
  readonly onCancelReply: () => void;
  readonly onTyping: () => void;
  /** Resolves to an error message, or null when the message was sent. */
  readonly onSend: (draft: ChatDraft) => Promise<string | null>;
}

const maxInputHeight = 160;
const counterThreshold = 200;

export function ChatComposer({
  ref,
  documents,
  reply,
  onCancelReply,
  onTyping,
  onSend,
}: ChatComposerProps) {
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [document, setDocument] = useState<ShareableDocument | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const documentsRef = useRef<HTMLDialogElement>(null);

  const remaining = chatRules.maxBodyLength - body.length;
  const canSubmit = normaliseChatBody(body).length > 0 || file !== null || document !== null;

  useEffect(() => {
    if (reply) {
      inputRef.current?.focus();
    }
  }, [reply]);

  useImperativeHandle(ref, () => ({ attachFile: chooseFile }));

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    window.document.addEventListener("pointerdown", closeOnOutsidePointer);
    window.document.addEventListener("keydown", closeOnEscape);

    return () => {
      window.document.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  function resizeInput() {
    const input = inputRef.current;

    if (input) {
      input.style.height = "auto";
      input.style.height = `${Math.min(input.scrollHeight, maxInputHeight)}px`;
    }
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();

    if (!canSubmit) {
      return;
    }

    const draft: ChatDraft = { body, file, document };

    // Clear straight away, like WhatsApp; restore the draft if sending fails.
    setBody("");
    setFile(null);
    setDocument(null);
    setError(null);
    window.requestAnimationFrame(resizeInput);

    const failure = await onSend(draft);

    if (failure) {
      setBody((current) => current || draft.body);
      setFile((current) => current ?? draft.file);
      setDocument((current) => current ?? draft.document);
      setError(failure);
      window.requestAnimationFrame(resizeInput);
    }

    inputRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  }

  function chooseFile(chosen: File | undefined) {
    if (fileRef.current) {
      fileRef.current.value = "";
    }

    if (!chosen) {
      return;
    }

    const problem = validateChatUpload(chosen);

    if (problem) {
      setError(problem);
      return;
    }

    setError(null);
    setDocument(null);
    setFile(chosen);
    inputRef.current?.focus();
  }

  function chooseDocument(chosen: ShareableDocument) {
    setError(null);
    setFile(null);
    setDocument(chosen);
    documentsRef.current?.close();
    inputRef.current?.focus();
  }

  function closeDocumentsOnBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) {
      event.currentTarget.close();
    }
  }

  const attachment = file
    ? { name: file.name, label: attachmentLabel({ mimeType: file.type, sizeBytes: file.size }) }
    : document
      ? { name: document.fileName, label: `${attachmentLabel(document)} · from My Documents` }
      : null;

  return (
    <form className="chat-composer" onSubmit={submit}>
      {reply ? (
        <div className="chat-composer-chip">
          <ReplyIcon />
          <span className="chat-composer-chip-text">
            <strong>Replying to {reply.name}</strong>
            <span>{reply.text}</span>
          </span>
          <button
            className="chat-icon-button small"
            type="button"
            onClick={onCancelReply}
            aria-label="Cancel reply"
          >
            <CloseIcon />
          </button>
        </div>
      ) : null}

      {attachment ? (
        <div className="chat-composer-chip">
          <FileIcon />
          <span className="chat-composer-chip-text">
            <strong>{attachment.name}</strong>
            <span>{attachment.label}</span>
          </span>
          <button
            className="chat-icon-button small"
            type="button"
            onClick={() => {
              setFile(null);
              setDocument(null);
            }}
            aria-label="Remove attachment"
          >
            <CloseIcon />
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="chat-composer-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="chat-composer-row">
        <div className="chat-attach" ref={menuRef}>
          <button
            className="chat-icon-button"
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Attach a file"
            aria-expanded={menuOpen}
            aria-controls="chat-attach-menu"
          >
            <PaperclipIcon />
          </button>
          {menuOpen ? (
            <div className="chat-attach-menu" id="chat-attach-menu">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  documentsRef.current?.showModal();
                }}
              >
                <span className="chat-attach-icon documents" aria-hidden="true">
                  <FileIcon />
                </span>
                <span>
                  <strong>From My Documents</strong>
                  <small>Share a note you already uploaded</small>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  fileRef.current?.click();
                }}
              >
                <span className="chat-attach-icon upload" aria-hidden="true">
                  <UploadIcon />
                </span>
                <span>
                  <strong>Upload from device</strong>
                  <small>PDF, DOCX, PNG, JPG or WebP, up to 10 MB</small>
                </span>
              </button>
            </div>
          ) : null}
          <input
            ref={fileRef}
            className="visually-hidden"
            type="file"
            accept={chatRules.attachmentAccept}
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => chooseFile(event.target.files?.[0])}
          />
        </div>

        <label className="chat-input">
          <span className="visually-hidden">Type a message</span>
          <textarea
            ref={inputRef}
            rows={1}
            value={body}
            maxLength={chatRules.maxBodyLength}
            placeholder={attachment ? "Add a caption" : "Type a message"}
            onChange={(event) => {
              setBody(event.target.value);
              resizeInput();
              onTyping();
            }}
            onKeyDown={handleKeyDown}
          />
          {remaining <= counterThreshold ? (
            <small className="chat-input-counter" aria-live="polite">
              {remaining} left
            </small>
          ) : null}
        </label>

        <button
          className="chat-send"
          type="submit"
          disabled={!canSubmit}
          aria-label="Send message"
        >
          <SendIcon />
        </button>
      </div>

      <dialog
        className="chat-dialog"
        ref={documentsRef}
        aria-labelledby="chat-documents-title"
        onClick={closeDocumentsOnBackdrop}
      >
        <div className="chat-dialog-panel">
          <header className="chat-dialog-header">
            <h2 id="chat-documents-title">Share from My Documents</h2>
            <button
              className="chat-icon-button"
              type="button"
              onClick={() => documentsRef.current?.close()}
              aria-label="Close"
            >
              <CloseIcon />
            </button>
          </header>
          {documents.length > 0 ? (
            <>
              <p className="chat-dialog-note">
                A copy is sent to this chat. The original stays private in My Documents.
              </p>
              <ul className="chat-contact-list">
                {documents.map((item) => (
                  <li key={item.id}>
                    <button
                      className="chat-contact"
                      type="button"
                      onClick={() => chooseDocument(item)}
                    >
                      <span className="chat-file-type pdf" aria-hidden="true">
                        {item.mimeType === "application/pdf" ? "PDF" : "DOCX"}
                      </span>
                      <span className="chat-contact-text">
                        <strong>{item.title}</strong>
                        <small>
                          {item.fileName} · {attachmentLabel(item)}
                        </small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="chat-dialog-empty">
              You have not uploaded any documents yet.{" "}
              <Link href="/documents">Go to My Documents</Link>
            </p>
          )}
        </div>
      </dialog>
    </form>
  );
}
