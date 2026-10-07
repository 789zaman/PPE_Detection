# Engro PPE Frontend Architecture

This document describes the Angular frontend only: how the app is structured, how a request moves through it, and how the live dashboard, camera wall, history, and settings screens are wired. The .NET API is treated as an external dependency.

## What this app is

Engro Fertilizer PPE Safety Monitor is a single-page Angular app for the Daharki plant. It shows a live primary camera, PPE violation alerts, KPI cards, trends, a camera wall, violation history, and (for managers) camera registration and shocking-zone drawing.

The UI does not run detection. It displays what the API and SignalR hub already decided: violations, bounding boxes, camera status, and zone polygons.

## Stack

| Piece | Role |
| --- | --- |
| Angular 19 | Standalone components, router, signals for auth state |
| Zone.js | Change detection (`eventCoalescing: true`) |
| RxJS | HTTP, hub events, subscriptions |
| `@microsoft/signalr` | Live hub at `/hubs/ppe-compliance` |
| Tailwind CSS v4 | Layout and theme (`src/styles.css`) |
| Chart.js | 14-day trend and compliance charts |
| lucide-angular | Icons |
| Browser WebRTC | WHEP playback of live camera video |

`src/main.ts` bootstraps `AppComponent` with `appConfig`. There is no NgModule tree.

## Runtime shape

```text
Browser
  └─ AppComponent
       ├─ splash (authenticated cold start)
       ├─ router-outlet
       │    ├─ /login, /register          guestGuard
       │    ├─ /                          authGuard   Dashboard
       │    ├─ /cameras                   authGuard   Camera wall
       │    ├─ /history                   authGuard   Violation history
       │    ├─ /settings/zones            manageGuard Zone editor
       │    └─ /settings/cameras          manageGuard Camera settings
       └─ toast stack

Shared singletons (providedIn: 'root')
  AuthService ── HttpClient + authInterceptor
  PpeApiService ── REST /api/v1/ppe
  PpeHubService ── SignalR
  ViolationAlarmService ── siren + PPE bypass
  ToastService
```

Development calls the API origin directly (`apiBaseUrl: http://localhost:5288`), so the browser sends cross-origin requests. The Angular dev server still has `proxy.conf.json` for `/api`, `/hubs`, `/snapshots`, and `/captures`, but those paths are unused while `apiBaseUrl` is absolute. Production `environment.ts` uses the same absolute API and media base.

## Folder map

```text
src/
  main.ts                          bootstrap
  styles.css                       Tailwind + theme tokens
  environments/
    environment.ts                 production defaults
    environment.development.ts     used by ng serve (file replacement)
  app/
    app.component.ts               shell: splash, outlet, toasts, hub start
    app.config.ts                  router + HttpClient + auth interceptor
    app.routes.ts                  route table
    pages/                         one screen per route
    components/                    presentational pieces used by pages
    core/
      auth/                        session, guards, interceptor
      api/                         REST client, mappers, boxes, zones, media URLs
      models/                      API envelopes and PPE DTOs
      signalr/                     hub client
      webrtc/                      WHEP player
    lib/safety-data.ts             violation types, session collapse, overlay rules
    services/                      alarm + toast
```

Pages own screen state. `core` owns talking to the backend and mapping payloads into UI types. Components render those types and do not call the API themselves, except `SiteHeaderComponent`, which loads notifications.

## Shell

`AppComponent` does four things:

1. Shows `SplashScreenComponent` only when a session already exists at startup.
2. Renders the active route.
3. Renders toasts from `ToastService`.
4. If `AuthService.isAuthenticated()` is true, calls `loadMe()` and `PpeHubService.start()`.

Auth pages force the splash off. A full page reload always returns to login, because `AuthService` clears `localStorage` keys `ppe.accessToken`, `ppe.refreshToken`, and `ppe.user` in its constructor and again whenever a session is saved or cleared. The in-memory signals are the session for the current tab only.

## Routing and access

Defined in `src/app/app.routes.ts`.

