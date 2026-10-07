FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libglib2.0-0 libgl1 curl && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY src/ src/
COPY models/ models/
ENV PYTHONPATH=/app/src
ENV MODELS_DIR=/app/models
ENV MEDIA_ROOT=/data/media
EXPOSE 8081
USER 65534
HEALTHCHECK --interval=15s --timeout=5s --retries=8 CMD curl -fsS http://127.0.0.1:8081/health/live || exit 1
CMD ["python", "-m", "ppe_worker.main"]
