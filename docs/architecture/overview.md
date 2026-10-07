# Architecture overview

## Style

The platform is a responsive web application using a three-tier client-server architecture. The main application remains a modular monolith, with one separate Python service for document and AI workloads.

```text
Browser
  |
  v
Next.js web application
  |-- Supabase Auth
  |-- Supabase PostgreSQL and Row Level Security
  |-- Supabase Storage
  |-- Supabase Realtime
  `-- FastAPI AI service
        |-- PDF/DOCX extraction
        |-- preprocessing
        |-- content analysis
        `-- quiz generation
```

## Web MVC boundaries

The web application uses MVC inside the Next.js App Router:

```text
app route -> controller -> interface <- lib adapter -> Supabase/FastAPI
    |             |
    v             v
   view <------- model
```

| Layer | Location | Responsibility |
|---|---|---|
| Route adapter | `src/app` | URLs, layouts, route handlers and dependency assembly |
| View | `src/views` | React UI and presentation |
| Controller | `src/controllers` | Application use cases and coordination |
| Model | `src/models` | Domain classes, data objects and business rules |
| Interface | `src/interfaces` | Contracts for persistence and external services |
| Infrastructure | `src/lib` | Supabase clients/repositories, HTTP clients and framework utilities |

Controllers depend on interfaces rather than Supabase or `fetch` directly. Concrete adapters under `lib` implement those interfaces. Views never receive Supabase clients or secret credentials.

## Application modules

Each module is represented across the MVC folders as needed:

| Feature | Responsibilities |
|---|---|
| `auth` | Registration, login, password reset and sessions |
| `profiles` | Student profile and academic preferences |
| `documents` | Upload metadata, private files and processing state |
| `analysis` | Summary, keywords and topics |
| `quizzes` | Questions, attempts, scoring and recommendations |
| `forum` | Threads, comments, voting and attachments |
| `library` | Public materials and approval workflow |
| `peers` | Search, requests and confirmed connections |
| `study-groups` | Membership, chat and file sharing |
| `video` | Jitsi meeting rooms and session metadata |
| `admin` | Users, moderation and audit history |
| `monitoring` | Usage, storage and basic system reports |

## First vertical slice

```text
sign in
  -> upload document to private storage
  -> create document record (uploaded)
  -> request AI processing (processing)
  -> extract and analyse text
  -> save result (ready or failed)
  -> generate quiz
  -> submit attempt
  -> store score and recommendation
```

Document status is persisted so that failures are visible and processing can later move to a queue without changing the user workflow.

## Security boundaries

- The browser receives only the Supabase URL and publishable key.
- Supabase RLS is the final authorization boundary for browser-accessible data.
- The AI service is called through trusted server-side code, not exposed with a secret key in the browser.
- Private learning materials use owner-scoped storage paths.
- Administrative roles are server-controlled and never derived from user-editable metadata.
