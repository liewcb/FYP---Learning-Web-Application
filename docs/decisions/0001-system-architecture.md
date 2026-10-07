# ADR 0001: System architecture

- Status: Accepted
- Date: 2026-10-07

## Decision

Use a responsive Next.js website backed by Supabase Auth, PostgreSQL, Storage and Realtime. Keep business features in a modular monolith and isolate Python-based document and AI processing in a FastAPI service.

## Why

- The approved project scope is a website rather than a native mobile application.
- Supabase supplies the shared identity, data, storage and real-time foundation needed by both developers.
- Next.js supports the student and administration interfaces in one TypeScript application.
- Python has the strongest library ecosystem for PDF/DOCX processing and NLP.
- A modular monolith is simpler to build, test and deploy than twelve separate services.

## Consequences

- MVC/MVVM is not used as the top-level system description. The system is described as three-tier and modular.
- Database migrations and RLS policies are shared integration artifacts and require teammate review.
- The web and AI services must agree on explicit API contracts and processing states.
