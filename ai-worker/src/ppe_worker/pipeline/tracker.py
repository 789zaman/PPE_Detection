"""Lightweight IoU tracker with stable ids.

This is the tracking boundary the pipeline depends on. It keeps the latest
assignment instead of growing a frame queue, and it does not require the
ByteTrack package so mock mode and unit tests run without model weights.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from ppe_worker.pipeline.associate import iou


@dataclass
class Track:
    track_id: int
    box: tuple[float, float, float, float]
    missed: int = 0


@dataclass
class IoUTracker:
    iou_threshold: float = 0.3
    max_missed: int = 15
    _next_id: int = 1
    _tracks: list[Track] = field(default_factory=list)

    def update(self, boxes: list[tuple[float, float, float, float]]) -> list[Track]:
        unmatched_tracks = set(range(len(self._tracks)))
        unmatched_boxes = set(range(len(boxes)))
        pairs: list[tuple[float, int, int]] = []
        for ti, track in enumerate(self._tracks):
            for bi, box in enumerate(boxes):
                score = iou(track.box, box)
                if score >= self.iou_threshold:
                    pairs.append((score, ti, bi))
        pairs.sort(reverse=True)

        used_tracks: set[int] = set()
        used_boxes: set[int] = set()
        for _score, ti, bi in pairs:
            if ti in used_tracks or bi in used_boxes:
                continue
            self._tracks[ti].box = boxes[bi]
            self._tracks[ti].missed = 0
            used_tracks.add(ti)
            used_boxes.add(bi)
            unmatched_tracks.discard(ti)
            unmatched_boxes.discard(bi)

        for ti in list(unmatched_tracks):
            self._tracks[ti].missed += 1

        for bi in unmatched_boxes:
            self._tracks.append(Track(self._next_id, boxes[bi]))
            self._next_id += 1

        self._tracks = [track for track in self._tracks if track.missed <= self.max_missed]
        return [track for track in self._tracks if track.missed == 0]
