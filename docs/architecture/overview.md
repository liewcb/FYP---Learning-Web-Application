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
| `video` | LiveKit video calls started from direct and group chats |
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

## Group chats

Small study groups reuse the chat tables: a `chat_conversations` row of kind
`group` with a title, an admin and at most five members, including the admin.

```text
admin creates group -> invites up to 4 study buddies (chat_group_invites)
invitee accepts -> chat_members row -> "joined" event message
admin: invite, cancel invite, remove, make admin, rename, disband
member: exit group (an exiting admin hands over to the earliest member)
```

- The admin invites their own study buddies, or anyone who left or was removed
  from the group before. Members plus open invitations never exceed five; the
  group row is locked while this is checked.
- Each member reads messages inside their membership window: from `joined_at`,
  up to `left_at` once they leave or are removed. Former members keep a
  read-only history. Disbanding refuses new messages but keeps the history.
- Membership changes are posted as event messages (`chat_messages.event`), so
  open chats update through the existing Realtime stream; `chat_conversations`
  is not published because it changes on every message.
- Policies cannot read `chat_members` from its own policy, so
  `chat_conversations.member_ids` holds the current members, maintained by a
  trigger. It authorises member rows, typing channels and attachment uploads.
- Group receipts are those of the slowest current member. Last-seen times are
  shown only between study buddies, as in direct chats. Blocking and reporting
  stay one-to-one.
- `group_invite` and `group_invite_accepted` notifications come from a trigger
  on `chat_group_invites`; invitations are answered at the top of the chat list.

## Video calls

Calls use LiveKit (see ADR 0003). A call (`video_calls`) belongs to a direct or
group chat; at most one is in progress per chat.

```text
video button in a chat -> openVideoCallAction -> VideoCallController
  -> open_video_call RPC (may this student use the chat?) -> "call_started" event
/calls/[id] -> get_video_call RPC (member or invited?) -> LiveKit room (max 5)
  -> signed join token -> LiveKit call screen in the browser
```

- Chat members may invite their own study buddies (`video_call_invites`). Chat
  members plus invitations never exceed five, and the room refuses a sixth.
- Other members get a `video_call_started` notification (unless muted);
  invitees get `video_call_invite`. Both link to `/calls/[id]`.
- `VideoRoomService` (`lib/livekit`) is the only code that talks to LiveKit's
  server API; the browser call screen is injected into the view by the route.
- A call whose room has been empty for over a minute is ended by
  `end_video_call`, which only the service role may run.

### Presenting documents in a call

- Anyone in a call may present one of their own My Documents files
  (`video_call_shares`, one at a time; presenting another replaces it).
- The file stays in the presenter's private storage. `/calls/[id]/shared/[shareId]`
  checks `get_call_share` (may this student join the call?) on every visit and
  redirects to a signed link that expires within a minute; access ends with the
  presentation or the call.
- PDFs render with pdf.js and DOCX files with docx-preview, both loaded only
  when needed and injected into the view as `DocumentViewers`.
- The presenter's page (PDF) or scroll position (DOCX) travels over the call's
  LiveKit data channel (`CallChannel`), not the database. Viewers follow by
  default, can browse on their own and jump back with "Follow". Late joiners
  ask the presenter for the position.

## Reports

One `reports` table holds every report a student sends: a profile, a chat
message (direct or group), a forum post or comment, or a library material. It
replaced `forum_reports` and `chat_reports`, whose rows were moved into it.

```text
Report button -> submitReportAction -> ReportController -> submit_report RPC
  (can the reporter see it? not their own? one open report per target)
  -> reports row with a snapshot of what was reported
Admin "Report review" -> ReportReviewController -> admin_resolve_report RPC
  -> remove content / suspend (through User management) / dismiss
  -> every open report on the same target closed, each reporter notified
```

- The snapshot is taken when the report is sent, so evidence survives edits and
  deletion. A chat message report includes the five messages before it that
  the reporter could see; a profile reported from a chat includes the last ten.
- Decisions: no violation, remove the content, suspend the account, or both.
  Suspension goes through `AdminUsersController.suspend` (it also blocks
  sign-in); the database then requires the account to be suspended before it
  records the decision.
- The reporter gets a `report_resolved` notification and sees the outcome, and
  any message from the moderator, on `/reports`. Reporters cannot read who
  decided or the internal reason (column grants), which goes to the audit log.
- The forum moderation page reads the same table, and hiding or removing a post
  there also closes and notifies its reports.

## Security boundaries

- The browser receives only the Supabase URL and publishable key.
- Supabase RLS is the final authorization boundary for browser-accessible data.
- The AI service is called through trusted server-side code, not exposed with a secret key in the browser.
- Private learning materials use owner-scoped storage paths.
- Administrative roles are server-controlled and never derived from user-editable metadata.