| Path | Guard | Screen |
| --- | --- | --- |
| `/login` | `guestGuard` | Sign in (email + password) |
| `/register` | `guestGuard` | First Super Admin bootstrap |
| `/` | `authGuard` | Live dashboard |
| `/cameras` | `authGuard` | Camera wall |
| `/history` | `authGuard` | Filterable violation history + Excel export |
| `/settings/zones` | `manageGuard` | Draw shocking-zone polygons |
| `/settings/cameras` | `manageGuard` | Register plant zones and cameras |
| `**` | — | Redirect to `/login` |

Guards:

- `authGuard` — access token present, otherwise `/login`.
- `guestGuard` — already signed in users go to `/`.
- `manageGuard` — authenticated and `canManageCameras` (`ppe:manage`, `administrator`, or Super Admin). Others go to `/`.

`SiteHeaderComponent` builds the same nav. Zones and Settings links appear only when `canManageCameras()` is true. Delete on the camera wall is limited to `isSuperAdmin()`.

## Authentication

`AuthService` holds three signals: access token, refresh token, and `AuthUser` (`id`, `fullName`, `email`, `roles`, `permissions`).

| Action | HTTP | Notes |
| --- | --- | --- |
| Login | `POST /api/v1/auth/login` | Envelope; token read from `data` |
| Register | `POST /api/v1/auth/register` | Raw body, not an envelope |
| Refresh | `POST /api/v1/auth/refresh` | On 401 |
| Me | `GET /api/v1/auth/me` | Fills roles and permissions |
| Hub token | `POST /api/v1/auth/hub-connection-token` | Short-lived token for SignalR |
| Logout | — | Clears signals, emits `sessionEnded$`, navigates to `/login` |

`authInterceptor` attaches `Authorization: Bearer` to requests whose URL starts with `apiBaseUrl`, except login, register, and refresh. A 401 starts one shared refresh. If refresh fails, the interceptor logs the user out. A successful refresh retries the original request once.

## REST client

`PpeApiService` prefixes every PPE call with `{apiBaseUrl}/api/v1/ppe`. Responses are `ApiEnvelope<T>` (`success`, `data`, `message`, `errors`, `meta`). `getData` / `getPaged` unwrap `data` and throw on `success: false`. `src/app/core/api/mappers.ts` turns API records into `LogRow`, `UiKpi`, `TrendRow`, cameras, and notifications.

### Dashboard

| Method | Endpoint |
| --- | --- |
| `getKpis` | `GET /dashboard/kpis` |
| `getLive` | `GET /dashboard/live` |
| `getAlerts` | `GET /dashboard/alerts` |
| `getStatistics` | `GET /dashboard/statistics` |
| `getTrends` | `GET /dashboard/trends?days=14` |
| `getDashboardBundle` | `forkJoin` of the five calls above |

`getDashboardBundle` is what the dashboard loads first. Each call fails independently and falls back to an empty slice so one missing endpoint does not blank the page.

### Cameras and zones

| Method | Endpoint |
| --- | --- |
| `getCameras` / `getCameraRecords` | `GET /cameras` |
| `getCameraStatus` | `GET /cameras/status` |
| `upsertCamera` | `POST /cameras` |
| `deleteCamera` | `DELETE /cameras/{id}` |
| `setPrimaryCamera` | `POST /cameras/{id}/primary` |
| `getZones` / `upsertZone` | `GET` / `POST /cameras/zones` |
| `getCameraRoiZones` | `GET /cameras/{code}/zones` |
| `saveCameraRoiZones` | `PUT /cameras/{code}/zones` |
| `getCameraStream` | `GET /cameras/{idOrCode}/stream` |

Plant zones (Urea bay, switchgear, and so on) are not the same thing as ROI shocking zones. Plant zones are named areas a camera belongs to. ROI zones are polygons on the camera frame.

