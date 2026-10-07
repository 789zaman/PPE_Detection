from __future__ import annotations

import logging
from pathlib import Path

from ppe_worker.pipeline.normalize import Detection, resolve_class_name

log = logging.getLogger("ppe.model")


class UltralyticsProvider:
    def __init__(
        self,
        *,
        name: str,
        family: str,
        variant: str,
        weights: Path,
        class_names: list[str],
        aliases: dict[str, str],
        imgsz: int,
        confidence: float,
        iou: float,
        device: str,
    ) -> None:
        self.name = name
        self.family = family
        self.variant = variant
        self.weights = weights
        self.class_names = class_names
        self.aliases = aliases
        self.imgsz = imgsz
        self.confidence = confidence
        self.iou = iou
        self.device = device
        self.loaded = False
        self._model = None

    def load(self) -> None:
        if not self.weights.is_file():
            self.loaded = False
            raise FileNotFoundError(
                f"Weights not found at {self.weights}. Keep AI_MODE=mock until a checkpoint is provided."
            )
        from ultralytics import YOLO

        self._model = YOLO(str(self.weights))
        self.loaded = True
        log.info("model_loaded", extra={"model": self.name, "weights": str(self.weights)})

    def infer(self, frame, frame_index: int) -> list[Detection]:
        del frame_index
        if not self.loaded or self._model is None or frame is None:
            return []
        results = self._model.predict(
            frame,
            imgsz=self.imgsz,
            conf=self.confidence,
            iou=self.iou,
            device=self.device,
            verbose=False,
        )
        detections: list[Detection] = []
        for result in results:
            names = getattr(result, "names", None) or {}
            boxes = getattr(result, "boxes", None)
            if boxes is None:
                continue
            for box in boxes:
                cls_id = int(box.cls[0])
                raw = names.get(cls_id, self.class_names[cls_id] if cls_id < len(self.class_names) else str(cls_id))
                xyxy = box.xyxy[0].tolist()
                detections.append(
                    Detection(
                        class_name=resolve_class_name(str(raw), self.class_names, self.aliases),
                        confidence=float(box.conf[0]),
                        box=(float(xyxy[0]), float(xyxy[1]), float(xyxy[2]), float(xyxy[3])),
                    )
                )
        return detections


def build_yolo(settings, model_config: dict) -> UltralyticsProvider:
    weights = Path(settings.model_path) if settings.model_path else Path(settings.models_dir) / settings.model_name / "weights" / "best.pt"
    return UltralyticsProvider(
        name=str(model_config.get("name", settings.model_name)),
        family=str(model_config.get("family", "YOLO")),
        variant=str(model_config.get("variant", "s")),
        weights=weights,
        class_names=list(model_config.get("classes") or []),
        aliases={str(k): str(v) for k, v in (model_config.get("class_aliases") or {}).items()},
        imgsz=int(settings.imgsz or model_config.get("imgsz") or 960),
        confidence=float(settings.confidence or model_config.get("confidence") or 0.25),
        iou=float(settings.iou or model_config.get("iou") or 0.45),
        device=str(settings.device or model_config.get("device") or "cpu"),
    )
