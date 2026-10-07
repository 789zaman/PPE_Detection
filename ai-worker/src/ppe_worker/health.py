from __future__ import annotations

import json
import logging
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

log = logging.getLogger("ppe.health")


class WorkerState:
    def __init__(self) -> None:
        self.ai_mode = "mock"
        self.model_name = "yolov11s"
        self.model_family = "YOLO11"
        self.model_variant = "s"
        self.model_loaded = False
        self.model_error: str | None = None
        self.nats_connected = False
        self.started = 0.0
        self.cameras: dict[str, dict] = {}
        self.input_fps = 0.0
        self.inference_fps = 0.0
        self.latency_ms = 0.0
        self.dropped_frames = 0
        self.active_tracks = 0
        self.violations = 0

    def snapshot(self) -> dict:
        return {
            "status": "running",
            "aiMode": self.ai_mode,
            "modelName": self.model_name,
            "modelFamily": self.model_family,
            "modelVariant": self.model_variant,
            "modelLoaded": self.model_loaded,
            "modelError": self.model_error,
            "natsConnected": self.nats_connected,
            "inputFps": self.input_fps,
            "inferenceFps": self.inference_fps,
            "latencyMs": self.latency_ms,
            "droppedFrames": self.dropped_frames,
            "activeTracks": self.active_tracks,
            "violations": self.violations,
            "cameras": self.cameras,
        }


def start_health_server(state: WorkerState, port: int) -> ThreadingHTTPServer:
    worker_state = state

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            path = self.path.split("?", 1)[0]
            if path not in {"/health", "/health/live", "/health/ready"}:
                self.send_response(404)
                self.end_headers()
                return
            body = worker_state.snapshot()
            if path == "/health/live":
                status = 200
                body = {"status": "alive", **body}
            elif path == "/health/ready":
                ready = worker_state.model_loaded or worker_state.ai_mode == "mock"
                status = 200 if ready else 503
                body = {"status": "ready" if ready else "not_ready", **body}
            else:
                status = 200
            raw = json.dumps(body).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def log_message(self, fmt: str, *args) -> None:
            return

    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    thread = Thread(target=server.serve_forever, name="health", daemon=True)
    thread.start()
    log.info("health_listening", extra={"port": port})
    return server
