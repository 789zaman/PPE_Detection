# Testing Plan

## Unit tests

### AI

Test:
- class lookup
- threshold filtering
- PPE association
- helmet/head geometry
- goggles/face geometry
- gloves/arm geometry
- temporal confirmation
- temporal clearing
- Arc shield rule
- duplicate event prevention

### Backend

Test:
- event deserialization
- idempotency
- violation creation
- review accept
- review reject
- invalid state transitions
- authorization
- pagination
- validation

## Integration tests

Test:

```text
NATS event
  -> backend
  -> PostgreSQL
```

Then:

```text
backend
  -> SignalR
  -> browser/client
```

## End-to-end test

Use a deterministic recorded test clip.

Expected:
- camera stream available
- AI detects test worker
- violation generated
- event published
- backend persists
- frontend receives event
- snapshot available
- reviewer accepts/rejects

## Performance test

Measure:
- AI inference latency
- total event latency
- database write latency
- SignalR delivery latency
- WebRTC startup latency

## Reliability test

Kill/restart each dependency independently.

Expected recovery:

```text
camera restart -> AI reconnects
AI restart -> backend continues
NATS restart -> publisher/consumer reconnects
Postgres restart -> backend retries
MediaMTX restart -> AI/browser reconnect
Angular restart -> reconnects to backend/video
```

## Acceptance test

A release candidate must pass:
- all unit tests
- integration tests
- end-to-end test
- recorded CCTV validation
- 12+ hour stability test
- no unbounded memory growth
- no duplicate violations caused by event redelivery
