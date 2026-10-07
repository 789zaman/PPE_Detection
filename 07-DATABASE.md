# PostgreSQL Database

## Core tables

### cameras

```text
id
name
rtsp_url
stream_name
enabled
location
created_at
updated_at
```

Never expose `rtsp_url` including credentials to Angular.

### camera_zones

```text
id
camera_id
name
polygon_json
enabled
created_at
updated_at
```

### ppe_configurations

```text
id
camera_id
class_name
candidate_confidence
association_threshold
min_consecutive_observations
clear_consecutive_observations
enabled
updated_at
```

### violations

```text
id
camera_id
track_id
violation_type
severity
confidence
status
started_at
last_seen_at
resolved_at
snapshot_key
zone_id
model_name
model_version
created_at
updated_at
```

### violation_reviews

```text
id
violation_id
reviewer_id
decision
reason
created_at
```

### audit_events

```text
id
actor_type
actor_id
action
entity_type
entity_id
metadata_json
created_at
```

### event_consumption

```text
event_id
event_type
processed_at
```

Use this for idempotent event handling if required.

## Indexes

Create indexes for:

```text
violations(camera_id, created_at)
violations(status, created_at)
violations(violation_type, created_at)
violation_reviews(violation_id)
audit_events(entity_type, entity_id)
```

## Migrations

Use EF Core migrations.

Startup behavior:
- development may optionally apply migrations automatically
- production should use an explicit migration step

Do not silently destroy/recreate databases.

## Media

Do not store images/video blobs in PostgreSQL.

Store:

```text
snapshot_key
```

and keep media in:
- local filesystem for development
- MinIO/S3-compatible storage for production