The zone editor draws zero or more shocking polygons. On save, the first polygon is sent as `yellowZone` / `yellowPolygon` and the second as `redZone` / `redPolygon`, because that is what the API persists. A successful read is cached in `localStorage`. If the GET fails, the editor falls back to that cache. A successful GET is the source of truth and replaces the cache, so a deleted polygon is not put back from storage.

### Violations, captures, notifications

| Method | Endpoint |
| --- | --- |
| `getViolations` | `GET /violations` |
| `getLatestViolations` | `GET /violations/latest` |
| `getViolation` | `GET /violations/{id}` |
| `exportViolations` | `GET /violations/export` (xlsx blob) |
| `getCapturesForDetection` / `getLatestCaptureUrl` | `GET /captures` |
| `uploadCameraCapture` | `POST /captures` (multipart) |
| `getNotifications` | `GET /notifications` |
| `getUnreadCount` | `GET /notifications/unread-count` |
| `markNotificationRead` | `POST /notifications/{id}/read` |
| `acknowledgeNotification` | `POST /notifications/{id}/acknowledge` |
| `resolveNotification` | `POST /notifications/{id}/resolve` |
| `markAllNotificationsRead` | `POST /notifications/read-all` |

Relative snapshot paths are resolved by `media-url.ts` against `mediaBaseUrl`, then `apiBaseUrl`.

## Live updates

`PpeHubService` asks `AuthService` for a hub token, then connects to:

```text
{apiBaseUrl}/hubs/ppe-compliance?access_token={hubToken}
```

Automatic reconnect is enabled. Events are mapped and re-published as RxJS streams:

| Hub event | Stream | Payload used by the UI |
| --- | --- | --- |
| `ViolationReceived` | `violationReceived$` | `LogRow` |
| `CameraStatusUpdated` | `cameraStatusUpdated$` | `CameraInfo` |
| `NotificationReceived` | `notificationReceived$` | `ApiNotification` |
| `PrimaryCameraSwitched` | `primaryCameraSwitched$` | `{ cameraId, cameraCode }` |

The dashboard, camera wall, header notifications, and alarm service all subscribe to these streams. They do not open their own hub connections.

## Live video

`CameraStreamComponent` is the primary-camera player on the dashboard. `ZoneEditorComponent` uses the same URL rules for the frame it draws on.

`stream-url.ts` and `whep-player.ts` decide how to play:

1. A WHEP URL (`protocol: webrtc`, or `defaultWhepUrl` when the API omits one) uses a recvonly `RTCPeerConnection` and an SDP POST. No HLS.
2. An HTTP video URL (`.mp4`, `.webm`) uses a normal `<video>` element, looping.
3. A bare RTSP URL is not playable in the browser. The empty state says so.

Inference coordinates are 1920×1080 unless the camera payload sends `frameWidth` / `frameHeight`. `bounding-boxes.ts` scales boxes into the visible video rectangle (`object-contain`), not the full element box.

## Dashboard data flow

```text
ngOnInit
  ├─ getDashboardBundle()
  │    ├─ KPI cards (stat-card)
  │    ├─ trend + compliance charts
  │    ├─ violation log table
  │    ├─ primary camera view model
  │    └─ alert feed (collapsed open sessions)
  ├─ getCameraRoiZones(primary code)
  ├─ hub.start()
  └─ overlay timer every 500ms

ViolationReceived
  ├─ merge into logs (cap 60)
  ├─ collapse duplicate open sessions for the alert panel
  ├─ bump KPI cards once per worker + PPE type session
  ├─ rebuild person boxes if the row is fresh (< 2.5s) and the worker has not left
  └─ ViolationAlarmService may play alarm.mp3 once per person + PPE type

PrimaryCameraSwitched
  └─ getLive() then reload ROI zones and overlays
```

`lib/safety-data.ts` owns the rules the screens share:

- PPE types shown as cards and filters: Helmet, Gloves, Safety Glasses, Arc Flash Suit, Arc Flash Shield, Boots. A person box is an overlay, not a violation type.
- Open sessions for the same worker and type are collapsed so repeated detector pulses do not spam the alert list.
- Overlays expire after 2.5 seconds without a new ingest, or when the worker is marked as having left.

