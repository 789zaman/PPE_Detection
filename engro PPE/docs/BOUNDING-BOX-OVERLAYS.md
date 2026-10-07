# Bounding box overlays (live camera)

## Behavior

On the dashboard live preview, the FE draws **only** model boxes from the API:

1. Parse `boundingBoxes` (JSON string **or** array) → pixel `{ x, y, w, h }` in the inference frame.
   - Supports bridge `xywh`, Ultralytics-style `x1/y1/x2/y2`, and normalized `0–1` (denormalized with frame size).
   - Per-box `class` / `label` / `name` / `cls` mapped to: `person`, `helmet`, `gloves`, `safety_glasses`, `arc_flash_suit`, `vest`, `boots` (aliases like `Hardhat`, `NO-Hardhat`, `safety_vest` included).
   - **Unlabeled boxes default to `person`** (bridge sample omits class on the person box). Do **not** paint them as the violation type.
2. Overlay rectangles on the **WebRTC** `<video>` using the rendered content box (`object-contain` letterboxing).
3. Scale:
   - `scaleX = displayedVideoWidth / frameWidth`
   - `scaleY = displayedVideoHeight / frameHeight`
   - Prefer detection `frameWidth` / `frameHeight` → camera `frameWidth` / `frameHeight` → env `1920×1080`.
4. Colors are **per detection class** (not only severity):
   - **Person** — yellow `#eab308`
   - **Helmet** — red `#dc2626`
   - **Gloves** — blue `#2563eb`
   - **Safety Glasses** — purple `#a855f7`
   - **Arc Flash Suit** — orange `#f97316`
   - **Vest** — teal `#0d9488`
   - **Boots** — violet `#7c3aed`
5. Labels prefer per-box `class`/`label` + confidence (e.g. `Helmet 98%`).
6. Multiple boxes / multiple recent detections for the primary camera are supported.
7. Stale boxes clear after **~2.5s** without a fresh detection (shown immediately on arrival — no overlay delay).
8. If `boundingBoxes` is null/empty → **no boxes drawn** (never invented on FE).
9. Scale uses detection `frameWidth`/`frameHeight` when present (never force 1920×1080 over the payload).

## Live video

Live view uses **WHEP / WebRTC only** (no HLS / `hls.js`).

Resolve URL from (first match):

1. `primaryCamera.whepUrl`
2. `primaryCamera.stream.whepUrl`
3. `primaryCamera.streamUrl` **only if** it is a WHEP URL (`.../whep`)
4. `environment.defaultWhepUrl` (dev fallback)

HLS (`.m3u8`) values are ignored.

Typical MediaMTX WHEP:

```text
http://127.0.0.1:8889/cam-live-01/whep
```

## Data path

List/live/SignalR payloads may omit `boundingBoxes`. The FE hydrates via:

`GET /api/v1/ppe/violations/{id}` → `boundingBoxes` (+ `frameWidth` / `frameHeight` when present).

When SignalR `ViolationReceived` fires, FE upserts the alert and fetches detail if boxes are missing.

## Alignment tips

For boxes to sit on people when standing still:

- YOLO and MediaMTX WebRTC must use the **same camera stream / FOV**
- Ingest must send `frameWidth` / `frameHeight` matching the YOLO frame
- Residual motion lag (WebRTC behind SignalR) is a transport timing gap, not FE coordinate math
- WHEP player sets `playoutDelayHint` / `jitterBufferTarget` to 0 when the browser supports it
