using System.Text.Json;
using Ppe.Application;
using Ppe.Infrastructure.Persistence;

namespace Ppe.Infrastructure.Services;

public static class ViolationViews
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static object ToDto(Violation violation)
    {
        object? boxes = null;
        if (!string.IsNullOrWhiteSpace(violation.BoundingBoxesJson))
        {
            try
            {
                boxes = JsonSerializer.Deserialize<List<BoxDto>>(violation.BoundingBoxesJson, Json);
            }
            catch (JsonException)
            {
                boxes = null;
            }
        }

        var camera = violation.Camera;
        return new
        {
            id = violation.Id,
            detectionLogId = violation.Id,
            detectedAt = violation.StartedAt,
            createdAt = violation.CreatedAt,
            violationType = violation.ViolationType,
            missingPpe = violation.MissingPpe,
            isViolation = violation.IsViolation,
            zoneName = camera?.Zone?.Name ?? camera?.Location ?? "Unknown zone",
            ppeZone = violation.PpeZone,
            workerName = violation.WorkerName,
            workerCode = violation.WorkerCode,
            cameraCode = camera?.Code,
            cameraName = camera?.Name,
            severity = violation.Severity,
            confidence = violation.Confidence,
            boundingBoxes = boxes,
            frameWidth = violation.FrameWidth,
            frameHeight = violation.FrameHeight,
            imagePath = violation.SnapshotKey,
            storageKey = violation.SnapshotKey,
            helmetDetected = violation.HelmetDetected,
            isImmediate = violation.IsImmediate,
            status = violation.Status,
            trackId = violation.TrackId
        };
    }

    public static string? BoxesJson(object? boxes) =>
        boxes is null ? null : JsonSerializer.Serialize(boxes, Json);
}
