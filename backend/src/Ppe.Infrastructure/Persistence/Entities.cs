namespace Ppe.Infrastructure.Persistence;

public sealed class AppUser
{
    public Guid Id { get; set; }
    public string FullName { get; set; } = "";
    public string Email { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string Role { get; set; } = "Viewer";
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class RefreshToken
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public AppUser? User { get; set; }
    public string Token { get; set; } = "";
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
}

public sealed class PlantZone
{
    public Guid Id { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public List<Camera> Cameras { get; set; } = [];
}

public sealed class Camera
{
    public Guid Id { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public Guid ZoneId { get; set; }
    public PlantZone? Zone { get; set; }
    public string RtspUrl { get; set; } = "";
    public string? StreamUrl { get; set; }
    public string StreamName { get; set; } = "";
    public bool IsPrimary { get; set; }
    public bool IsActive { get; set; } = true;
    public string? Location { get; set; }
    public int FrameWidth { get; set; } = 1920;
    public int FrameHeight { get; set; } = 1080;
    public string Status { get; set; } = "offline";
    public int WorkerCount { get; set; }
    public DateTimeOffset? LastHeartbeatAt { get; set; }
    public string? YellowZoneJson { get; set; }
    public string? RedZoneJson { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class PpeConfiguration
{
    public Guid Id { get; set; }
    public Guid? CameraId { get; set; }
    public string ClassName { get; set; } = "";
    public double CandidateConfidence { get; set; }
    public double AssociationThreshold { get; set; } = 0.15;
    public int MinConsecutiveObservations { get; set; } = 3;
    public int ClearConsecutiveObservations { get; set; } = 5;
    public bool Enabled { get; set; } = true;
    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class Violation
{
    public Guid Id { get; set; }
    public Guid CameraId { get; set; }
    public Camera? Camera { get; set; }
    public int? TrackId { get; set; }
    public string ViolationType { get; set; } = "";
    public string Severity { get; set; } = "high";
    public double Confidence { get; set; }
    public string Status { get; set; } = "OPEN";
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset LastSeenAt { get; set; }
    public DateTimeOffset? ResolvedAt { get; set; }
    public string? SnapshotKey { get; set; }
    public string? ZoneId { get; set; }
    public string? ModelFamily { get; set; }
    public string? ModelVariant { get; set; }
    public string? ModelVersion { get; set; }
    public string? CheckpointHash { get; set; }
    public string? WorkerCode { get; set; }
    public string? WorkerName { get; set; }
    public string PpeZone { get; set; } = "OUTSIDE";
    public bool IsViolation { get; set; } = true;
    public bool IsImmediate { get; set; }
    public string? MissingPpe { get; set; }
    public bool? HelmetDetected { get; set; }
    public string? BoundingBoxesJson { get; set; }
    public int FrameWidth { get; set; } = 1920;
    public int FrameHeight { get; set; } = 1080;
    public string? EvidenceJson { get; set; }
    public string? IdempotencyKey { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public List<ViolationReview> Reviews { get; set; } = [];
}

public sealed class ViolationReview
{
    public Guid Id { get; set; }
    public Guid ViolationId { get; set; }
    public Violation? Violation { get; set; }
    public Guid? ReviewerId { get; set; }
    public string Decision { get; set; } = "";
    public string? Reason { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class AuditEvent
{
    public Guid Id { get; set; }
    public string ActorType { get; set; } = "";
    public string? ActorId { get; set; }
    public string Action { get; set; } = "";
    public string EntityType { get; set; } = "";
    public string? EntityId { get; set; }
    public string? MetadataJson { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class ProcessedEvent
{
    public Guid EventId { get; set; }
    public string EventType { get; set; } = "";
    public DateTimeOffset ProcessedAt { get; set; }
}

public sealed class Notification
{
    public Guid Id { get; set; }
    public Guid? ViolationId { get; set; }
    public string Title { get; set; } = "";
    public string Message { get; set; } = "";
    public string Severity { get; set; } = "high";
    public bool IsRead { get; set; }
    public string Status { get; set; } = "open";
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class Capture
{
    public Guid Id { get; set; }
    public Guid CameraId { get; set; }
    public Camera? Camera { get; set; }
    public Guid? ViolationId { get; set; }
    public string StorageKey { get; set; } = "";
    public string? ImageUrl { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class DailyStat
{
    public Guid Id { get; set; }
    public DateTime Date { get; set; }
    public int Detections { get; set; }
    public int Violations { get; set; }
}

public sealed class SystemSetting
{
    public string Key { get; set; } = "";
    public string Value { get; set; } = "";
    public DateTimeOffset UpdatedAt { get; set; }
}
