# NATS Event Contracts

## Subject naming

Use:

```text
ppe.violation.created
ppe.violation.updated
ppe.violation.resolved
ppe.worker.status
ppe.camera.status
ppe.configuration.changed
```

Keep subjects versionable if contracts evolve:

```text
ppe.v1.violation.created
```

## ViolationCreated event

```json
{
  "eventId": "uuid",
  "eventType": "ViolationCreated",
  "schemaVersion": 1,
  "occurredAt": "2026-09-26T18:30:12Z",
  "cameraId": "SWG-01",
  "trackId": 42,
  "violationId": "uuid",
  "violationType": "arc_flash_shield",
  "severity": "high",
  "confidence": 0.21,
  "snapshotKey": "violations/2026/09/26/uuid.jpg",
  "zoneId": "switchgear-zone-1",
  "model": {
    "family": "YOLO11",
    "variant": "s",
    "version": "configured"
  },
  "evidence": {
    "consecutiveObservations": 4,
    "windowMs": 1300
  }
}
```

## Idempotency

Every event has a unique `eventId`.

The backend must persist processed event IDs or use a deterministic idempotency key.

Suggested:

```text
cameraId + trackId + violationType + violationStartBucket
```

Do not create duplicate violation records if NATS redelivers an event.

## NATS JetStream

Use JetStream if durable delivery is required.

The consumer must:
- ack only after successful persistence
- retry transient failures
- move poison messages to a dead-letter subject/stream
- log correlation/event IDs

## Worker status

Publish:

```json
{
  "eventId": "uuid",
  "workerId": "ai-worker-01",
  "cameraId": "SWG-01",
  "status": "running",
  "inputFps": 25,
  "inferenceFps": 18,
  "latencyMs": 55,
  "model": "YOLO11s",
  "timestamp": "..."
}
```

## Do not publish raw frames

Frames stay in the video path.

Events stay in the event path.