PPE Bypass (`ViolationAlarmService`, key `ppe.detectionBypass`) hides alerts, bounding boxes, and the siren. It does not stop the hub. Mute (`ppe.alarmMuted`) only silences audio. Both flags survive reload; the JWT session does not.

The classes legend card that used to sit on top of the primary camera has been removed. Boxes and zone polygons are still drawn by `DetectionOverlayComponent` and `ZoneOverlayComponent`.

## Screens

### Dashboard (`/`)

`DashboardComponent` composes:

- `SiteHeaderComponent` — nav, compliance percent, bypass, mute, notifications, logout
- `CameraStreamComponent` — primary live view, zones, boxes
- `AlertFeedComponent` — live PPE alarms
- `StatCardComponent` — one card per PPE type
- `TrendChartComponent` and `ComplianceChartComponent` — 14-day series
- `LogTableComponent` — recent rows

### Live cameras (`/cameras`)

Loads the camera list and status, then patches tiles from `cameraStatusUpdated$`. A tile can be set as primary. Super Admin can delete a camera. Tiles are status cards (`CameraTileComponent`); they do not play video.

### Violation history (`/history`)

Filters by date, PPE type, and search. Pages through `GET /violations`. Each row can show a snapshot through `ViolationSnapshotComponent`. Export downloads the xlsx blob.

### Zones (`/settings/zones`)

Manager-only drawing surface. Picks a camera, plays its WHEP or HTTP frame (or a capture still), and edits shocking polygons in frame pixels. Save calls `saveCameraRoiZones`.

### Settings (`/settings/cameras`)

Manager-only forms to upsert a plant zone and a camera (`code`, `name`, `zoneId`, `rtspUrl`, `streamUrl`, primary, active).

### Login and register

Guest forms. Register is the first Super Admin bootstrap and expects a raw auth body. Neither page uses the site header.

## UI components

| Component | Used by | Job |
| --- | --- | --- |
| `site-header` | Authenticated pages | Nav, compliance, bypass, alarm, notifications |
| `splash-screen` | App shell | Short intro when a session exists at startup |
| `camera-stream` | Dashboard | Video + zone overlay + detection overlay |
| `camera-tile` | Camera wall | Online/offline tile, set primary, delete |
| `detection-overlay` | Camera stream, empty state | Scaled bounding boxes |
| `zone-overlay` | Camera stream | Shocking-zone polygons |
| `alert-feed` | Dashboard | Live alarm list |
| `stat-card` | Dashboard | One PPE KPI |
| `trend-chart` | Dashboard | Violations over 14 days |
| `compliance-chart` | Dashboard | Compliance over 14 days |
| `log-table` | Dashboard | Recent detection rows |
| `violation-snapshot` | History | Capture image for a row |

## Configuration

`environment.development.ts` (what `ng serve` uses):

| Field | Current value | Meaning |
| --- | --- | --- |
| `apiBaseUrl` | `http://localhost:5288` | REST and SignalR origin. Empty would mean same-origin via the dev proxy. |
| `mediaBaseUrl` | `http://localhost:5288` | Prefix for relative snapshot paths |
| `inferenceFrameWidth` / `Height` | 1920 / 1080 | Fallback when the API omits frame size |
| `defaultVideoUrl` | empty | No baked-in MP4 |
| `defaultWhepUrl` | `http://127.0.0.1:8889/cam-live-01/whep` | Used when live payload has no `whepUrl` |

`ng serve` serves `http://localhost:4200`. The API must allow that origin. In Development the API allows any loopback origin with credentials.

## How to run

```bash
npm install
npm start
```

`npm start` is `ng serve --proxy-config proxy.conf.json`. With the current development environment, API calls go straight to `http://localhost:5288` and depend on CORS. The proxy file remains for a same-origin setup if `apiBaseUrl` is set back to an empty string.
