from __future__ import annotations

import asyncio
import json
import logging
import time
import urllib.request
from pathlib import Path

from ppe_worker.config import Settings
from ppe_worker.health import WorkerState
from ppe_worker.models.registry import create_provider
from ppe_worker.nats.publisher import EventPublisher
from ppe_worker.pipeline.capture import LatestFrameCapture, write_snapshot
from ppe_worker.pipeline.engine import CameraRuntime, Engine
from ppe_worker.pipeline.events import utc_now
from ppe_worker.pipeline.normalize import filter_detections

log = logging.getLogger("ppe.worker")

_DEFAULT_POLYGON = [
    [(100.0, 700.0), (1800.0, 700.0), (1800.0, 1070.0), (100.0, 1070.0)]
]


def _parse_polygon(raw) -> list[tuple[float, float]]:
    if not raw:
        return []
    points = raw.get("points") if isinstance(raw, dict) else raw
    parsed: list[tuple[float, float]] = []
    if not isinstance(points, list):
        return parsed
    for item in points:
        if isinstance(item, (list, tuple)) and len(item) >= 2:
            parsed.append((float(item[0]), float(item[1])))
        elif isinstance(item, dict) and "x" in item and "y" in item:
            parsed.append((float(item["x"]), float(item["y"])))
    return parsed if len(parsed) >= 3 else []


def parse_cameras(payload: dict, rtsp_base: str) -> list[CameraRuntime]:
    cameras: list[CameraRuntime] = []
    for item in payload.get("cameras") or []:
        polygons = []
        for key in ("yellowZone", "redZone"):
            polygon = _parse_polygon(item.get(key))
            if polygon:
                polygons.append(polygon)
        for polygon in item.get("polygons") or []:
            parsed = _parse_polygon(polygon)
            if parsed:
                polygons.append(parsed)
        code = str(item.get("code") or item.get("id") or "CAM-LIVE-01")
        stream = str(item.get("streamName") or code.lower())
        rtsp = str(item.get("aiRtspUrl") or f"{rtsp_base.rstrip('/')}/{stream}")
        cameras.append(
            CameraRuntime(
                code=code,
                stream_name=stream,
                rtsp_url=rtsp,
                enabled=bool(item.get("enabled", True)),
                frame_width=int(item.get("frameWidth") or 1920),
                frame_height=int(item.get("frameHeight") or 1080),
                polygons=polygons,
            )
        )
    return [camera for camera in cameras if camera.enabled]


def fallback_camera(settings: Settings) -> CameraRuntime:
    polygons = _DEFAULT_POLYGON if settings.ai_mode.lower() == "mock" else []
    return CameraRuntime(
        code="CAM-LIVE-01",
        stream_name="cam-live-01",
        rtsp_url=f"{settings.mediamtx_rtsp_base.rstrip('/')}/cam-live-01",
        polygons=polygons,
    )


