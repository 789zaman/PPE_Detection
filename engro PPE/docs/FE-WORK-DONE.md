# Engro PPE Angular — Work Done

Frontend integration against the PPE .NET API (`http://localhost:5288`), based on `docs/18-ANGULAR-FE-HANDOFF.md` from the BE repo.

## Stack

- Angular 19 (standalone components)
- Tailwind CSS v4
- `HttpClient` + JWT auth interceptor
- `@microsoft/signalr` for live updates
- Chart.js for trends / compliance charts

## Environment

```ts
// src/environments/environment*.ts
apiBaseUrl: 'http://localhost:5288'
```

CORS origin expected on BE: `http://localhost:4200`.

## Auth

| Feature | Detail |
|--------|--------|
| Login | `POST /api/v1/auth/login` (envelope → `data.token` / `refreshToken`) |
| Register Super Admin | `POST /api/v1/auth/register` (raw body, first admin only) |
| Refresh | `POST /api/v1/auth/refresh` on 401 |
| Me | `GET /api/v1/auth/me` |
| Hub token | `POST /api/v1/auth/hub-connection-token` |
| Guards | `authGuard`, `guestGuard`, `manageGuard` (`ppe:manage` / Administrator) |
| Storage | `localStorage`: `ppe.accessToken`, `ppe.refreshToken`, `ppe.user` |

**Login page:** link text is **Register** → `/register` (Super Admin bootstrap).

**Important:** Login uses **email + password** (not a separate username field). Create the Super Admin via **Register** (e.g. email for the Epsilon account). Do **not** hardcode credentials in the frontend; menu visibility is permission-based.

## Routes / screens

| Route | Audience | Purpose |
|-------|----------|---------|
| `/login` | Guest | Sign in |
| `/register` | Guest | First Super Admin |
| `/` | Authenticated | Live dashboard |
| `/cameras` | Authenticated | Live Cameras monitor wall |
| `/history` | Authenticated | Violation history + Excel export |
| `/settings/cameras` | **Super Admin / `ppe:manage` only** | Register zones + cameras |

Nav item **Settings** appears only when `canManageCameras` is true.

## API wiring

### Dashboard

- `GET /api/v1/ppe/dashboard/kpis`
- `GET /api/v1/ppe/dashboard/live` (primary camera + `latestAlerts` + `kpiSummary`)
- `GET /api/v1/ppe/dashboard/alerts`
- `GET /api/v1/ppe/dashboard/statistics`
- `GET /api/v1/ppe/dashboard/trends?days=14`

### Cameras (monitor)

- `GET /api/v1/ppe/cameras`
- `GET /api/v1/ppe/cameras/status`
- `POST /api/v1/ppe/cameras/{id}/primary`

### Settings → Cameras (manage)

- `GET /api/v1/ppe/cameras/zones`
- `POST /api/v1/ppe/cameras/zones` (upsert zone)
- `POST /api/v1/ppe/cameras` (upsert camera: `code`, `name`, `zoneId`, `rtspUrl`, `streamUrl`, `isPrimary`, `isActive`)

### Violations

- `GET /api/v1/ppe/violations` (filters + paging; items in `data`, paging in `meta`)
- `GET /api/v1/ppe/violations/export` (`.xlsx` blob)

### Notifications

- `GET /api/v1/ppe/notifications`
- `GET /api/v1/ppe/notifications/unread-count` → `data.count`
- `POST …/read`, `…/read-all` (+ acknowledge/resolve available in API service)

## SignalR

Hub: `{apiBaseUrl}/hubs/ppe-compliance?access_token={hubToken}`

Events: `ViolationReceived`, `CameraStatusUpdated`, `NotificationReceived`, `PrimaryCameraSwitched`.

Pattern: REST for initial load → SignalR for live push.

## Camera architecture (current)

| Layer | Behavior |
|-------|----------|
| **Settings → Cameras** | Admin registers metadata (`rtspUrl` + optional WHEP `streamUrl`) |
| **Live Cameras** | Monitor wall of registered cameras (status from API / SignalR) |
| **Dashboard primary** | Uses `primaryCamera` from live API; title updates via SignalR |
| **Real video** | Dashboard live view uses **WHEP/WebRTC** (`whepUrl` or WHEP `streamUrl`). HLS is not used. |

Not called from FE (detector-only): `POST /detections`, `POST /cameras/{id}/heartbeat`.

## Key source folders

```
src/environments/
src/app/core/auth/
src/app/core/api/
src/app/core/signalr/
src/app/pages/login|register|dashboard|cameras|history|settings-cameras/
src/app/components/
```

## Run locally

```bash
npm install
npm start
```

Open http://localhost:4200 — ensure BE is on http://localhost:5288.

## Known limitations / next FE work

1. Dashboard live view plays WHEP (`camera-stream` + `whep-player`); camera wall tiles remain status UI.
2. Edit existing camera (list endpoint does not currently return `rtspUrl`/`streamUrl`).
3. Optional fallback polling if SignalR disconnects.
