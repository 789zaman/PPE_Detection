-- Reference schema. Runtime uses EF Core EnsureCreated / migrations.

CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY,
    full_name varchar(200) NOT NULL,
    email varchar(256) NOT NULL UNIQUE,
    password_hash text NOT NULL,
    role varchar(64) NOT NULL,
    created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS plant_zones (
    id uuid PRIMARY KEY,
    code varchar(64) NOT NULL UNIQUE,
    name varchar(200) NOT NULL,
    description text,
    is_active boolean NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS cameras (
    id uuid PRIMARY KEY,
    name varchar(200) NOT NULL,
    code varchar(64) NOT NULL UNIQUE,
    rtsp_url varchar(1000) NOT NULL,
    stream_name varchar(128) NOT NULL UNIQUE,
    stream_url text,
    is_primary boolean NOT NULL,
    is_active boolean NOT NULL,
    location text,
    zone_id uuid NOT NULL REFERENCES plant_zones(id),
    frame_width int NOT NULL,
    frame_height int NOT NULL,
    status varchar(32) NOT NULL,
    worker_count int NOT NULL,
    last_heartbeat_at timestamptz,
    yellow_zone_json text,
    red_zone_json text,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS ppe_configurations (
    id uuid PRIMARY KEY,
    camera_id uuid,
    class_name varchar(64) NOT NULL,
    candidate_confidence double precision NOT NULL,
    association_threshold double precision NOT NULL,
    min_consecutive_observations int NOT NULL,
    clear_consecutive_observations int NOT NULL,
    enabled boolean NOT NULL,
    updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS violations (
    id uuid PRIMARY KEY,
    camera_id uuid NOT NULL REFERENCES cameras(id),
    track_id int,
    violation_type varchar(64) NOT NULL,
    severity varchar(32) NOT NULL,
    confidence double precision NOT NULL,
    status varchar(32) NOT NULL,
    started_at timestamptz NOT NULL,
    last_seen_at timestamptz NOT NULL,
    resolved_at timestamptz,
    snapshot_key text,
    zone_id text,
    model_family text,
    model_variant text,
    model_version text,
    checkpoint_hash text,
    worker_code text,
    worker_name text,
    ppe_zone varchar(32) NOT NULL,
    is_violation boolean NOT NULL,
    is_immediate boolean NOT NULL,
    missing_ppe text,
    helmet_detected boolean,
    bounding_boxes_json text,
    frame_width int NOT NULL,
    frame_height int NOT NULL,
    evidence_json text,
    idempotency_key varchar(256) UNIQUE,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_violations_camera_created ON violations (camera_id, created_at);
CREATE INDEX IF NOT EXISTS ix_violations_status_created ON violations (status, created_at);
CREATE INDEX IF NOT EXISTS ix_violations_type_created ON violations (violation_type, created_at);

CREATE TABLE IF NOT EXISTS event_consumption (
    event_id uuid PRIMARY KEY,
    event_type varchar(64) NOT NULL,
    processed_at timestamptz NOT NULL
);
