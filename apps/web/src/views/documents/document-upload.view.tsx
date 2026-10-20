"use client";

import { useActionState, useState } from "react";

import {
  documentUploadRules,
  type DocumentUploadFormState,
} from "@/models/document/document.model";

interface DocumentUploadViewProps {
  readonly action: (
    state: DocumentUploadFormState,
    formData: FormData,
  ) => Promise<DocumentUploadFormState>;
}

export function DocumentUploadView({ action }: DocumentUploadViewProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const [title, setTitle] = useState(state.values?.title ?? "");

  return (
    <form className="module-card upload-form" action={formAction} noValidate>
      <div className="module-card-heading">
        <span className="module-icon" aria-hidden="true">↑</span>
        <div>
          <p className="section-kicker">Simple upload</p>
          <h2>Add learning material</h2>
        </div>
      </div>

      <p className="module-card-copy">
        Store one private PDF or DOCX now. Text extraction will be connected to
        this record when the preprocessing module is ready.
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

      <label className="upload-picker" htmlFor="document-file">
        <span className="upload-picker-icon" aria-hidden="true">＋</span>
        <span>
          <strong>Choose a PDF or DOCX</strong>
          <small>Private upload · maximum 25 MB</small>
        </span>
        <input
          id="document-file"
          name="file"
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(event) => {
            const file = event.target.files?.[0];

            if (file && !title.trim()) {
              setTitle(file.name.replace(/\.(pdf|docx)$/i, ""));
            }
          }}
          required
        />
      </label>

      <button className="button button-dark" type="submit" disabled={pending}>
        {pending ? "Uploading..." : "Upload document"}
      </button>
    </form>
  );
}
