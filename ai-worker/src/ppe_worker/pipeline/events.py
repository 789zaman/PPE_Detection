from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone

log = logging.getLogger("ppe.events")


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def violation_event(
    *,
    event_type: str,
    camera_code: str,
    track_id: int,
    violation_id: str,
    violation_type: str,
    severity: str,
    confidence: float,
    zone: str,
    missing_ppe: str,
    is_immediate: bool,
    helmet_detected: bool,
    boxes: list[dict],
    frame_width: int,
    frame_height: int,
    snapshot_key: str | None,
    model: dict,
    consecutive: int,
    window_ms: int,
    opened_at: str,
) -> dict:
    bucket = opened_at[:16]
    return {
        "eventId": str(uuid.uuid4()),
        "eventType": event_type,
        "schemaVersion": 1,
        "occurredAt": utc_now(),
        "cameraId": camera_code,
        "trackId": track_id,
        "violationId": violation_id,
        "violationType": violation_type,
        "severity": severity,
        "confidence": round(float(confidence), 4),
        "snapshotKey": snapshot_key,
        "zoneId": "shocking-boundary" if zone == "SHOCKING" else None,
        "ppeZone": zone,
        "workerCode": f"S-{track_id}",
        "workerName": f"Track {track_id}",
        "missingPpe": missing_ppe,
        "helmetDetected": helmet_detected,
        "isImmediate": is_immediate,
        "isViolation": event_type != "ViolationResolved",
        "frameWidth": frame_width,
        "frameHeight": frame_height,
        "boundingBoxes": boxes,
        "idempotencyKey": f"{camera_code}|{track_id}|{violation_type}|{bucket}",
        "model": model,
        "evidence": {"consecutiveObservations": consecutive, "windowMs": window_ms},
    }


def dumps(payload: dict) -> bytes:
    return json.dumps(payload, separators=(",", ":")).encode("utf-8")


def log_event(kind: str, payload: dict) -> None:
    log.info(
        kind,
        extra={
            "eventId": payload.get("eventId"),
            "cameraId": payload.get("cameraId"),
            "violationType": payload.get("violationType"),
        },
    )
