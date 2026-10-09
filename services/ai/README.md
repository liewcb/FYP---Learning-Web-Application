# AI service

This FastAPI service owns document extraction, preprocessing, content analysis and quiz generation. Content analysis uses a reproducible hybrid pipeline: TF-IDF provides a baseline, while a pretrained MiniLM sentence-transformer, KeyBERT, agglomerative clustering and spaCy provide semantic keywords, important sentences, topics and concepts. The project does not train a language model from scratch.

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
| `POST /analysis/content` | Analyse preprocessed sentences into keywords, topics, important sentences and concepts |

The Next.js server calls this service through the `AiService` interface. With both applications running, <http://localhost:3000/api/ai/health> tests the complete web-to-AI connection.

Run the tests with:

```powershell
pnpm test:ai
```

## Try content analysis without the website

Start the service, open <http://127.0.0.1:8000/docs>, expand `POST /analysis/content`, select **Try it out**, and submit preprocessed sentences such as:

```json
{
  "sentences": [
    "Database normalization reduces duplicated data.",
    "Functional dependencies describe relationships between attributes.",
    "Third Normal Form removes transitive dependencies."
  ],
  "top_keywords": 10,
  "top_sentences": 3,
  "max_topics": 3
}
```

The first real request downloads `sentence-transformers/all-MiniLM-L6-v2` and caches it locally. Later requests reuse both the downloaded files and the in-memory model. No Supabase table, Supabase key, Gemini key or UI is required for this local milestone.

`127.0.0.1` is the computer's local loopback address and is equivalent to
`localhost` for this service. Swagger is generated automatically from the
FastAPI route and Pydantic request/response models. It sends a real HTTP request
when **Execute** is selected; the JSON under **Server response > Response body**
is the real result, while JSON shown under **Schemas** is only an example.

`max_topics` is an upper limit rather than a required count. The analyser may
return fewer topics when an additional cluster would contain only one sentence.

Do not expose a Supabase secret key to the Next.js browser bundle. When document processing is implemented, the web server layer must authenticate requests and call this service through a documented API contract.
