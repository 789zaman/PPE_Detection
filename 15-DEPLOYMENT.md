# Deployment

## Local

Use Docker Compose.

```bash
docker compose up -d --build
```

## Production evolution

The architecture should be deployable later to:
- a single industrial PC
- an on-prem server
- Kubernetes

Do not introduce Kubernetes complexity for localhost.

## Single-machine production

Recommended process:

```text
MediaMTX
AI Worker
NATS
.NET Backend
PostgreSQL
Redis
Angular/nginx
```

Use Docker Compose or equivalent service management.

## Multi-camera scaling

If one AI process cannot handle all cameras:

```text
AI Worker 1 -> Camera 1..N
AI Worker 2 -> Camera N+1..M
```

Or:

```text
one supervised worker per camera
```

depending on GPU/memory requirements.

Do not assume one YOLO process can scale indefinitely.

## GPU

For NVIDIA GPU:
- use NVIDIA Container Toolkit
- enable GPU Compose profile
- expose GPU only to AI worker

Do not give GPU access to backend/frontend.

## Storage

Development:

```text
./data/media
```

Production:

```text
S3 / MinIO / object storage
```

PostgreSQL stores references and metadata.

## Backups

Back up:
- PostgreSQL
- configuration
- model versions
- important snapshots if required by policy

Do not treat Docker volumes as backups.

## Model versioning

Every violation stores:

```text
model_family
model_variant
model_version
checkpoint_hash
```

This makes later audit/debugging possible.

## Configuration versioning

Every configuration change should be auditable:
- who changed it
- old value
- new value
- timestamp
