# ADR 0003: Video calls with LiveKit

- Status: Proposed
- Date: 2026-11-09

## Decision

Use LiveKit for video calls instead of the Jitsi integration planned in ADR
0001. A call belongs to a direct or group chat and has at most five people.
Chat members can invite individual study buddies who are not in the chat.

The Next.js server checks access in Supabase (`get_video_call`), then signs a
ten-minute LiveKit token for one room. Audio and video go between browsers and
LiveKit only. The browser uses LiveKit's ready-made call screen, which includes
camera, microphone, screen sharing and in-call chat.

## Why

- The public `meet.jit.si` server only allows five-minute embedded calls and
  cannot restrict who joins a room; hosted Jitsi (JaaS) is free for only 25
  monthly users.
- LiveKit Cloud's free plan covers a project demo and user testing, and the
  server is open source, so it can be self-hosted later without code changes.
- Tokens are created on our server, so only chat members and invited students
  can join, and the room itself refuses a sixth participant.
- Adaptive streaming, dynacast and simulcast keep five-person calls light on
  students' devices and connections.

## Consequences

- The web server needs `LIVEKIT_URL`, `LIVEKIT_API_KEY` and
  `LIVEKIT_API_SECRET` (see `apps/web/.env.local.example`). Without them the
  call button reports that video calls are unavailable.
- A call is marked ended (with the service role) when someone opens it and its
  room has been empty for over a minute. LiveKit webhooks could end calls
  promptly instead, but they need a public URL.
- Screen sharing works in desktop browsers only, as with any WebRTC service.
