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

## Revision dashboard

The student dashboard (`/`) is a revision workspace over the student's own
documents. Step 1 uses no new AI endpoints.

- `study_subjects` groups documents (`documents.subject_id`) and notes.
- The reader shows `document_contents.sentences` grouped into passages.
  Highlights (`study_highlights`), notes (`study_notes`) and reading progress
  (`reading_progress`) refer to passages by their first sentence index.
- Key points and key terms come from the newest ready `document_analyses` row.
  **Find key points** calls the existing `/analysis/content-and-save` endpoint.
- `study_activity` records one row per day of revision for the streak. It is
  written only by triggers and `record_reading_progress()`.
- Ownership of a document's or note's subject and source document is enforced
  by triggers, because row-level security alone cannot check foreign ids.

## Study buddy chat

One-to-one chats between accepted study buddies (`chat_conversations`,
`chat_members`, `chat_messages` and the private `chat-attachments` bucket).

```text
composer -> sendChatMessageAction -> ChatController -> ChatRepository
              -> send_chat_message RPC (checks buddy link, length, attachment)
chat_messages INSERT -> Supabase Realtime (filtered by RLS) -> other member's page
  -> syncChatAction (new messages, receipts) -> mark_chat_read
```

- Ticks come from each member's `last_delivered_at` and `last_read_at`, so
  there are no per-message receipt rows.
- The Chats badge polls `/api/chats/inbox` every 30 seconds from every student
  page. That call also records `profiles.last_seen_at` (online / last seen) and
  marks waiting messages as delivered.
- Typing uses Realtime broadcast on private `chat:<id>` channels, authorized by
  policies on `realtime.messages`.
- The browser-side Realtime adapter (`lib/supabase/realtime`) is created in
  `app/chats/connected-chat-workspace.tsx` and passed to the view through the
  `ChatRealtime` interface, so views never import Supabase.
- All writes go through security-definer functions. Removing a buddy keeps the
  history readable but refuses new messages.
- Pin, mute, clear and delete are per-student settings on `chat_members`
  (`pinned_at`, `muted`, `cleared_at`, `hidden_at`); they never change what the
  other student sees. Clearing hides older messages from lists, search and
  shared files; a deleted chat returns when a new message arrives.
- `chat_blocks` stops both students sending in that chat and hides presence.
  `chat_reports` stores reports for the admin moderation milestone.

## Security boundaries

- The browser receives only the Supabase URL and publishable key.
- Supabase RLS is the final authorization boundary for browser-accessible data.
- The AI service is called through trusted server-side code, not exposed with a secret key in the browser.
- Private learning materials use owner-scoped storage paths.
- Administrative roles are server-controlled and never derived from user-editable metadata.
