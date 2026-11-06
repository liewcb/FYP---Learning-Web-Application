"use client";

import { useActionState } from "react";

import {
  libraryRules,
  type LibrarySubmitFormState,
  type LibrarySubmitFormValues,
  type LibrarySubmittableDocument,
} from "@/models/library/library.model";
import { formatBytes } from "@/views/documents/document-display";

interface SubmitMaterialFormProps {
  readonly documents: readonly LibrarySubmittableDocument[];
  readonly selectedId: number | null;
  readonly subjects: readonly string[];
  readonly action: (
    state: LibrarySubmitFormState,
    formData: FormData,
  ) => Promise<LibrarySubmitFormState>;
}

export function SubmitMaterialForm({
  documents,
  selectedId,
  subjects,
  action,
}: SubmitMaterialFormProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const selected = documents.find((document) => document.id === selectedId) ?? null;
  const values: LibrarySubmitFormValues = state.values ?? {
    documentId: selected ? String(selected.id) : "",
    title: selected?.title ?? "",
    description: "",
    subjectName: "",
    moduleCode: "",
    tags: "",
  };
  const errors = state.fieldErrors ?? {};

  return (
    <form className="module-card lib-submit-form" action={formAction} noValidate>
      <div className="module-card-heading">
        <span className="module-icon amber" aria-hidden="true">
          ▤
        </span>
        <div>
          <p className="section-kicker">Share with classmates</p>
          <h2>Submit a document to the Library</h2>
        </div>
      </div>

      <p className="module-card-copy">
        A copy of the file is sent to a moderator for review. Your original stays private in My
        Documents, and the copy is only visible to others once it is approved.
      </p>

      {state.error ? (
        <p className="form-alert" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="form-field">
        <label htmlFor="library-document">Document</label>
        <select
          id="library-document"
          name="documentId"
          defaultValue={values.documentId}
          aria-invalid={errors.documentId ? true : undefined}
        >
          <option value="">Choose a ready document</option>
          {documents.map((document) => (
            <option key={document.id} value={document.id}>
              {document.title} — {formatBytes(document.sizeBytes)}
            </option>
          ))}
        </select>
        {errors.documentId ? <p className="field-error">{errors.documentId}</p> : null}
      </div>

      <div className="form-field">
        <label htmlFor="library-title">Title</label>
        <input
          id="library-title"
          name="title"
          defaultValue={values.title}
          maxLength={libraryRules.titleMax}
          aria-invalid={errors.title ? true : undefined}
          placeholder="e.g. Database Normalisation — Chapter 3 Notes"
        />
        {errors.title ? <p className="field-error">{errors.title}</p> : null}
      </div>

      <div className="form-field">
        <label htmlFor="library-description">Short description</label>
        <textarea
          id="library-description"
          name="description"
          rows={4}
          defaultValue={values.description}
          maxLength={libraryRules.descriptionMax}
          aria-invalid={errors.description ? true : undefined}
          placeholder="What does this material cover, and who is it useful for?"
        />
        {errors.description ? <p className="field-error">{errors.description}</p> : null}
      </div>

      <div className="profile-form-grid">
        <div className="form-field">
          <label htmlFor="library-subject-name">Subject / category</label>
          <input
            id="library-subject-name"
            name="subjectName"
            list="library-subject-options"
            defaultValue={values.subjectName}
            maxLength={libraryRules.subjectMax}
            aria-invalid={errors.subjectName ? true : undefined}
            placeholder="e.g. Database Systems"
            autoComplete="off"
          />
          <datalist id="library-subject-options">
            {subjects.map((subject) => (
              <option key={subject} value={subject} />
            ))}
          </datalist>
          {errors.subjectName ? <p className="field-error">{errors.subjectName}</p> : null}
        </div>

        <div className="form-field">
          <label htmlFor="library-module-code">Module code (optional)</label>
          <input
            id="library-module-code"
            name="moduleCode"
            defaultValue={values.moduleCode}
            maxLength={libraryRules.moduleCodeMax}
            aria-invalid={errors.moduleCode ? true : undefined}
            placeholder="e.g. BACS2063"
            autoComplete="off"
          />
          {errors.moduleCode ? <p className="field-error">{errors.moduleCode}</p> : null}
        </div>
      </div>

      <div className="form-field">
        <label htmlFor="library-tags">Tags (optional)</label>
        <input
          id="library-tags"
          name="tags"
          defaultValue={values.tags}
          aria-invalid={errors.tags ? true : undefined}
          placeholder="Separate with commas, e.g. sql, normalisation, revision"
          autoComplete="off"
        />
        {errors.tags ? (
          <p className="field-error">{errors.tags}</p>
        ) : (
          <p className="field-hint">Up to {libraryRules.maxTags} tags help others find it.</p>
        )}
      </div>

      <button className="button button-dark" type="submit" disabled={pending}>
        {pending ? "Submitting..." : "Submit for review"}
      </button>
    </form>
  );
}