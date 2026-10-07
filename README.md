# PPE Detection Platform

The specification below is still the source of truth. The runnable implementation lives beside `engro PPE/` in `backend/`, `ai-worker/`, `mediamtx/`, `database/`, and `contracts/`.

## Run the stack (mock AI, no weights)

```powershell
Copy-Item .env.example .env
docker compose up -d --build
```

| Surface | URL |
| --- | --- |
| Frontend | http://localhost:4200 |
| Backend OpenAPI | http://localhost:5288/openapi/v1.json |
| Backend health | http://localhost:5288/health |
| AI worker health | http://localhost:8081/health |
| MediaMTX WHEP | http://127.0.0.1:8889/cam-live-01/whep |
| NATS monitor | http://localhost:8222 |

Register the first Super Admin at `/register`, then sign in. Mock mode publishes deterministic PPE events through NATS.

### Shocking boundary

Draw polygons at `/settings/zones`. **Outside:** helmet and goggles only. **Inside:** helmet, goggles, plus one Arc PPE violation if the flash shield is missing. **Boots are never a violation.**

### Production weights later

1. Put the checkpoint at `ai-worker/models/yolov11s/weights/best.pt` (or `yolov8s/.../best.pt`).
2. Set `AI_MODE=production` and `MODEL_NAME=yolov11s` (or `yolov8s`) in `.env`.
3. `docker compose up -d --build ai-worker`

---

# PPE Detection Platform — Cursor Build Specification

## Purpose

Recreate the PPE Detection & Safety Monitoring platform from a clean repository using a lean, production-oriented architecture that remains easy to run on localhost.

The system detects PPE compliance in electrical switchgear rooms using CCTV/RTSP streams. Required PPE can include:

- person
- helmet
- goggles
- arc suit
- arc flash shield
- arc gloves

The AI layer must support low candidate confidence thresholds and temporal confirmation so low-confidence detections do not immediately become violations.

## Model decision

Use **YOLO11s** as the default detection model.

Do not hard-code the model architecture throughout the codebase. Configure it through environment/configuration so a trained checkpoint can be replaced without changing application code.

Default:
- model family: YOLO11
- variant: s
- task: object detection
- inference image size: configurable, default 960
- tracking: ByteTrack
- device: configurable (`cuda`, `cpu`)
- candidate confidence: per-class configurable
- IoU: configurable

YOLO11s is selected because the current YOLO11 family is a mature production option and YOLO11s has materially more capacity than YOLO11n. Generic COCO metrics are not PPE-specific, so final model selection must be based on the project's validation and recorded-CCTV evaluation.

## Core architectural rule

Do NOT send video frames through the .NET backend.

Video path:

Camera -> MediaMTX -> AI Worker
Camera -> MediaMTX -> Angular via WebRTC

Event path:

AI Worker -> NATS -> .NET Backend -> PostgreSQL
                                  -> SignalR -> Angular

Snapshot/media path:

AI Worker -> object storage/local media directory
.NET -> stores metadata/reference only

## Services

1. `mediamtx`
   - RTSP ingest
   - RTSP distribution
   - WebRTC playback
   - health endpoint

2. `postgres`
   - relational persistence

3. `redis`
   - optional cache/state
   - do not make the application dependent on Redis unless needed

4. `nats`
   - event transport between AI and .NET
   - JetStream may be enabled for durable event handling

5. `ai-worker`
   - Python
   - Ultralytics YOLO11s
   - OpenCV
   - ByteTrack
   - PPE association
   - temporal filtering
   - violation generation
   - event publishing
   - snapshots

6. `backend`
   - ASP.NET Core
   - REST API
   - SignalR
   - NATS consumer
   - authentication/authorization
   - violation/HITL workflow
   - PostgreSQL

7. `frontend`
   - Angular
   - WebRTC player
   - live violation updates through SignalR
   - REST dashboard
   - HITL review page

## Non-goals

- Do not create a microservice for every table.
- Do not put YOLO inference inside .NET.
- Do not send every frame through NATS.
- Do not write every YOLO detection to PostgreSQL.
- Do not store video blobs in PostgreSQL.
- Do not make Angular communicate directly with PostgreSQL/NATS.
- Do not require manual startup of every service.

## Local development target

The developer should be able to run:

```bash
docker compose up -d
```

and then access the application through documented localhost URLs.

For rapid AI/frontend development, native processes are allowed, but infrastructure must still be available through Compose.

## Required implementation quality

- configuration through environment variables
- structured logging
- health endpoints
- graceful shutdown
- retry/backoff for infrastructure dependencies
- idempotent event processing
- correlation IDs
- typed event contracts
- migrations
- API validation
- no secrets committed
- Docker health checks
- clear README commands
