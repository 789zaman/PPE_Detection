"""PPE compliance matrix.

Outside the shocking boundary: helmet and goggles only.
Inside the shocking boundary: helmet, goggles, and one Arc PPE violation when
the flash shield is absent. A present shield satisfies arc suit and arc gloves.
Boots never create a violation.
"""

from __future__ import annotations

from dataclasses import dataclass

HELMET = "helmet"
GOGGLES = "goggles"
ARC_SUIT = "arc_suit"
ARC_FLASH_SHIELD = "arc_flash_shield"
ARC_GLOVES = "arc_gloves"
BOOTS = "boots"
PERSON = "person"

_ALIASES = {
    "hardhat": HELMET,
    "helmet": HELMET,
    "goggles": GOGGLES,
    "glasses": GOGGLES,
    "safety_glasses": GOGGLES,
    "safetyglasses": GOGGLES,
    "arc_suit": ARC_SUIT,
    "arcsuit": ARC_SUIT,
    "arc_flash_suit": ARC_SUIT,
    "suit": ARC_SUIT,
    "arc_flash_shield": ARC_FLASH_SHIELD,
    "arc_shield": ARC_FLASH_SHIELD,
    "arcshield": ARC_FLASH_SHIELD,
    "face_shield": ARC_FLASH_SHIELD,
    "vest": ARC_FLASH_SHIELD,
    "safety_vest": ARC_FLASH_SHIELD,
    "arc_gloves": ARC_GLOVES,
    "gloves": ARC_GLOVES,
    "glove": ARC_GLOVES,
    "boots": BOOTS,
    "boot": BOOTS,
    "shoes": BOOTS,
    "shoe": BOOTS,
    "no_boots": BOOTS,
    "person": PERSON,
    "people": PERSON,
}


def normalize_class(name: str | None) -> str:
    key = (name or "").strip().lower().replace("-", "_").replace(" ", "_")
    return _ALIASES.get(key, key)


def is_boots(name: str | None) -> bool:
    return normalize_class(name) == BOOTS


@dataclass(frozen=True)
class Decision:
    violation_type: str
    missing_ppe: str
    severity: str
    is_immediate: bool


def evaluate(zone: str, associated: set[str]) -> list[Decision]:
    present = {normalize_class(name) for name in associated}
    shocking = zone.upper() == "SHOCKING"
    decisions: list[Decision] = []

    if HELMET not in present:
        decisions.append(
            Decision(HELMET, "Helmet", "critical" if shocking else "high", shocking)
        )
    if GOGGLES not in present:
        decisions.append(
            Decision(GOGGLES, "Safety Glasses", "critical" if shocking else "medium", shocking)
        )
    if shocking and ARC_FLASH_SHIELD not in present:
        decisions.append(Decision(ARC_FLASH_SHIELD, "Arc Flash Shield", "critical", True))
    return decisions
