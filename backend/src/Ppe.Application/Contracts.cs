namespace Ppe.Application;

public sealed record ApiError(string? Code, string? Message, string? Field);

public sealed record ApiEnvelope<T>(bool Success, T? Data, string? Message, IReadOnlyList<ApiError>? Errors, object? Meta);

public sealed record PageMeta(int PageNumber, int PageSize, int TotalRecords, int TotalPages);

public sealed class ModelInfo
{
    public string? Family { get; set; }
    public string? Variant { get; set; }
    public string? Version { get; set; }
    public string? CheckpointHash { get; set; }
}

public sealed class EvidenceInfo
{
    public int ConsecutiveObservations { get; set; }
    public int WindowMs { get; set; }
}

public sealed class BoxDto
{
    public double X { get; set; }
    public double Y { get; set; }
    public double W { get; set; }
    public double H { get; set; }
    public string? Class { get; set; }
    public double? Confidence { get; set; }
}

public sealed class ViolationEvent
{
    public Guid EventId { get; set; }
    public string EventType { get; set; } = "ViolationCreated";
    public int SchemaVersion { get; set; } = 1;
    public DateTimeOffset OccurredAt { get; set; }
    public string CameraId { get; set; } = "";
    public int TrackId { get; set; }
    public Guid ViolationId { get; set; }
    public string ViolationType { get; set; } = "";
    public string Severity { get; set; } = "high";
    public double Confidence { get; set; }
    public string? SnapshotKey { get; set; }
    public string? ZoneId { get; set; }
    public ModelInfo? Model { get; set; }
    public EvidenceInfo? Evidence { get; set; }
    public string? IdempotencyKey { get; set; }
    public string? PpeZone { get; set; }
    public string? WorkerCode { get; set; }
    public string? WorkerName { get; set; }
    public string? MissingPpe { get; set; }
    public bool? HelmetDetected { get; set; }
    public bool IsImmediate { get; set; }
    public bool IsViolation { get; set; } = true;
    public int FrameWidth { get; set; } = 1920;
    public int FrameHeight { get; set; } = 1080;
    public List<BoxDto>? BoundingBoxes { get; set; }
}

public sealed class WorkerStatusEvent
{
    public Guid EventId { get; set; }
    public string WorkerId { get; set; } = "";
    public string CameraId { get; set; } = "";
    public string Status { get; set; } = "running";
    public double InputFps { get; set; }
    public double InferenceFps { get; set; }
    public double LatencyMs { get; set; }
    public string? Model { get; set; }
    public string? AiMode { get; set; }
    public DateTimeOffset Timestamp { get; set; }
    public int ActiveTracks { get; set; }
    public int DetectionsDelta { get; set; }
}

public sealed class CameraStatusEvent
{
    public Guid EventId { get; set; }
    public string CameraId { get; set; } = "";
    public string Status { get; set; } = "OFFLINE";
    public DateTimeOffset Timestamp { get; set; }
}

public enum IngestOutcome
{
    Created,
    Updated,
    Resolved,
    Duplicate,
    Ignored
}

public interface IRealtimeNotifier
{
    Task PublishViolationAsync(object payload, CancellationToken cancellationToken);
    Task PublishCameraStatusAsync(object payload, CancellationToken cancellationToken);
    Task PublishNotificationAsync(object payload, CancellationToken cancellationToken);
    Task PublishPrimarySwitchedAsync(Guid cameraId, string cameraCode, CancellationToken cancellationToken);
}

public interface IViolationIngestion
{
    Task<IngestOutcome> IngestAsync(ViolationEvent evt, CancellationToken cancellationToken);
    Task IngestWorkerStatusAsync(WorkerStatusEvent evt, CancellationToken cancellationToken);
    Task IngestCameraStatusAsync(CameraStatusEvent evt, CancellationToken cancellationToken);
}

public interface INatsPublisher
{
    bool IsConnected { get; }
    Task PublishAsync(string subject, object payload, CancellationToken cancellationToken);
}

public interface IMediaMtxRegistrar
{
    Task RegisterPathAsync(string streamName, string sourceRtsp, CancellationToken cancellationToken);
}

public static class ViolationTypes
{
    public static string? CanonicalFilter(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw) || raw.Equals("All", StringComparison.OrdinalIgnoreCase))
            return null;

        var key = raw.Trim().Replace(" ", "", StringComparison.Ordinal)
            .Replace("_", "", StringComparison.Ordinal)
            .Replace("-", "", StringComparison.Ordinal)
            .ToLowerInvariant();

        return key switch
        {
            "helmet" => "helmet",
            "gloves" or "arcgloves" => "arc_gloves",
            "safetyglasses" or "goggles" or "glasses" => "goggles",
            "arcflashsuit" or "arcsuit" or "suit" => "arc_suit",
            "vest" or "arcflashshield" or "arcshield" or "faceshield" => "arc_flash_shield",
            "boots" or "boot" or "shoes" or "shoe" => "boots",
            _ => raw.Trim().ToLowerInvariant()
        };
    }
}
