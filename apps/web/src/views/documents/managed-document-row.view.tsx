"use client";

import { useActionState, useState } from "react";

import {
  documentUploadRules,
  type DocumentDeleteFormState,
  type DocumentProcessFormState,
  type DocumentRenameFormState,
  type ManagedDocumentSummary,
} from "@/models/document/document.model";
import {
  documentStatusLabels,
  documentTypeLabel,
  formatBytes,
  formatContentSummary,
  formatDocumentDate,
} from "@/views/documents/document-display";
import { DocumentPreviewButton } from "@/views/documents/document-preview-button.view";
import { ConfirmSubmitButton } from "@/views/shared/confirm-submit-button.view";

export interface ManagedDocumentActions {
  readonly processAction: (
    state: DocumentProcessFormState,
    formData: FormData,
  ) => Promise<DocumentProcessFormState>;
  readonly renameAction: (
    state: DocumentRenameFormState,
    formData: FormData,
  ) => Promise<DocumentRenameFormState>;
  readonly deleteAction: (
    state: DocumentDeleteFormState,
    formData: FormData,
  ) => Promise<DocumentDeleteFormState>;
}

interface ManagedDocumentRowProps extends ManagedDocumentActions {
  readonly document: ManagedDocumentSummary;
}

export function ManagedDocumentRow({
  document,
  processAction,
  renameAction,
  deleteAction,
}: ManagedDocumentRowProps) {
  const [editing, setEditing] = useState(false);
  const [processState, processFormAction, extracting] = useActionState(
    processAction,
    {},
  );
  const [renameState, renameFormAction, renaming] = useActionState(
    async (previous: DocumentRenameFormState, formData: FormData) => {
      const result = await renameAction(previous, formData);

      if (result.notice) {
        setEditing(false);
      }

      return result;
    },
    {},
  );
  const [deleteState, deleteFormAction, deleting] = useActionState(
    deleteAction,
    {},
  );
  const titleInputId = `document-title-${document.id}`;

  return (
    <li className="managed-document">
      <span className="document-type" aria-hidden="true">
        {documentTypeLabel(document.mimeType)}
      </span>

      <div className="managed-document-body">
        {editing ? (
          <form className="managed-document-rename" action={renameFormAction}>
            <input type="hidden" name="documentId" value={document.id} />
            <label className="visually-hidden" htmlFor={titleInputId}>
              New title for {document.fileName}
            </label>
            <input
              id={titleInputId}
              name="title"
              defaultValue={document.title}
              maxLength={documentUploadRules.maxTitleLength}
              required
              autoFocus
            />
            <button className="button button-dark" type="submit" disabled={renaming}>
              {renaming ? "Saving..." : "Save"}
            </button>
            <button
              className="text-action"
              type="button"
              onClick={() => setEditing(false)}
              disabled={renaming}
            >
              Cancel
            </button>
          </form>
        ) : (
          <DocumentPreviewButton
            documentId={document.id}
            title={document.title}
            mimeType={document.mimeType}
          />
        )}
        <p>
          {document.fileName} · {formatBytes(document.sizeBytes)} · Uploaded{" "}
          {formatDocumentDate(document.createdAt)}
        </p>
        {document.status === "ready" && document.content ? (
          <p className="managed-document-content">
            {formatContentSummary(document.content)}
          </p>
        ) : null}
        {document.status === "ready" && document.content
          ? document.content.warnings.map((warning) => (
              <p className="managed-document-warning" key={warning}>
                {warning}
              </p>
            ))
          : null}
        {document.awaitingExtraction ? (
          <p className="managed-document-content">
            {document.status === "processing"
              ? "Extracting and cleaning the text. This page updates automatically."
              : "Waiting for text extraction to start. No action is needed."}
          </p>
        ) : null}
        {document.status === "failed" && document.errorMessage ? (
          <p className="managed-document-error">{document.errorMessage}</p>
        ) : null}
        {processState.error ? (
          <p className="form-alert" role="alert">{processState.error}</p>
        ) : null}
        {processState.notice && document.status === "ready" ? (
          <p className="form-notice" role="status">{processState.notice}</p>
        ) : null}
        {renameState.error && editing ? (
          <p className="form-alert" role="alert">{renameState.error}</p>
        ) : null}
        {deleteState.error ? (
          <p className="form-alert" role="alert">{deleteState.error}</p>
        ) : null}
      </div>

      <span className={`status-chip ${document.status}`}>
        {documentStatusLabels[document.status]}
      </span>

      <div className="managed-document-actions">
        {document.canRetry ? (
          <form action={processFormAction}>
            <input type="hidden" name="documentId" value={document.id} />
            <button
              className="text-action"
              type="submit"
              disabled={extracting}
              aria-label={`Retry text extraction for ${document.title}`}
            >
              {extracting ? "Extracting..." : "Retry extraction"}
            </button>
          </form>
        ) : null}
        <a
          className="text-action"
          href={`/documents/${document.id}/download`}
          aria-label={`Download ${document.title}`}
        >
          Download
        </a>
        {editing ? null : (
          <button
            className="text-action"
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Rename ${document.title}`}
          >
            Rename
          </button>
        )}
        <form action={deleteFormAction}>
          <input type="hidden" name="documentId" value={document.id} />
          <ConfirmSubmitButton
            className="text-action danger"
            message={`Delete "${document.title}"? Its extracted text, analysis results and generated quizzes will also be removed. This cannot be undone.`}
            disabled={deleting || extracting || !document.canDelete}
          >
            {deleting ? "Deleting..." : "Delete"}
          </ConfirmSubmitButton>
        </form>
      </div>
    </li>
  );
}
