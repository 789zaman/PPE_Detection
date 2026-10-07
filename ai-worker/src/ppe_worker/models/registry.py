from __future__ import annotations

from pathlib import Path

import yaml

from ppe_worker.models.mock_provider import MockModelProvider
from ppe_worker.models.yolo_provider import build_yolo


def load_model_config(models_dir: Path, model_name: str) -> dict:
    path = models_dir / model_name / "config" / "model.yaml"
    if not path.is_file():
        raise FileNotFoundError(f"Model config not found: {path}")
    with path.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}
    if not isinstance(data, dict):
        raise ValueError(f"Invalid model config: {path}")
    return data


def create_provider(settings):
    name = settings.model_name.lower()
    if name in {"yolov11s", "yolo11s", "yolo11"}:
        folder = "yolov11s"
    elif name in {"yolov8s", "yolo8s", "yolov8"}:
        folder = "yolov8s"
    else:
        folder = name

    config = load_model_config(Path(settings.models_dir), folder)
    if settings.ai_mode.lower() == "mock":
        provider = MockModelProvider(folder)
        provider.family = str(config.get("family", "YOLO11"))
        provider.variant = str(config.get("variant", "s"))
        provider.load()
        return provider, config

    provider = build_yolo(settings, config)
    provider.load()
    return provider, config
