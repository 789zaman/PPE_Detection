# Cursor Implementation Order

This document is the primary execution order for Cursor.

## Rule

Do not rewrite everything in one giant change.

Implement in small verified stages.

After each stage:
- build
- run tests
- verify health
- verify logs
- commit/checkpoint

## Stage 1 — repository skeleton

Create:

```text
backend/
ai/
frontend/
infrastructure/
scripts/
docs/
```

Create this documentation set.

Do not implement business logic yet.

## Stage 2 — infrastructure

Implement:
- Docker Compose
- PostgreSQL
- Redis
- NATS
- MediaMTX
- named volumes
- health checks
- `.env.example`

Verify:

```bash
docker compose up -d
docker compose ps
```

## Stage 3 — backend foundation

Implement:
- ASP.NET Core project
- configuration
- PostgreSQL
- EF Core
- migrations
- health endpoints
- Swagger
- structured logging

Verify:

```text
GET /health/live
GET /health/ready
GET /swagger
```

## Stage 4 — NATS integration

Implement:
- typed event contracts
- NATS publisher
- NATS consumer
- idempotency
- retry
- logging

Create a test publisher that sends a fake violation.

Verify that backend stores it.

## Stage 5 — SignalR

Implement:

```text
/hubs/violations
```

Verify Angular/browser receives fake violation events.

## Stage 6 — AI worker skeleton

Implement:
- Python project
- config
- health server
- logging
- NATS publisher
- MediaMTX connection
- graceful shutdown

Do not add YOLO yet.

Verify stream connection.

## Stage 7 — YOLO11s

Add:
- model loading
- inference
- class configuration
- confidence thresholds
- frame dropping/latest-frame buffer

Verify annotated frames locally.

## Stage 8 — tracking

Add ByteTrack.

Verify:
- stable track IDs
- worker enters/leaves
- multiple workers
- occlusion behavior

## Stage 9 — PPE association

Implement:
- helmet association
- goggles association
- suit association
- shield association
- gloves association

Add unit tests using synthetic bounding boxes.

## Stage 10 — temporal compliance

Implement:
- candidate
- confirmed
- cleared
- hysteresis

Test noisy detections.

## Stage 11 — Arc PPE rule

Implement the authoritative Arc PPE rule:

```text
shield present -> no Arc violation

shield absent consistently -> one Arc violation
```

Keep suit/gloves from generating separate Arc violations.

## Stage 12 — snapshots

Implement:
- violation snapshot
- media storage abstraction
- local storage provider
- object storage provider interface

Do not put image bytes in PostgreSQL.

## Stage 13 — Angular

Implement:
- routing
- auth shell
- dashboard
- live page
- violation list
- HITL review
- camera configuration

## Stage 14 — WebRTC

Connect Angular directly to MediaMTX.

Verify:
- video starts
- reconnect works
- backend is not carrying video

## Stage 15 — full integration

Run:

```bash
docker compose up -d --build
```

Verify:

```text
Camera
 -> MediaMTX
 -> AI
 -> NATS
 -> Backend
 -> PostgreSQL
 -> SignalR
 -> Angular
```

## Stage 16 — failure testing

Test:
- restart PostgreSQL
- restart NATS
- restart MediaMTX
- disconnect camera
- kill AI worker
- restart backend
- refresh Angular

The system must recover without manual database cleanup.

## Stage 17 — real CCTV validation

Run a recorded validation session.

Measure:
- FPS
- latency
- false positives/hour
- missed violations
- per-class recall
- HITL rate

## Stage 18 — optimization

Only after correctness:
- tune inference size
- tune thresholds
- optimize frame sampling
- optimize GPU
- tune NATS
- tune database indexes

Do not optimize before measuring.

## Cursor completion criteria

The implementation is complete only when:

- one-command startup works
- health checks work
- AI reconnects to camera
- NATS events are idempotent
- violations persist
- SignalR updates live UI
- WebRTC works directly from MediaMTX
- HITL accept/reject works
- snapshots work
- logs contain correlation IDs
- no frame-by-frame database writes occur
- no camera failure crashes all cameras
- tests cover PPE association and temporal rules
