from __future__ import annotations

import asyncio
import json
import logging
import sys
import time

from ppe_worker.config import get_settings
from ppe_worker.health import WorkerState, start_health_server
from ppe_worker.worker import run_worker


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "service": "ai-worker",
            "level": record.levelname,
            "message": record.getMessage(),
        }
        for key in ("eventId", "cameraId", "workerId"):
            value = getattr(record, key, None)
            if value:
                payload[key] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload)


def configure_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(_JsonFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.INFO)


async def _amain() -> None:
    settings = get_settings()
    state = WorkerState()
    state.ai_mode = settings.ai_mode
    state.model_name = settings.model_name
    state.started = time.time()
    server = start_health_server(state, settings.health_port)
    stop = asyncio.Event()
    logging.getLogger("ppe.worker").info(
        "startup",
        extra={"workerId": settings.worker_id, "cameraId": ""},
    )
    try:
        await run_worker(settings, state, stop)
    finally:
        server.shutdown()


def main() -> None:
    configure_logging()
    try:
        asyncio.run(_amain())
    except KeyboardInterrupt:
        logging.getLogger("ppe.worker").info("shutdown")


if __name__ == "__main__":
    main()
