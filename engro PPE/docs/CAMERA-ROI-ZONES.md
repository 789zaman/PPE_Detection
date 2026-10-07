# Camera ROI zones (shock boundary)

Angular zone editor + live overlays for the **shock boundary** polygon(s) on cameras (1920×1080 pixels).

## Why all-PPE alarms were missing

BE / detector treat workers as **OUTSIDE** when the camera has **no stored shock-boundary polygon**.  
OUTSIDE → helmet/goggles only (or no all-PPE). Inside yellow/red → **all PPE** immediate alarms.

The FE must persist the drawn polygon into BE fields `yellowZone` / `redZone` (DB: `YellowZoneJson` / `RedZoneJson`).  
A PUT that only sends `shockingZones` is ignored by the API (unknown JSON props) and leaves those columns empty.

## Routes

| Path | Who | Purpose |
|------|-----|---------|
| `/settings/zones` | `ppe:manage` | Select camera · draw / save shock-boundary polygons |
| Dashboard live view | all | Overlay polygons + detection boxes |

## BE API

```http
GET  /api/v1/ppe/cameras/{cameraCode}/zones
PUT  /api/v1/ppe/cameras/{cameraCode}/zones
```

### PUT body (what FE sends)

```json
{
  "frameWidth": 1920,
  "frameHeight": 1080,
  "yellowZone": { "type": "polygon", "points": [[120, 800], [900, 820], [920, 1080], [100, 1080]] },
  "redZone": null,
  "yellowPolygon": [{ "x": 120, "y": 800 }, …],
  "redPolygon": null
}
```

| FE shocking zone | BE field | Role |
|------------------|----------|------|
| first drawable (`≥3` pts) | `yellowZone` (+ `yellowPolygon`) | **Primary shock boundary** |
| second drawable | `redZone` (+ `redPolygon`) | Optional second boundary |

Both yellow and red classify as **SHOCKING** (all-PPE). Empty → everyone **OUTSIDE**.

Detector YAML key `shock_boundary_polygon` is the same concept; when using the FE editor, persist via this PUT (not YAML alone).

## Alerts

| Zone | Timing | Severity | PPE classes |
|------|--------|----------|-------------|
| **SHOCKING** (in yellow/red) | Immediate | Critical | All classes |
| **OUTSIDE** | — | — | No all-PPE dashboard alarms |

BE fields: `ppeZone` → `SHOCKING` \| `OUTSIDE`.
