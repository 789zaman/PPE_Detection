from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class _TrackState:
    missing_run: int = 0
    present_run: int = 0
    open: bool = False
    opened_at_ms: int = 0


@dataclass
class TemporalGate:
    min_consecutive: int = 3
    clear_consecutive: int = 5
    _states: dict[tuple, _TrackState] = field(default_factory=dict)

    def update(self, key: tuple, missing: bool, now_ms: int) -> str | None:
        state = self._states.setdefault(key, _TrackState())
        if missing:
            state.missing_run += 1
            state.present_run = 0
            if not state.open and state.missing_run >= self.min_consecutive:
                state.open = True
                state.opened_at_ms = now_ms
                return "open"
            return None

        state.present_run += 1
        state.missing_run = 0
        if state.open and state.present_run >= self.clear_consecutive:
            state.open = False
            state.present_run = 0
            return "resolved"
        return None

    def evidence(self, key: tuple, now_ms: int) -> tuple[int, int]:
        state = self._states.get(key)
        if not state:
            return 0, 0
        return state.missing_run, max(0, now_ms - state.opened_at_ms)
