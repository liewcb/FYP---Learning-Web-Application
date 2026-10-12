# API contracts

## Implemented system endpoints

| Owner | Method and path | Purpose |
|---|---|---|
| Next.js | `GET /api/health` | Confirm that the web service is running |
| Next.js | `GET /api/ai/health` | Call FastAPI through the `AiService` interface and return `503` when unavailable |
| FastAPI | `GET /` | Return AI-service information and endpoint links |
| FastAPI | `GET /health` | Confirm that the AI service is running |
| FastAPI | `POST /analysis/content` | Analyse preprocessed sentences into keywords, important sentences, topics and concepts |
| FastAPI | `POST /analysis/content-and-save` | Protected content analysis with Supabase lifecycle persistence |
| FastAPI | `POST /quiz/generate` | Generate and validate a grounded quiz using Gemini structured output |
| FastAPI | `POST /quiz/generate-and-save` | Protected Gemini generation with atomic quiz and answer-key persistence |

The browser should call a Next.js endpoint or Server Action for protected AI operations. It should not call the Python service directly.

The two `*-and-save` endpoints require `X-Internal-Token`. The value is shared
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
