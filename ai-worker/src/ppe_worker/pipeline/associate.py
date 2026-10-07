from __future__ import annotations


def _area(box: tuple[float, float, float, float]) -> float:
    x1, y1, x2, y2 = box
    return max(0.0, x2 - x1) * max(0.0, y2 - y1)


def _intersection(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    x1 = max(a[0], b[0])
    y1 = max(a[1], b[1])
    x2 = min(a[2], b[2])
    y2 = min(a[3], b[3])
    return max(0.0, x2 - x1) * max(0.0, y2 - y1)


def iou(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    inter = _intersection(a, b)
    union = _area(a) + _area(b) - inter
    if union <= 0:
        return 0.0
    return inter / union


def region_for(person: tuple[float, float, float, float], class_name: str) -> tuple[float, float, float, float]:
    x1, y1, x2, y2 = person
    w = max(1.0, x2 - x1)
    h = max(1.0, y2 - y1)
    if class_name == "helmet":
        return (x1 + 0.2 * w, y1, x1 + 0.8 * w, y1 + 0.25 * h)
    if class_name == "goggles":
        return (x1 + 0.15 * w, y1 + 0.08 * h, x1 + 0.85 * w, y1 + 0.35 * h)
    if class_name == "arc_gloves":
        return (x1 - 0.05 * w, y1 + 0.40 * h, x2 + 0.05 * w, y1 + 0.90 * h)
    if class_name == "arc_suit":
        return (x1 + 0.1 * w, y1 + 0.22 * h, x1 + 0.9 * w, y1 + 0.95 * h)
    if class_name == "arc_flash_shield":
        return (x1, y1, x2, y1 + 0.75 * h)
    return person


def associated_classes(
    person: tuple[float, float, float, float],
    detections: list[tuple[str, tuple[float, float, float, float]]],
    threshold: float = 0.15,
) -> set[str]:
    found: set[str] = set()
    for class_name, box in detections:
        if class_name in {"person", "boots"}:
            continue
        target = region_for(person, class_name)
        inter = _intersection(box, target)
        ppe_area = _area(box)
        containment = inter / ppe_area if ppe_area > 0 else 0.0
        if containment >= threshold or iou(box, target) >= threshold:
            found.add(class_name)
    return found
