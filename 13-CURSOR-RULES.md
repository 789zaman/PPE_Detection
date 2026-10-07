# Cursor Rules

Use these rules while implementing the project.

## Architecture rules

1. Do not create unnecessary microservices.
2. Keep AI inference in Python.
3. Keep application/business logic in .NET.
4. Keep streaming in MediaMTX.
5. Keep presentation in Angular.
6. Use NATS only for events/control where appropriate.
7. Never route video through .NET.
8. Never expose PostgreSQL/NATS directly to Angular.
9. Never store video blobs in PostgreSQL.
10. Do not write every detection to PostgreSQL.

## Code quality

- Prefer small modules.
- Use dependency injection.
- Use typed configuration.
- Avoid global mutable state.
- Use cancellation tokens.
- Handle graceful shutdown.
- Validate external input.
- Use structured logs.
- Add tests for business-critical logic.

## AI rules

- Never hard-code class IDs.
- Never hard-code thresholds.
- Never treat a low-confidence detection as an immediate violation.
- Use tracking.
- Use temporal confirmation.
- Drop stale frames rather than accumulating latency.
- Make model path configurable.
- Make inference size configurable.
- Make camera configuration reloadable.

## Backend rules

- Use migrations.
- Use transactions where multiple related records must change atomically.
- Make NATS event consumption idempotent.
- Use server-side pagination.
- Do not return sensitive camera credentials.
- Use authorization for HITL actions.

## Frontend rules

- Do not call infrastructure services directly except the browser-safe MediaMTX stream.
- Use typed API models.
- Unsubscribe from SignalR/observables correctly.
- Do not store secrets.
- Use lazy-loaded feature areas where appropriate.

## Development rules

After every meaningful implementation:
1. build
2. run tests
3. run health checks
4. inspect logs
5. fix errors before continuing

Do not replace working code with a new framework merely for style.

Do not change the PPE business rule unless explicitly requested.

## Arc PPE rules

arc_flash_shield present
    => Arc PPE compliant
    => no Arc PPE violation

arc_flash_shield absent
    + required arc-rated PPE present
    => Arc PPE compliant
    => no Arc PPE violation

arc_flash_shield absent
    + required arc-rated PPE absent
    + absence confirmed after temporal confirmation
    => create ONE Arc PPE violation

arc_suit / arc_gloves
    => count as supporting arc-rated PPE
    => do not create separate Arc PPE violations

multiple missing Arc PPE items
    => create ONE Arc PPE violation for the Arc PPE requirement


Helmet and goggles remain separate PPE checks.

## Model rule

Default to:

```text
YOLO8s
```

but preserve an abstraction/configuration that allows:
- YOLO11s
- YOLOv8s
- future model checkpoints

without changing business logic.
