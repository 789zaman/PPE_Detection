from __future__ import annotations

from ppe_worker.pipeline.normalize import Detection


class MockModelProvider:
    """Deterministic detections. No weights and no torch."""

    name = "mock"
    family = "mock"
    variant = "mock"
    loaded = True

    def __init__(self, model_name: str = "yolov11s") -> None:
        self.configured_model = model_name

    def load(self) -> None:
        self.loaded = True

    def infer(self, frame, frame_index: int) -> list[Detection]:
        del frame
        scenario = (frame_index // 8) % 4
        if scenario == 0:
            return [
                Detection("person", 0.92, (100, 40, 280, 400)),
                Detection("goggles", 0.80, (150, 90, 210, 130)),
            ]
        if scenario == 1:
            return [
                Detection("person", 0.94, (400, 500, 700, 1000)),
                Detection("helmet", 0.88, (480, 510, 620, 600)),
                Detection("goggles", 0.70, (500, 590, 610, 650)),
                Detection("arc_suit", 0.77, (450, 680, 680, 920)),
                Detection("arc_gloves", 0.66, (410, 760, 490, 900)),
            ]
        if scenario == 2:
            return [
                Detection("person", 0.93, (900, 520, 1200, 1020)),
                Detection("helmet", 0.90, (980, 530, 1120, 640)),
                Detection("goggles", 0.72, (1000, 620, 1100, 680)),
                Detection("arc_flash_shield", 0.81, (960, 540, 1160, 860)),
                Detection("arc_suit", 0.74, (940, 700, 1160, 980)),
                Detection("arc_gloves", 0.60, (900, 780, 980, 920)),
            ]
        return [
            Detection("person", 0.91, (1400, 30, 1650, 380)),
            Detection("helmet", 0.86, (1460, 40, 1580, 120)),
        ]
