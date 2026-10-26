"use client";

import { useState } from "react";

import {
  documentStatuses,
  type DocumentStatus,
  type ManagedDocumentSummary,
} from "@/models/document/document.model";
import { documentStatusLabels } from "@/views/documents/document-display";
import {
  ManagedDocumentRow,
  type ManagedDocumentActions,
} from "@/views/documents/managed-document-row.view";

interface DocumentManagerListProps extends ManagedDocumentActions {
  readonly documents: readonly ManagedDocumentSummary[];
}

type StatusFilter = DocumentStatus | "all";

export function DocumentManagerList({
  documents,
  processAction,
  renameAction,
  deleteAction,
}: DocumentManagerListProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const normalisedQuery = query.trim().toLowerCase();
  const visibleDocuments = documents.filter(
    (document) =>
      (status === "all" || document.status === status) &&
      (!normalisedQuery ||
        document.title.toLowerCase().includes(normalisedQuery) ||
        document.fileName.toLowerCase().includes(normalisedQuery)),
  );

  return (
    <article className="module-card document-manager-card">
      <div className="document-manager-toolbar">
        <div className="form-field">
          <label htmlFor="document-search">Search</label>
          <input
            id="document-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Title or file name"
          />
        </div>
        <div className="form-field">
          <label htmlFor="document-status-filter">Status</label>
          <select
            id="document-status-filter"
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
          >
            <option value="all">All statuses</option>
            {documentStatuses.map((value) => (
              <option key={value} value={value}>
                {documentStatusLabels[value]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {visibleDocuments.length > 0 ? (
        <ul className="document-list managed-document-list">
          {visibleDocuments.map((document) => (
            <ManagedDocumentRow
              key={document.id}
              document={document}
              processAction={processAction}
              renameAction={renameAction}
              deleteAction={deleteAction}
            />
          ))}
        </ul>
      ) : (
        <div className="document-empty">
          <span aria-hidden="true">⌕</span>
          <strong>No matching documents</strong>
          <p>Try a different search term or status filter.</p>
        </div>
      )}
    </article>
  );
}
