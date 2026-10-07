from __future__ import annotations

from dataclasses import dataclass

from ppe_worker.pipeline.compliance import normalize_class


@dataclass(frozen=True)
class Detection:
    class_name: str
    confidence: float
    box: tuple[float, float, float, float]
    track_id: int | None = None


def resolve_class_name(raw: str | int, class_names: list[str], aliases: dict[str, str] | None = None) -> str:
    aliases = aliases or {}
    if isinstance(raw, int) or (isinstance(raw, str) and raw.isdigit()):
        index = int(raw)
        if 0 <= index < len(class_names):
            raw = class_names[index]
        else:
            return "unknown"
    name = str(raw).strip()
    mapped = aliases.get(name, aliases.get(name.lower(), name))
    return normalize_class(mapped)


def filter_detections(
    detections: list[Detection],
    thresholds: dict[str, float],
    default_threshold: float,
) -> list[Detection]:
    kept: list[Detection] = []
    for detection in detections:
        threshold = thresholds.get(detection.class_name, default_threshold)
        if detection.confidence >= threshold:
            kept.append(detection)
    return kept
