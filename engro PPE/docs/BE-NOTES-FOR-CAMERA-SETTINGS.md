# Backend notes — Camera Settings (Angular FE)

## Do we need BE changes?

**No required BE changes** for Settings → Cameras registration.

The Angular page already uses existing manage APIs from the handoff:

| Method | Path | Permission | Used for |
|--------|------|------------|----------|
| GET | `/api/v1/ppe/cameras/zones` | `ppe:view` | Zone dropdown |
| POST | `/api/v1/ppe/cameras/zones` | `ppe:manage` | Add zone |
| GET | `/api/v1/ppe/cameras` | `ppe:view` | Registered list |
| POST | `/api/v1/ppe/cameras` | `ppe:manage` | Register / upsert camera |
| GET | `/api/v1/ppe/cameras/status` | `ppe:view` | Live wall status |

Upsert camera body (already supported):

```json
{
  "id": null,
  "code": "CAM-07",
  "name": "Switchgear Room A Cam",
  "zoneId": "<guid>",
  "rtspUrl": "rtsp://user:pass@192.168.1.10/stream1",
  "streamUrl": "http://media.local/live/cam07.m3u8",
  "isPrimary": false,
  "isActive": true
}
```

First Super Admin is created via existing:

- `POST /api/v1/auth/register` (bootstrap, raw AuthResponse)
- Login: `POST /api/v1/auth/login` with **email + password**

Ensure CORS includes `http://localhost:4200` (`CORS_ALLOWED_ORIGINS`).

---

## Optional BE improvements (not blockers)

These would improve the FE later; none are required for the current Settings page.

### 1. Return stream fields on camera list (recommended)

`GET /api/v1/ppe/cameras` currently returns metadata **without** `rtspUrl` / `streamUrl`.

**Ask:** Include on `ListCamerasResponse` (or a manage-only DTO):

- `rtspUrl`
- `streamUrl`

So Settings can edit cameras without re-entering URLs blindly.

### 2. Ensure bootstrap admin gets `ppe:manage`

First register creates `Administrator` with manage permissions. Confirm login/`/me` returns:

- `roles`: includes `Administrator`
- `permissions` / `actions`: includes `ppe:manage`

FE gates **Settings** on `ppe:manage` or Administrator role.

### 3. Media / HLS path (infrastructure, not just API)

Storing `rtspUrl` alone does **not** make the browser show video.

Typical plant path:

1. Camera RTSP → media server / transcoder  
2. Publish browser-playable **HLS** (`*.m3u8`) or equivalent  
3. Persist that URL in `streamUrl`  
4. FE plays `streamUrl` on Dashboard / Live Cameras  

Without a media server, Settings only registers metadata; Live Cameras stays a status wall.

### 4. Optional: seed Super Admin account

If ops wants a fixed first admin, seed it in BE (not in Angular). Prefer env/secrets over committing passwords.

Login remains **email-based** on the API today.

---

## Detector vs FE (unchanged)

Do not expose these to the Angular dashboard operators:

- `POST /api/v1/ppe/detections`
- `POST /api/v1/ppe/cameras/{id}/heartbeat`

Detectors keep heartbeats / online status; FE only reads status and registers camera config.
