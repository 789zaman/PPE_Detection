from __future__ import annotations

from typing import Protocol

from ppe_worker.pipeline.normalize import Detection


class ModelProvider(Protocol):
    name: str
    family: str
    variant: str
    loaded: bool

    def load(self) -> None: ...

    def infer(self, frame, frame_index: int) -> list[Detection]: ...
