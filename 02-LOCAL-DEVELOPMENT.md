# Local Development

## Goal

One-command infrastructure startup and predictable service discovery.

## Recommended workflow

### Option A — full Docker stack

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f
```

### Option B — hybrid development

Run infrastructure in Docker:

```bash
docker compose up -d postgres redis nats mediamtx
```

Run locally:
- Python AI worker
- ASP.NET backend
- Angular frontend

This is preferred while actively developing model/business/frontend code because code reload is faster.

## Internal Docker hostnames

Containers must not use `localhost` to communicate with other containers.

Use:

```text
postgres:5432
redis:6379
nats:4222
mediamtx:8554
backend:8080
```

`localhost` is for the host/browser.

## Suggested localhost ports

```text
Angular       http://localhost:4200
Backend       http://localhost:5000
Swagger       http://localhost:5000/swagger
SignalR       http://localhost:5000/hubs/violations

MediaMTX RTSP  rtsp://localhost:8554/<stream>
MediaMTX WebRTC http://localhost:8889/<stream>
MediaMTX API/health according to configured MediaMTX version

PostgreSQL    localhost:5432
Redis         localhost:6379
NATS          localhost:4222
NATS monitor  localhost:8222
```

Do not assume a particular MediaMTX WebRTC URL format without checking the selected MediaMTX configuration/version.

## Compose requirements

Create:
- `docker-compose.yml`
- `.env.example`
- health checks
- named volumes
- explicit networks

Use one network:

```text
ppe-network
```

## Startup ordering

Compose `depends_on` must use health conditions where supported.

Expected order:

```text
Postgres / NATS / MediaMTX
          |
          v
      Backend / AI
          |
          v
       Frontend
```

Do not rely solely on startup ordering. Every application service must also implement retry/backoff.

## Windows compatibility

The project must work from Windows with Docker Desktop.

Do not require Linux-only shell commands for normal startup.

Provide:
- `scripts/start.ps1`
- `scripts/stop.ps1`
- `scripts/logs.ps1`
- `scripts/status.ps1`

Also provide equivalent `.sh` scripts where practical.

## Environment files

Never commit secrets.

Create:

```text
.env.example
```

with placeholders for:
- PostgreSQL credentials
- NATS credentials if enabled
- JWT signing key
- AI model path
- MediaMTX URL
- object storage configuration
- CORS origins

Use local development defaults only in `.env.example`.
