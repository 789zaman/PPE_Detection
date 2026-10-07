from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(ROOT))

from ppe_worker.models.mock_provider import MockModelProvider
from ppe_worker.pipeline.associate import associated_classes, iou
from ppe_worker.pipeline.compliance import evaluate, is_boots
from ppe_worker.pipeline.engine import CameraRuntime, Engine
from ppe_worker.pipeline.normalize import Detection, filter_detections, resolve_class_name
from ppe_worker.pipeline.temporal import TemporalGate
from ppe_worker.pipeline.zones import classify_zone, point_in_polygon


def test_class_lookup_ignores_numeric_ids_without_table():
    names = ["person", "goggles", "helmet"]
    assert resolve_class_name(2, names) == "helmet"
    assert resolve_class_name("arc_shield", names, {"arc_shield": "arc_flash_shield"}) == "arc_flash_shield"


def test_threshold_filter():
    detections = [Detection("helmet", 0.1, (0, 0, 1, 1)), Detection("helmet", 0.4, (0, 0, 1, 1))]
    kept = filter_detections(detections, {"helmet": 0.2}, 0.25)
    assert len(kept) == 1


def test_association_uses_overlap_not_center_only():
    person = (0, 0, 100, 200)
    helmet = ("helmet", (20, 0, 80, 40))
    far = ("goggles", (400, 400, 410, 410))
    found = associated_classes(person, [helmet, far], 0.15)
    assert "helmet" in found
    assert "goggles" not in found
    assert iou(person, helmet[1]) > 0


def test_temporal_open_and_clear():
    gate = TemporalGate(min_consecutive=3, clear_consecutive=5)
    key = ("cam", 1, "helmet")
    assert gate.update(key, True, 1) is None
    assert gate.update(key, True, 2) is None
    assert gate.update(key, True, 3) == "open"
    for i in range(4):
        assert gate.update(key, False, 10 + i) is None
    assert gate.update(key, False, 20) == "resolved"


def test_outside_vs_shocking_and_boots_exempt():
    polygon = [(0, 0), (100, 0), (100, 100), (0, 100)]
    assert point_in_polygon(10, 10, polygon)
    assert classify_zone(10, 10, [polygon]) == "SHOCKING"
    assert classify_zone(200, 200, [polygon]) == "OUTSIDE"
    outside = evaluate("OUTSIDE", set())
    assert {d.violation_type for d in outside} == {"helmet", "goggles"}
    shocking = evaluate("SHOCKING", {"helmet", "goggles", "arc_suit", "arc_gloves"})
    assert [d.violation_type for d in shocking] == ["arc_flash_shield"]
    assert evaluate("SHOCKING", {"helmet", "goggles", "arc_flash_shield"}) == []
    assert is_boots("boots")


def test_mock_engine_emits_after_confirmation():
    camera = CameraRuntime(
        code="CAM-LIVE-01",
        stream_name="cam-live-01",
        rtsp_url="rtsp://example/cam",
        polygons=[[(100.0, 700.0), (1800.0, 700.0), (1800.0, 1070.0), (100.0, 1070.0)]],
    )
    engine = Engine(min_consecutive=3, clear_consecutive=5)
    mock = MockModelProvider()
    events = []
    model = {"family": "YOLO11", "variant": "s", "version": "mock"}
    for i in range(3):
        events.extend(engine.step(camera, mock.infer(None, 0), 1_000 + i, model))
    types = {e["violationType"] for e in events if e["eventType"] == "ViolationCreated"}
    assert "helmet" in types
    assert "arc_flash_shield" not in types
    assert "boots" not in types
