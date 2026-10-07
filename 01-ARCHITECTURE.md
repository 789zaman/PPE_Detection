# Architecture

## System overview

```text
                         +----------------+
                         | CCTV / RTSP    |
                         +-------+--------+
                                 |
                                 v
                         +---------------+
                         |   MediaMTX    |
                         | RTSP + WebRTC |
                         +---+-------+---+
                             |       |
                         RTSP|       |WebRTC
                             |       |
                             v       v
                      +----------+  Angular
                      | AI Worker|  Live View
                      +----+-----+
                           |
                         NATS
                           |
                           v
                    +--------------+
                    | ASP.NET Core |
                    | API/Events   |
                    +------+-------+
                           |
                    +------+------+
                    |             |
                    v             v
                PostgreSQL      Redis
                    |
                    v
              Media references
```

## Service boundaries

### MediaMTX

Owns stream transport only.

Responsibilities:
- receive RTSP
- expose RTSP to AI
- expose WebRTC/HLS-compatible playback to frontend
- stream health

It must not contain PPE business logic.

### AI Worker

Owns computer vision.

Responsibilities:
- connect to RTSP
- decode frames
- resize/preprocess
- YOLO inference
- tracking
- PPE-to-person association
- temporal stability
- zone checks
- PPE compliance rules
- snapshot creation
- event publication

It must not own user authentication, dashboards, or business persistence.

### Backend

Owns application/business state.

Responsibilities:
- users and roles
- cameras
- zones/configuration
- violation records
- HITL review
- audit trail
- reporting APIs
- SignalR
- NATS event consumption

### Angular

Owns presentation only.

Responsibilities:
- live stream
- dashboards
- violations
- review queue
- configuration UI
- historical reporting

## Communication rules

### AI -> Backend

Preferred:
- NATS event for asynchronous detection/violation events.

Optional:
- internal HTTP endpoint for operational commands or synchronous configuration.

### Backend -> AI

Use an explicit command channel/API for:
- reload camera
- reload thresholds
- start/stop worker
- health/status

Do not use database polling for real-time control.

### Angular -> Backend

- REST for queries/commands
- SignalR for real-time events

### Angular -> MediaMTX

Direct WebRTC playback.

The backend should not proxy video.

## Event frequency

AI may process many frames per second.

Only publish:
- confirmed violation
- violation state change
- optionally selected detection summaries
- worker health/metrics

Do not publish every raw detection.

## Violation lifecycle

```text
CANDIDATE
   |
   v
TEMPORALLY_STABLE
   |
   v
OPEN
   |
   +----> ACCEPTED
   |
   +----> REJECTED
   |
   v
RESOLVED
```

For low-confidence candidates, the system should require temporal evidence before creating a violation.

## Arc PPE rule

For the current business rule:

```text
If arc_flash_shield is present:
    no Arc PPE violation
    arc suit/gloves do not create separate Arc violations

If arc_flash_shield is absent consistently:
    create one Arc PPE violation
    violation item = arc_flash_shield
```

Helmet and goggles remain independent rules unless configuration says otherwise.

Do not hard-code this rule into YOLO inference. Keep it in the compliance/rules layer.

## Shocking boundary (floor ROI)

A drawable polygon on the camera frame (frontend `/settings/zones`, stored as `yellowZone` / `redZone`) classifies each person track:

- **OUTSIDE** (or no polygon): helmet and goggles only.
- **SHOCKING** (feet inside the polygon): helmet, goggles, and the Arc PPE rule above. Arc suit / arc gloves do not create separate violations.
- **Boots:** never a violation, inside or outside.
