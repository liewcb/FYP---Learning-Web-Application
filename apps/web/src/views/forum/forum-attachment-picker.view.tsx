"use client";

import { useEffect, useRef, useState } from "react";

import { forumRules } from "@/models/forum/forum.model";
import { formatBytes } from "@/views/documents/document-display";

const allowedTypes = new Set<string>(forumRules.allowedAttachmentTypes);

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function typeLabel(file: File): string {
  if (file.type.startsWith("image/")) return "IMG";
  if (file.type === "application/pdf") return "PDF";
  return "DOC";
}

/** Shown under a file before posting; the server checks the same rules again. */
function fileProblem(file: File): string | null {
  if (!allowedTypes.has(file.type)) return "Not a JPEG, PNG, WebP, PDF or DOCX file";
  if (file.size > forumRules.maxAttachmentBytes) return "Larger than 10 MB";
  return null;
}

function writeInput(element: HTMLInputElement | null, files: readonly File[]) {
  if (!element) {
    return;
  }

  const transfer = new DataTransfer();
  files.forEach((file) => transfer.items.add(file));
  element.files = transfer.files;
}

/**
 * Supporting files for a new post, listed like the My Documents upload: each
 * chosen file shows its type, name and size and can be removed. Picking more
 * files adds to the list (up to the limit) instead of replacing it.
 */
export function ForumAttachmentPicker() {
  const [files, setFiles] = useState<File[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const filesRef = useRef<File[]>([]);
  const full = files.length >= forumRules.maxAttachments;
  const totalBytes = files.reduce((total, file) => total + file.size, 0);

  // The browser submits the input's own FileList, so keep it in step with
  // the list shown to the student.
  function sync(next: File[]) {
    writeInput(input.current, next);
    filesRef.current = next;
    setFiles(next);
  }

  // React resets the form after every submission. When the post was refused
  // (for example a short title), put the chosen files back so the student
  // does not have to pick them again. A successful post remounts this picker.
  useEffect(() => {
    const element = input.current;
    const form = element?.form;

    if (!element || !form) {
      return;
    }

    const restore = () => {
      window.setTimeout(() => writeInput(element, filesRef.current), 0);
    };

    form.addEventListener("reset", restore);
    return () => form.removeEventListener("reset", restore);
  }, []);

  function add(chosen: FileList | null) {
    const known = new Set(files.map(fileKey));
    const added = Array.from(chosen ?? []).filter((file) => !known.has(fileKey(file)));

    sync([...files, ...added].slice(0, forumRules.maxAttachments));
  }

  return (
    <div className="upload-file-field">
      <label
        className="upload-picker forum-attachment-picker"
        htmlFor="forum-attachments"
        aria-disabled={full}
      >
        <span className="upload-picker-icon" aria-hidden="true">＋</span>
        <span>
          <strong>{files.length > 0 ? "Add more files" : "Add supporting files"}</strong>
          <small>
            {full
              ? `File limit reached (${forumRules.maxAttachments})`
              : `Up to ${forumRules.maxAttachments} images, PDF or DOCX files · 10 MB each`}
          </small>
        </span>
        <input
          ref={input}
          id="forum-attachments"
          name="attachments"
          type="file"
          accept="image/jpeg,image/png,image/webp,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          multiple
          // Not disabled when full: a disabled input would not be submitted.
          onClick={(event) => {
            if (full) event.preventDefault();
          }}
          onChange={(event) => add(event.target.files)}
        />
      </label>

      {files.length > 0 ? (
        <>
          <ul className="forum-selected-files" aria-label="Selected files">
            {files.map((file) => {
              const problem = fileProblem(file);

              return (
                <li className={`selected-upload-file${problem ? " invalid" : ""}`} key={fileKey(file)}>
                  <span className="selected-upload-file-icon" aria-hidden="true">
                    {typeLabel(file)}
                  </span>
                  <span className="selected-upload-file-details">
                    <strong>{file.name}</strong>
                    <small>
                      {formatBytes(file.size)} · {problem ?? "ready to upload"}
                    </small>
                  </span>
                  <button
                    className="text-action"
                    type="button"
                    onClick={() => sync(files.filter((item) => item !== file))}
                    aria-label={`Remove ${file.name}`}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="field-hint" role="status">
            {files.length} of {forumRules.maxAttachments} files · {formatBytes(totalBytes)} in total
            {totalBytes > forumRules.maxCombinedAttachmentBytes ? " (over the 25 MB limit)" : ""}
          </p>
        </>
      ) : null}
    </div>
  );
}
