"use client";

import { useActionState, useRef, useState } from "react";

import {
  documentUploadRules,
  type DocumentUploadFormState,
} from "@/models/document/document.model";
import { formatBytes } from "@/views/documents/document-display";

interface DocumentUploadViewProps {
  readonly action: (
    state: DocumentUploadFormState,
    formData: FormData,
  ) => Promise<DocumentUploadFormState>;
}

export function DocumentUploadView({ action }: DocumentUploadViewProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const [title, setTitle] = useState(state.values?.title ?? "");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <form className="module-card upload-form" action={formAction} noValidate>
      <div className="module-card-heading">
        <span className="module-icon" aria-hidden="true">↑</span>
        <div>
          <h2>Upload a document</h2>
        </div>
      </div>

      <p className="module-card-copy">
        One PDF or DOCX at a time. Only you can see it.
      </p>

      {state.error ? (
        <p className="form-alert" role="alert">{state.error}</p>
      ) : null}
      {state.notice ? (
        <p className="form-notice" role="status">{state.notice}</p>
      ) : null}

      <div className="form-field">
        <label htmlFor="document-title">Material title</label>
        <input
          id="document-title"
          name="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={documentUploadRules.maxTitleLength}
          placeholder="e.g. Software Safety — Chapter 3"
          required
        />
      </div>

      <div className="upload-file-field">
        <label className="upload-picker" htmlFor="document-file">
          <span className="upload-picker-icon" aria-hidden="true">＋</span>
          <span>
            <strong>Choose a PDF or DOCX</strong>
            <small>Private upload · maximum 25 MB</small>
          </span>
          <input
            ref={fileInput}
            id="document-file"
            name="file"
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              setSelectedFile(file);

              if (file && !title.trim()) {
                setTitle(file.name.replace(/\.(pdf|docx)$/i, ""));
              }
            }}
            required
          />
        </label>
        {selectedFile ? (
          <div className="selected-upload-file" role="status">
            <span className="selected-upload-file-icon" aria-hidden="true">
              {selectedFile.name.toLowerCase().endsWith(".pdf") ? "PDF" : "DOC"}
            </span>
            <span className="selected-upload-file-details">
              <strong>{selectedFile.name}</strong>
              <small>{formatBytes(selectedFile.size)} · ready to upload</small>
            </span>
            <button
              className="text-action"
              type="button"
              onClick={() => {
                if (fileInput.current) fileInput.current.value = "";
                setSelectedFile(null);
              }}
              aria-label={`Remove ${selectedFile.name}`}
            >
              Remove
            </button>
          </div>
        ) : null}
      </div>

      <button className="button button-dark" type="submit" disabled={pending}>
        {pending ? "Uploading..." : "Upload document"}
      </button>
    </form>
  );
}
