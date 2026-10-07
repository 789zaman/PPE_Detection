# Docker Compose Specification

## Required services

```yaml
services:
  postgres:
  redis:
  nats:
  mediamtx:
  backend:
  ai-worker:
  frontend:
```

## Requirements

### postgres

- official PostgreSQL image
- persistent named volume
- healthcheck using `pg_isready`

### redis

- persistent volume optional for local development
- healthcheck using Redis ping

### nats

- expose client port
- expose monitoring port for local development
- JetStream enabled if durable events are used

### mediamtx

- mount configuration
- expose RTSP
- expose WebRTC HTTP endpoint
- expose required API/health endpoint

### backend

- depends on postgres/nats
- environment variables for connection strings
- health endpoint
- restart policy

### ai-worker

- depends on MediaMTX/NATS
- mount model directory
- optional NVIDIA GPU reservation
- health endpoint
- restart policy

### frontend

- development profile may run Angular dev server
- production profile can build static files served by nginx

## GPU

The AI worker must support two modes:

### CPU

Default for environments without NVIDIA GPU.

### NVIDIA

Optional Compose profile.

Do not make the whole project fail to start because GPU is unavailable.

## Volumes

Use:

```text
postgres_data
redis_data
nats_data
mediamtx_data
ppe_media
```

## Networks

Use:

```text
ppe-network
```

## Profiles

Recommended:

```text
default
gpu
production
```

Example:

```bash
docker compose --profile gpu up -d
```

Only enable GPU-specific settings when requested.

## Environment

All secrets/configuration must be supplied through `.env`.

Commit only:

```text
.env.example
```

## Development image strategy

AI:
- separate Dockerfile
- cache Python dependencies

Backend:
- multi-stage .NET build

Frontend:
- Node build
- nginx production image

Do not use development-only hot reload commands in production images.
