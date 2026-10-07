# Security and Observability

## Authentication

Backend must authenticate users.

Suggested roles:

```text
Admin
Supervisor
Reviewer
Viewer
```

## Authorization

Examples:

```text
Viewer:
  view dashboard/live/history

Reviewer:
  Viewer + accept/reject violations

Supervisor:
  Reviewer + camera/configuration

Admin:
  full access
```

## Camera credentials

Never send RTSP credentials to the frontend.

Store them securely in backend configuration/secrets.

## CORS

Allow only known local frontend origin during development:

```text
http://localhost:4200
```

Do not use `*` when credentials/authentication are enabled.

## Logging

Use structured JSON logs where practical.

Every log should include:
- timestamp
- service
- level
- correlation ID
- camera ID if applicable
- worker ID if applicable
- event ID if applicable

## Metrics

Backend:
- request count
- latency
- error count
- active SignalR connections
- NATS consumer lag/errors

AI:
- input FPS
- inference FPS
- inference latency
- dropped frames
- active tracks
- detections
- violations
- reconnects
- GPU utilization/memory if available

Streaming:
- camera online/offline
- reconnect count
- stream startup time

## Health endpoints

Every service needs:
- liveness
- readiness

Backend:

```text
/health
/health/live
/health/ready
```

AI:
- HTTP health server
- worker state
- model loaded
- camera state

MediaMTX:
- configured health/API mechanism

## Failure behavior

### PostgreSQL down

Backend:
- remains alive if possible
- readiness becomes unhealthy
- retries connections
- does not silently discard critical events

### NATS down

AI:
- buffer only a bounded amount if required
- reconnect
- never create unbounded memory growth

### Camera down

AI:
- mark camera offline
- reconnect
- do not crash the whole worker

### AI worker down

Backend:
- worker status becomes stale/offline
- dashboard shows degraded state

## Crash isolation

One camera failing must not crash the AI process handling all cameras.

Prefer a worker-per-camera or supervised camera-task design when isolation is important.
