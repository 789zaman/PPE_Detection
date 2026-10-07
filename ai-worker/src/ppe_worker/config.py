from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ai_mode: str = "mock"
    model_name: str = "yolov11s"
    model_path: str = ""
    models_dir: str = "models"
    nats_url: str = "nats://127.0.0.1:4222"
    nats_enabled: bool = True
    health_port: int = 8081
    backend_config_url: str = "http://127.0.0.1:5288/internal/ai/configuration"
    internal_token: str = "dev-internal-token"
    media_root: str = "data/media"
    worker_id: str = "ai-worker-01"
    imgsz: int = 960
    confidence: float = 0.25
    iou: float = 0.45
    device: str = "cpu"
    temporal_min_consecutive: int = 3
    temporal_clear_consecutive: int = 5
    temporal_window_ms: int = 1500
    association_threshold: float = 0.15
    frame_interval_seconds: float = 0.5
    mediamtx_rtsp_base: str = "rtsp://127.0.0.1:8554"
    config_refresh_seconds: int = 30


def get_settings() -> Settings:
    return Settings()
