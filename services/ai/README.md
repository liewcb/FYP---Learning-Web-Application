# AI service

This FastAPI service owns document extraction, preprocessing, content analysis and quiz generation. The initial scaffold contains only health endpoints so that infrastructure can be verified before model choices are introduced.

It does not own authentication, profiles, forums, study groups or ordinary application database operations. Those belong to the Next.js application and Supabase.

## First-time setup

Run from the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r services/ai/requirements-dev.txt
```

## Start the service

Run from the repository root:

```powershell
.\.venv\Scripts\Activate.ps1
pnpm dev:ai
```

Available endpoints:

| Endpoint | Purpose |
|---|---|
| `GET /` | Service information |
| `GET /health` | Health check |
| `GET /docs` | Interactive FastAPI documentation |

The Next.js server calls this service through the `AiService` interface. With both applications running, <http://localhost:3000/api/ai/health> tests the complete web-to-AI connection.

Run the tests with:

```powershell
pnpm test:ai
```

Do not expose a Supabase secret key to the Next.js browser bundle. When document processing is implemented, the web server layer must authenticate requests and call this service through a documented API contract.
