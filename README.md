# Real-time Football Match Center API

Production-ready NestJS backend for live football matches, chat rooms, real-time updates, and SSE streaming.

## Features

- REST API for live match data, match detail, and health checks
- Socket.IO real-time updates with room-based subscriptions
- Server-Sent Events (SSE) stream for match events
- Background match simulator (3–5 concurrent matches) with realistic event distribution
- Supabase Postgres persistence for match data, events, stats, and chat history
- Redis for pub/sub, chat presence, typing indicators, and rate limiting
- Centralized error handling, consistent response envelope, validation

## Architecture Overview

- **Matches Module**: REST APIs for match list and detail.
- **Stream Module**: SSE streaming with Redis pub/sub subscription per match.
- **Realtime Module**: Socket.IO gateway handling match subscriptions and chat rooms.
- **Simulator Module**: Background service that ticks every simulated minute, updates data, and publishes Redis events.
- **Supabase Integration**: Postgres persistence via `@supabase/supabase-js`.
- **Redis Integration**: Pub/sub + ephemeral state (presence, typing, rate limit).

## Setup

### Prerequisites

- Node.js 20+
- Supabase project with Postgres
- Redis instance

### Install

```bash
yarn install
```

### Configure

Copy `.env.example` to `.env` and fill in values:

```bash
cp .env.example .env
```

### Database schema

Run the SQL in `scripts/schema.sql` against your Supabase database.

### Run locally

```bash
yarn start:dev
```

### Docker

```bash
docker compose up --build
```

## API Response Format

All REST responses:

```json
{
  "success": true,
  "data": { "...": "..." },
  "error": null
}
```

Errors:

```json
{
  "success": false,
  "data": null,
  "error": { "code": "NOT_FOUND", "message": "...", "details": {} }
}
```

## REST Endpoints

### GET `/api/matches`

Returns live/upcoming matches (excludes `FULL_TIME`).

### GET `/api/matches/:id`

Returns match detail, recent events (last 20), and stats.

### GET `/api/matches/:id/events/stream`

SSE stream for match updates.

**Query params**:
- `since` (optional, ISO timestamp): Sends events since the given timestamp.

**Example**:

```bash
curl -N "http://localhost:3000/api/matches/<matchId>/events/stream?since=2024-01-01T00:00:00.000Z"
```

### GET `/health`

Health check.

## Socket.IO (namespace `/realtime`)

### Rooms

- Match room: `match:{matchId}`
- Chat room: `chat:{matchId}`

### Client → Server

- `match:subscribe` `{ matchId }`
- `match:unsubscribe` `{ matchId }`
- `chat:join` `{ matchId, userId, userName, tabId? }`
- `chat:leave` `{ matchId, userId, tabId? }`
- `chat:message` `{ matchId, userId, userName, message }`
- `chat:typing_start` `{ matchId, userId, userName }`
- `chat:typing_stop` `{ matchId, userId }`

### Server → Client

- `match:score` `{ matchId, homeScore, awayScore, minute, status }`
- `match:event` `{ matchId, event }`
- `match:stats` `{ matchId, stats }`
- `chat:message` `{ matchId, message }`
- `chat:user_joined` `{ matchId, userId, userName, userCount }`
- `chat:user_left` `{ matchId, userId, userName?, userCount }`
- `chat:typing` `{ matchId, userId, userName?, isTyping }`
- `error` `{ code, message, details? }`

## Chat Behavior

- Presence stored with Redis TTL per match/user/tab
- Unique user count computed from presence keys
- Typing indicators with TTL (5s) and server-side timers
- Rate limit: 5 messages / 10 seconds per user
- Messages validated for length (1–280) and whitespace-only

## Simulator

- Runs on module init
- 1 real second = 1 match minute (configurable)
- Simulates match lifecycle:
  - `NOT_STARTED` → `FIRST_HALF` → `HALF_TIME` → `SECOND_HALF` → `FULL_TIME`
- Updates match stats and emits realistic events
- Publishes to Redis channels:
  - `match:{matchId}:score`
  - `match:{matchId}:event`
  - `match:{matchId}:stats`

## Environment Variables

```
PORT=3000
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
REDIS_URL=
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
SIM_MATCH_COUNT=5
SIM_MINUTE_MS=1000
SOCKET_PING_INTERVAL=25000
SOCKET_PING_TIMEOUT=20000
```

## Trade-offs / Notes

- Presence uniqueness is derived by scanning presence keys; suitable for assessment scope but should be optimized for high scale.
- SSE replay uses a `since` timestamp for simplicity.
- Match simulator is intentionally lightweight and avoids complex ML logic.

## Deployment Steps

1. Configure Supabase schema and env variables.
2. Provide Redis URL (local or managed).
3. Build and run Docker image.
4. Ensure port `3000` is exposed and reachable.
