# .NET Backend

## Technology

- ASP.NET Core
- .NET 10 or current project target
- EF Core
- PostgreSQL/Npgsql
- SignalR
- NATS client
- FluentValidation or equivalent
- OpenAPI/Swagger

## Suggested modular structure

```text
src/
  Ppe.Api/
    Controllers/
    Hubs/
    Middleware/
    Program.cs

  Ppe.Application/
    Violations/
    Cameras/
    Reviews/
    Dashboard/
    Contracts/

  Ppe.Domain/
    Entities/
    ValueObjects/
    Rules/

  Ppe.Infrastructure/
    Persistence/
    Nats/
    Storage/
    Caching/
```

This is a modular monolith inside the backend boundary, not a collection of tiny services.

If later scaling requires independent deployment, modules can be extracted.

## API endpoints

Suggested:

```text
GET    /api/cameras
POST   /api/cameras
GET    /api/cameras/{id}
PUT    /api/cameras/{id}
DELETE /api/cameras/{id}

GET    /api/violations
GET    /api/violations/{id}
POST   /api/violations/{id}/accept
POST   /api/violations/{id}/reject
POST   /api/violations/{id}/resolve

GET    /api/dashboard/summary
GET    /api/dashboard/trends

GET    /api/configuration
PUT    /api/configuration

GET    /api/health
GET    /api/health/ready
```

## Internal AI operations

Keep internal endpoints separate:

```text
POST /internal/ai/workers/heartbeat
POST /internal/ai/configuration/reload
```

Do not expose these publicly without authentication.

## SignalR

Hub:

```text
/hubs/violations
```

Events:

```text
ViolationCreated
ViolationUpdated
ViolationResolved
CameraStatusChanged
WorkerStatusChanged
```

Angular subscribes to SignalR.

## HITL workflow

A low-confidence violation can enter:

```text
PENDING_REVIEW
```

Angular displays:
- snapshot
- camera
- timestamp
- violation type
- confidence
- evidence
- track ID
- model version

Reviewer chooses:

```text
Accept
Reject
```

Persist:
- reviewer
- decision
- timestamp
- optional reason

## Business rule location

PPE compliance rules belong in the application/domain layer.

The AI worker should report evidence.

The backend should remain capable of applying business-level policy to the evidence.

However, do not duplicate the same rule in multiple places.

Choose one authoritative rule engine for final violation semantics.

## Validation

Validate all:
- camera IDs
- thresholds
- event contracts
- review transitions
- pagination
- dates

## Error handling

Return consistent error format.

Use correlation ID:

```text
X-Correlation-ID
```

Include it in:
- API response headers
- structured logs
- NATS event processing logs

## Database writes

Never write raw frame detections at frame rate.

Persist:
- confirmed violations
- review decisions
- audit events
- camera configuration
- worker/camera status snapshots when useful

Use indexes for:
- cameraId
- createdAt
- violationType
- status
- reviewedAt
