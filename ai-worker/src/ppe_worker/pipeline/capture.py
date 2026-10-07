from __future__ import annotations

import logging
from pathlib import Path

log = logging.getLogger("ppe.capture")

# 1x1 JPEG used when a violation snapshot is required and no frame is available.
_TINY_JPEG = bytes(
    [
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
        0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
        0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
        0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20, 0x24, 0x2E, 0x27, 0x20,
        0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29, 0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27,
        0x39, 0x3D, 0x38, 0x32, 0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
        0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x09, 0xFF, 0xC4, 0x00, 0x14,
        0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, 0x7F, 0x40, 0xFF, 0xD9,
    ]
)


class LatestFrameCapture:
    def __init__(self, url: str) -> None:
        self.url = url
        self._cap = None
        self.connected = False
        self.reconnects = 0

    def open(self) -> bool:
        try:
            import cv2
        except ImportError:
            log.warning("opencv_missing")
            self.connected = False
            return False
        if self._cap is not None:
            self._cap.release()
        self._cap = cv2.VideoCapture(self.url)
        self.connected = bool(self._cap is not None and self._cap.isOpened())
        if not self.connected:
            self.reconnects += 1
        return self.connected

    def read_latest(self):
        if self._cap is None or not self.connected:
            return None
        import cv2

        ok, frame = self._cap.read()
        if not ok:
            self.connected = False
            self.reconnects += 1
            return None
        # Drop stale buffered frames and keep the newest decode.
        for _ in range(2):
            grabbed = self._cap.grab()
            if not grabbed:
                break
        ok, latest = self._cap.retrieve()
        return latest if ok else frame

    def close(self) -> None:
        if self._cap is not None:
            self._cap.release()
            self._cap = None
        self.connected = False


def write_snapshot(root: Path, camera_code: str, violation_id: str, frame=None) -> str:
    relative = f"snapshots/{camera_code}/{violation_id}.jpg"
    target = root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    if frame is not None:
        try:
            import cv2

            cv2.imwrite(str(target), frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
            return relative
        except Exception:
            log.exception("snapshot_encode_failed")
    target.write_bytes(_TINY_JPEG)
    return relative
