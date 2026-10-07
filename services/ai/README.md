# AI service

This FastAPI service owns document extraction, preprocessing, content analysis and quiz generation. The initial scaffold contains only health endpoints so that infrastructure can be verified before model choices are introduced.

Run from the repository root:

```powershell
.\.venv\Scripts\Activate.ps1
pnpm dev:ai
```

Do not expose a Supabase secret key to the Next.js browser bundle. When document processing is implemented, the web application's server layer should authenticate the request and call this service through an explicit API contract.