def fetch_cameras(settings: Settings) -> list[CameraRuntime]:
    request = urllib.request.Request(
        settings.backend_config_url,
        headers={"X-Internal-Token": settings.internal_token, "Accept": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=5) as response:
        payload = json.loads(response.read().decode("utf-8"))
    data = payload.get("data", payload)
    return parse_cameras(data, settings.mediamtx_rtsp_base)


async def run_worker(settings: Settings, state: WorkerState, stop: asyncio.Event) -> None:
    provider, model_config = create_provider(settings)
    state.ai_mode = settings.ai_mode
    state.model_name = settings.model_name
    state.model_family = getattr(provider, "family", str(model_config.get("family", "")))
    state.model_variant = getattr(provider, "variant", str(model_config.get("variant", "")))
    state.model_loaded = bool(getattr(provider, "loaded", False))
    thresholds = {str(k): float(v) for k, v in (model_config.get("thresholds") or {}).items()}
    model = {
        "family": state.model_family,
        "variant": state.model_variant,
        "version": settings.model_name if settings.ai_mode.lower() != "mock" else "mock",
    }
    publisher = EventPublisher(settings)
    backoff = 1
    while not stop.is_set():
        try:
            await publisher.connect()
            state.nats_connected = publisher.connected or not settings.nats_enabled
            break
        except Exception:
            log.warning("nats_connect_retry", extra={"workerId": settings.worker_id})
            state.nats_connected = False
            try:
                await asyncio.wait_for(stop.wait(), timeout=backoff)
                return
            except TimeoutError:
                backoff = min(30, backoff * 2)

    cameras = _load_cameras(settings)

    async def on_config():
        await _reload(settings, cameras)

    await publisher.subscribe_config(on_config)

    tasks = [
        asyncio.create_task(
            _camera_task(camera, provider, settings, state, publisher, model, thresholds, stop),
            name=f"camera-{camera.code}",
        )
        for camera in cameras
    ]
    await stop.wait()
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    await publisher.close()


def _load_cameras(settings: Settings) -> list[CameraRuntime]:
    try:
        cameras = fetch_cameras(settings)
        if cameras:
            return cameras
    except Exception:
        log.info("config_unavailable_using_fallback")
    return [fallback_camera(settings)]


async def _reload(settings: Settings, cameras: list[CameraRuntime]) -> None:
    try:
        loaded = await asyncio.to_thread(fetch_cameras, settings)
    except Exception:
        log.info("config_reload_failed")
        return
    if not loaded:
        return
    by_code = {camera.code: camera for camera in cameras}
    for fresh in loaded:
        existing = by_code.get(fresh.code)
        if existing is None:
            log.info("camera_added_restart_required", extra={"cameraId": fresh.code})
            continue
        existing.polygons = fresh.polygons
        existing.rtsp_url = fresh.rtsp_url
        existing.enabled = fresh.enabled
        existing.frame_width = fresh.frame_width
        existing.frame_height = fresh.frame_height


async def _camera_task(camera, provider, settings, state, publisher, model, thresholds, stop) -> None:
    engine = Engine(
        association_threshold=settings.association_threshold,
        min_consecutive=settings.temporal_min_consecutive,
        clear_consecutive=settings.temporal_clear_consecutive,
    )
    capture = LatestFrameCapture(camera.rtsp_url) if settings.ai_mode.lower() == "production" else None
    backoff = 1.0
    frame_index = 0
    media_root = Path(settings.media_root)
    while not stop.is_set():
        started = time.perf_counter()
        frame = None
        try:
            if capture is not None:
                if not capture.connected and not capture.open():
                    state.cameras[camera.code] = {
                        "status": "RECONNECTING",
                        "reconnects": capture.reconnects,
                    }
                    await _publish_camera_status(publisher, settings, camera.code, "RECONNECTING")
                    await asyncio.sleep(backoff)
                    backoff = min(30.0, backoff * 2)
                    continue
                frame = capture.read_latest()
                if frame is None:
                    state.cameras[camera.code] = {"status": "RECONNECTING", "reconnects": capture.reconnects}
                    await asyncio.sleep(backoff)
                    backoff = min(30.0, backoff * 2)
                    continue
                backoff = 1.0
            detections = provider.infer(frame, frame_index)
            frame_index += 1
            detections = filter_detections(detections, thresholds, settings.confidence)
            now_ms = int(time.time() * 1000)
            events = engine.step(camera, detections, now_ms, model)
            state.cameras[camera.code] = {"status": "ONLINE", "tracks": len(engine.tracker._tracks)}
            state.active_tracks = sum(1 for item in state.cameras.values())
            state.inference_fps = 1.0 / max(settings.frame_interval_seconds, 0.05)
            state.input_fps = state.inference_fps if capture is None else 25.0
            state.latency_ms = (time.perf_counter() - started) * 1000
            for event in events:
                if event["eventType"] == "ViolationCreated":
                    event["snapshotKey"] = write_snapshot(
                        media_root, camera.code, event["violationId"], frame
                    )
                    subject = "ppe.v1.violation.created"
                    state.violations += 1
                else:
                    subject = "ppe.v1.violation.resolved"
                await publisher.publish(subject, event)
            await _publish_worker_status(publisher, settings, state, camera.code, len(detections))
            await _publish_camera_status(publisher, settings, camera.code, "ONLINE")
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("camera_loop_error", extra={"cameraId": camera.code, "workerId": settings.worker_id})
            state.cameras[camera.code] = {"status": "DEGRADED"}
        elapsed = time.perf_counter() - started
        await asyncio.sleep(max(0.05, settings.frame_interval_seconds - elapsed))
    if capture is not None:
        capture.close()


async def _publish_worker_status(publisher, settings, state, camera_code: str, detections: int) -> None:
    await publisher.publish(
        "ppe.v1.worker.status",
        {
            "eventId": _uuid(),
            "workerId": settings.worker_id,
            "cameraId": camera_code,
            "status": "running",
            "inputFps": state.input_fps,
            "inferenceFps": state.inference_fps,
            "latencyMs": round(state.latency_ms, 2),
            "model": state.model_name,
            "aiMode": state.ai_mode,
            "timestamp": utc_now(),
            "activeTracks": state.active_tracks,
            "detectionsDelta": detections,
        },
    )


async def _publish_camera_status(publisher, settings, camera_code: str, status: str) -> None:
    del settings
    await publisher.publish(
        "ppe.v1.camera.status",
        {
            "eventId": _uuid(),
            "cameraId": camera_code,
            "status": status,
            "timestamp": utc_now(),
        },
    )


def _uuid() -> str:
    import uuid

    return str(uuid.uuid4())
