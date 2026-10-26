# API contracts

## Implemented system endpoints

| Owner | Method and path | Purpose |
|---|---|---|
| Next.js | `GET /api/health` | Confirm that the web service is running |
| Next.js | `GET /api/ai/health` | Call FastAPI through the `AiService` interface and return `503` when unavailable |
| FastAPI | `GET /` | Return AI-service information and endpoint links |
| FastAPI | `GET /health` | Confirm that the AI service is running |
| FastAPI | `POST /documents/process` | Protected PDF/DOCX text extraction and preprocessing into `document_contents` |
| FastAPI | `POST /analysis/content` | Analyse preprocessed sentences into keywords, important sentences, topics and concepts |
| FastAPI | `POST /analysis/content-and-save` | Protected content analysis with Supabase lifecycle persistence |
| FastAPI | `POST /quiz/generate` | Generate and validate a grounded quiz using Gemini structured output |
| FastAPI | `POST /quiz/generate-and-save` | Protected Gemini generation with atomic quiz and answer-key persistence |

The browser should call a Next.js endpoint or Server Action for protected AI operations. It should not call the Python service directly.

The `*-and-save` endpoints and `POST /documents/process` require `X-Internal-Token`. The value is shared
only by the Next.js server and FastAPI through private environment variables.
They may return `401` for an invalid token, `503` for missing private service
configuration, and `502` when Supabase or Gemini cannot complete the operation.

## Contract checklist

Document every endpoint before integration. Each contract should include:

- purpose and owning module
- method and path
- authentication requirements
- request body or query parameters
- success response
- error responses
- database status changes

The protected integration endpoints accept stored document identifiers and
persist analysis and quiz lifecycle rows. Gemini responses use a provider-safe
JSON schema and are then validated with stricter Pydantic rules before any quiz
questions or answer keys are committed.

## `POST /documents/process`

- **Owner:** FastAPI `documents` module, called by the Next.js `DocumentController`
  after upload and from the Manage documents tab.
- **Authentication:** `X-Internal-Token`. The web server first confirms through
  Supabase RLS that the signed-in student owns the document.
- **Request:** `{ "document_id": 12 }`
- **Success `200`:**

  ```json
  {
    "document_id": 12,
    "status": "ready",
    "page_count": 14,
    "word_count": 3820,
    "character_count": 24511,
    "sentence_count": 211,
    "language_code": "en",
    "extractor": "pypdf 6.10.0",
    "warnings": ["1 page has no selectable text and may contain only images."]
  }
  ```

- **Errors:** `401` invalid token; `404` document not found; `409` document is
  already `ready` or being processed; `422` the file cannot be used, with a
  student-readable `detail`; `502` Supabase read or write failed; `503`
  missing service configuration.
- **Status changes:** `documents.status` moves `uploaded | failed | stale
  processing -> processing -> ready | failed`. `failed` sets
  `documents.error_message`. Success upserts one `document_contents` row.
