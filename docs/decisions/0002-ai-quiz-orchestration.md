# ADR 0002: AI and quiz orchestration

- Status: Accepted
- Date: 2026-10-12

## Decision

Keep NLP analysis and Gemini quiz generation in the existing Python FastAPI
service. The Next.js server authenticates the student, checks document
ownership and calls FastAPI through the `AiService` interface. FastAPI performs
the trusted Supabase writes.

Do not add a Supabase Edge Function for this flow yet. Edge Functions remain an
option for short webhooks, scheduled dispatch or queue consumers if those are
needed later.

## Why

- The pretrained NLP pipeline already runs in Python.
- Adding equivalent TypeScript Edge Function orchestration would split one AI
  workflow across two runtimes.
- Gemini structured output can be validated with the same Pydantic models used
  by FastAPI.
- The browser never receives the Gemini API key or Supabase secret key.
- Long-running document processing can later move to a queue without changing
  the student-facing workflow.

## Data ownership

- `document_contents` stores trusted extraction and preprocessing output.
- `document_analyses` stores each analysis run and its model metadata.
- `quizzes` and `quiz_questions` contain student-readable generated content.
- `private.quiz_answer_keys` contains correct answers and explanations and is
  never exposed through the browser Data API.
- `quiz_attempts` and `quiz_answers` contain server-graded student work.

All public tables use RLS. Authenticated browser clients receive read-only
grants for this milestone; trusted server code owns writes and grading.

## Gemini configuration

The FastAPI runtime reads `GEMINI_API_KEY` and `GEMINI_MODEL` from its private
environment. The real `.env` file is ignored by Git. Only placeholders belong
in `.env.example`.
