# Quickstart

## Prerequisites

Install:
- Docker Desktop
- Git
- NVIDIA Container Toolkit only if GPU containers are required

For native AI development:
- Python
- NVIDIA CUDA-compatible PyTorch environment if using GPU

## Clone/configure

```bash
git clone <repository>
cd <repository>
copy .env.example .env
```

On PowerShell, use:

```powershell
Copy-Item .env.example .env
```

## Start infrastructure

```bash
docker compose up -d postgres redis nats mediamtx
```

Verify:

```bash
docker compose ps
```

## Start complete stack

```bash
docker compose up -d --build
```

## Logs

```bash
docker compose logs -f backend
docker compose logs -f ai-worker
docker compose logs -f mediamtx
```

## Stop

```bash
docker compose down
```

To remove local data too:

```bash
docker compose down -v
```

Do this only when you intentionally want to delete local database/volume data.

## Verify backend

Open:

```text
http://localhost:5288/openapi/v1.json
```

Health:

```text
http://localhost:5000/health
```

## Verify frontend

Open:

```text
http://localhost:4200
```

## Verify stream

Configure a camera path in MediaMTX and open the documented WebRTC browser endpoint.

Open http://localhost:8081/health and confirm `aiMode` is `mock`, `modelLoaded` is true, and `natsConnected` is true. Mock detections do not need a live RTSP camera.

## Production AI

Place weights at:

```text
ai-worker/models/yolov11s/weights/best.pt
```

or:

```text
ai-worker/models/yolov8s/weights/best.pt
```

Then:

```text
AI_MODE=production
MODEL_NAME=yolov11s
```

and restart `ai-worker`. Install extra Python deps from `ai-worker/requirements-ml.txt` only when you actually run production inference.

## Shocking boundary

Frontend `/settings/zones` persists `yellowZone` / `redZone`. Empty polygons → everyone OUTSIDE (helmet + goggles only). Inside → all configured PPE except boots (boots are exempt).

## Verify end-to-end

Expected:

```text
Camera
  -> MediaMTX
  -> AI Worker
  -> NATS
  -> Backend
  -> PostgreSQL
  -> SignalR
  -> Angular
```

A confirmed violation should appear in the dashboard without the frontend receiving video through the backend.
