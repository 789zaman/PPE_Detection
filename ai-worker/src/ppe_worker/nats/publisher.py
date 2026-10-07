from __future__ import annotations

import json
import logging

from ppe_worker.config import Settings

log = logging.getLogger("ppe.nats")


class EventPublisher:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.connected = False
        self._nc = None
        self._js = None
        self.published: list[tuple[str, dict]] = []

    async def connect(self) -> None:
        if not self.settings.nats_enabled:
            self.connected = False
            return
        import nats

        self._nc = await nats.connect(
            self.settings.nats_url,
            reconnect_time_wait=2,
            max_reconnect_attempts=-1,
            name=self.settings.worker_id,
        )
        self._js = self._nc.jetstream()
        try:
            await self._js.add_stream(name="PPE", subjects=["ppe.v1.>"])
        except Exception:
            log.info("nats_stream_exists")
        self.connected = True
        log.info("nats_connected", extra={"workerId": self.settings.worker_id})

    async def publish(self, subject: str, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.published.append((subject, payload))
        if self._js is None:
            return
        await self._js.publish(subject, body)

    async def subscribe_config(self, callback) -> None:
        if self._nc is None:
            return

        async def handler(msg):
            await callback()

        await self._nc.subscribe("ppe.v1.configuration.changed", cb=handler)

    async def close(self) -> None:
        if self._nc is not None:
            await self._nc.drain()
            self.connected = False
