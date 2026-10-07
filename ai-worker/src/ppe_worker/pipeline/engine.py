from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field

from ppe_worker.pipeline.associate import associated_classes
from ppe_worker.pipeline.compliance import ARC_FLASH_SHIELD, GOGGLES, HELMET, is_boots
from ppe_worker.pipeline.events import violation_event
from ppe_worker.pipeline.normalize import Detection
from ppe_worker.pipeline.temporal import TemporalGate
from ppe_worker.pipeline.tracker import IoUTracker
from ppe_worker.pipeline.zones import classify_zone, feet_point

WATCHED = (HELMET, GOGGLES, ARC_FLASH_SHIELD)


@dataclass
class CameraRuntime:
    code: str
    stream_name: str
    rtsp_url: str
    enabled: bool = True
    frame_width: int = 1920
    frame_height: int = 1080
    polygons: list[list[tuple[float, float]]] = field(default_factory=list)


@dataclass
class Engine:
    association_threshold: float = 0.15
    min_consecutive: int = 3
    clear_consecutive: int = 5
    tracker: IoUTracker = field(default_factory=IoUTracker)
    gate: TemporalGate = field(init=False)
    open_ids: dict[tuple, str] = field(default_factory=dict)
    opened_at: dict[tuple, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.gate = TemporalGate(self.min_consecutive, self.clear_consecutive)

    def step(
        self,
        camera: CameraRuntime,
        detections: list[Detection],
        now_ms: int,
        model: dict,
    ) -> list[dict]:
        detections = [d for d in detections if not is_boots(d.class_name)]
        persons = [d for d in detections if d.class_name == "person"]
        ppe = [(d.class_name, d.box) for d in detections if d.class_name != "person"]
        tracks = self.tracker.update([d.box for d in persons])
        events: list[dict] = []
        for track in tracks:
            associated = associated_classes(track.box, ppe, self.association_threshold)
            zone = classify_zone(*feet_point(track.box), camera.polygons)
            from ppe_worker.pipeline.compliance import evaluate

            decisions = {item.violation_type: item for item in evaluate(zone, associated)}
            helmet_detected = HELMET in associated
            boxes = [_box(track.box, "person", 0.9)]
            for name, box in ppe:
                boxes.append(_box(box, name, 0.8))
            for violation_type in WATCHED:
                applicable = violation_type in decisions
                action = self.gate.update(
                    (camera.code, track.track_id, violation_type),
                    applicable,
                    now_ms,
                )
                if action is None:
                    continue
                key = (camera.code, track.track_id, violation_type)
                if action == "open":
                    violation_id = str(uuid.uuid4())
                    self.open_ids[key] = violation_id
                    opened = _iso(now_ms)
                    self.opened_at[key] = opened
                    decision = decisions[violation_type]
                    consecutive, window_ms = self.gate.evidence(key, now_ms)
                    events.append(
                        violation_event(
                            event_type="ViolationCreated",
                            camera_code=camera.code,
                            track_id=track.track_id,
                            violation_id=violation_id,
                            violation_type=decision.violation_type,
                            severity=decision.severity,
                            confidence=0.8,
                            zone=zone,
                            missing_ppe=decision.missing_ppe,
                            is_immediate=decision.is_immediate,
                            helmet_detected=helmet_detected,
                            boxes=boxes,
                            frame_width=camera.frame_width,
                            frame_height=camera.frame_height,
                            snapshot_key=None,
                            model=model,
                            consecutive=consecutive,
                            window_ms=window_ms,
                            opened_at=opened,
                        )
                    )
                elif action == "resolved" and key in self.open_ids:
                    opened = self.opened_at.get(key, _iso(now_ms))
                    events.append(
                        violation_event(
                            event_type="ViolationResolved",
                            camera_code=camera.code,
                            track_id=track.track_id,
                            violation_id=self.open_ids.pop(key),
                            violation_type=violation_type,
                            severity="low",
                            confidence=0.8,
                            zone=zone,
                            missing_ppe=violation_type,
                            is_immediate=False,
                            helmet_detected=helmet_detected,
                            boxes=boxes,
                            frame_width=camera.frame_width,
                            frame_height=camera.frame_height,
                            snapshot_key=None,
                            model=model,
                            consecutive=self.clear_consecutive,
                            window_ms=0,
                            opened_at=opened,
                        )
                    )
        return events


def _box(box: tuple[float, float, float, float], class_name: str, confidence: float) -> dict:
    x1, y1, x2, y2 = box
    return {
        "x": round(x1, 2),
        "y": round(y1, 2),
        "w": round(x2 - x1, 2),
        "h": round(y2 - y1, 2),
        "class": class_name,
        "confidence": confidence,
    }


def _iso(now_ms: int) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now_ms / 1000))
