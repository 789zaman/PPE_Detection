from __future__ import annotations


def point_in_polygon(x: float, y: float, polygon: list[tuple[float, float]]) -> bool:
    if len(polygon) < 3:
        return False
    inside = False
    j = len(polygon) - 1
    for i in range(len(polygon)):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        denom = yj - yi
        if abs(denom) < 1e-9:
            denom = -1e-9 if denom < 0 else 1e-9
        intersects = ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / denom + xi)
        if intersects:
            inside = not inside
        j = i
    return inside


def classify_zone(x: float, y: float, polygons: list[list[tuple[float, float]]]) -> str:
    for polygon in polygons:
        if point_in_polygon(x, y, polygon):
            return "SHOCKING"
    return "OUTSIDE"


def feet_point(box: tuple[float, float, float, float]) -> tuple[float, float]:
    x1, _y1, x2, y2 = box
    return ((x1 + x2) / 2.0, y2)
