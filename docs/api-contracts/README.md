# API contracts

## Implemented system endpoints

| Owner | Method and path | Purpose |
|---|---|---|
| Next.js | `GET /api/health` | Confirm that the web service is running |
| Next.js | `GET /api/ai/health` | Call FastAPI through the `AiService` interface and return `503` when unavailable |
| FastAPI | `GET /` | Return AI-service information and endpoint links |
| FastAPI | `GET /health` | Confirm that the AI service is running |

The browser should call a Next.js endpoint or Server Action for protected AI operations. It should not call the Python service directly.

## Contract checklist

Document every endpoint before integration. Each contract should include:

- purpose and owning module
- method and path
- authentication requirements
- request body or query parameters
- success response
- error responses
- database status changes

The first planned AI endpoint is `POST /v1/documents/{document_id}/process`. It will be added with the first document-processing feature; the initial scaffold exposes only `GET /health`.
