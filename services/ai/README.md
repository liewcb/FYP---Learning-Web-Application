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
| `POST /documents/process` | Protected extraction and preprocessing of an uploaded PDF or DOCX into `document_contents` |
| `POST /analysis/content` | Analyse preprocessed sentences into keywords, topics, important sentences and concepts |
| `POST /analysis/content-and-save` | Protected analysis flow that records status and persists the result |
| `POST /quiz/generate` | Generate and validate a grounded Gemini quiz without persistence |
| `POST /quiz/generate-and-save` | Protected quiz flow that persists questions and private answer keys |

The Next.js server calls this service through the `AiService` interface. With both applications running, <http://localhost:3000/api/ai/health> tests the complete web-to-AI connection.

Run the tests with:

```powershell
pnpm test:ai
```

## Document extraction and preprocessing

`POST /documents/process` turns an uploaded learning material into clean,
ordered sentences that content analysis and quiz generation can use directly.
The Next.js server calls it automatically after each upload. If an upload was
missed (for example, the AI service was offline) or a run crashed, opening
**My Documents** restarts it automatically. Students only act on genuine
failures, using **Retry extraction** in the **Manage documents** tab.

1. Claim the document with one conditional update, moving `uploaded` or
   `failed` to `processing`. A document stuck in `processing` for more than
   10 minutes is treated as abandoned and may be claimed again.
2. Download the private file from the `learning-materials` bucket.
3. Extract text with `pypdf` (page by page) or `python-docx` (headings,
   paragraphs, lists and tables in reading order).
   - OCR: scanned or image-only PDF pages are rendered with `pypdfium2` at
     200 DPI and read with RapidOCR (PP-OCR models on ONNX Runtime). Pictures
     inside PDF pages and DOCX files are read too, and DOCX picture text keeps
     its position. The models ship inside the `rapidocr` wheel, so OCR runs
     offline and nothing leaves the server.
   - Icons and decorations are skipped, full-page scans that already have a
     text layer are not read twice, and one document is limited to 60 OCR
     images or 4 minutes of OCR. OCR text adds a student-visible warning
     because it can contain recognition mistakes.
4. Preprocess:
   - normalise Unicode (NFKC), ligatures, invisible and control characters
   - remove repeated PDF headers and footers and page numbers
   - repair words hyphenated across line breaks and rebuild wrapped paragraphs
   - detect headings, which stay in the text but never become sentences
   - split sentences with spaCy's rule-based sentencizer
   - drop fragments under three words, captions, URLs, number-only rows and
     duplicates, and split sentences longer than 2,000 characters
5. Upsert `document_contents` (cleaned text, sentences, page and word counts,
   warnings and the file's SHA-256), then mark the document `ready`.

Unreadable files (password-protected PDFs, blank or unreadable scans, damaged
files, material without complete sentences) mark the document `failed` with a message the
student can act on. Consumers should cap stored sentences to the analysis and
quiz limits of 500 sentences and 100,000 characters; the web model provides
`limitSentencesForAi` for this.

## Try content analysis without the website

Start the service, open <http://127.0.0.1:8000/docs>, expand `POST /analysis/content`, select **Try it out**, and submit preprocessed sentences such as:

```json
{
  "sentences": [
    "Database normalization reduces duplicated data.",
    "Functional dependencies describe relationships between attributes.",
    "Third Normal Form removes transitive dependencies."
  ]
}
```

The first real request downloads `sentence-transformers/all-MiniLM-L6-v2` and caches it locally. Later requests reuse both the downloaded files and the in-memory model. No Supabase table, Supabase key, Gemini key or UI is required for this local milestone.

`127.0.0.1` is the computer's local loopback address and is equivalent to
`localhost` for this service. Swagger is generated automatically from the
FastAPI route and Pydantic request/response models. It sends a real HTTP request
when **Execute** is selected; the JSON under **Server response > Response body**
is the real result, while JSON shown under **Schemas** is only an example.

Only `sentences` is required. The analyser sizes its output from the material
and explains each choice in the response's `selection` object:

| Output | Automatic rule (when the limit is omitted) |
|---|---|
| Keywords (5-20) | Keep KeyBERT terms while they score at least 60% of the strongest term, stopping early at a sharp drop in scores (the "knee"). |
| Important sentences (3-12) | Maximal marginal relevance with at least one sentence per topic; stop when the next sentence scores below 70% of the first pick, capped at about 10% of the material. |
| Topics (up to 10) | Try 2 to about the square root of the sentence count, reject groupings with tiny topics, keep the highest silhouette score (ties go to more topics). |

`top_keywords`, `top_sentences` and `max_topics` can still be sent to fix the
counts. `max_topics` stays an upper limit rather than a required count.

## Configure Gemini quiz generation

Create an API key in Google AI Studio, then copy `.env.example` to `.env` and
replace only the local placeholder:

```powershell
Copy-Item services/ai/.env.example services/ai/.env
```

Never commit or paste the real key into documentation, source code or chat.
Configure all private server values in `services/ai/.env`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
AI_SERVICE_INTERNAL_TOKEN=replace-with-a-long-random-server-token
GEMINI_API_KEY=your-google-ai-studio-key
GEMINI_MODEL=gemini-3.5-flash-lite
```

Generate an internal server token locally with:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Copy the printed value into `AI_SERVICE_INTERNAL_TOKEN`; do not commit or send
it to the browser. Start Uvicorn with the environment file:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --app-dir services/ai --port 8000 --env-file services/ai/.env
```

Swagger then exposes `POST /quiz/generate` for a local integration test. The
route requests Gemini structured JSON and validates question count, types,
options, answers and source-sentence indexes before returning a result.

The `*-and-save` routes and `POST /documents/process` additionally require an
`X-Internal-Token` header that matches `AI_SERVICE_INTERNAL_TOKEN`. Set the same
value as `AI_SERVICE_INTERNAL_TOKEN` in `apps/web/.env.local` so the web server
can start text extraction. They are for the trusted Next.js server,
not direct browser calls. Analysis state is written to `document_analyses`.
Quiz completion uses one restricted database function so questions and private
answer keys are committed atomically.

Do not expose a Supabase secret key to the Next.js browser bundle. When document processing is implemented, the web server layer must authenticate requests and call this service through a documented API contract.
