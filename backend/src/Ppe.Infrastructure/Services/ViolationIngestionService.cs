using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Ppe.Application;
using Ppe.Domain;
using Ppe.Infrastructure.Persistence;

namespace Ppe.Infrastructure.Services;

public sealed class ViolationIngestionService(
    AppDbContext db,
    IRealtimeNotifier realtime,
    ILogger<ViolationIngestionService> logger) : IViolationIngestion
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task<IngestOutcome> IngestAsync(ViolationEvent evt, CancellationToken cancellationToken)
    {
        if (evt.SchemaVersion != 1)
            throw new AppException(400, "Unsupported event schema version.", "schemaVersion");

        if (evt.EventId == Guid.Empty)
            evt.EventId = Guid.NewGuid();

        if (await db.ProcessedEvents.AnyAsync(x => x.EventId == evt.EventId, cancellationToken))
            return IngestOutcome.Duplicate;

        var type = PpeClasses.Normalize(evt.ViolationType);
        if (PpeClasses.IsBoots(type))
        {
            await MarkProcessed(evt, cancellationToken);
            logger.LogInformation("boots_violation_ignored {EventId}", evt.EventId);
            return IngestOutcome.Ignored;
        }

        if (!string.IsNullOrWhiteSpace(evt.IdempotencyKey)
            && await db.Violations.AnyAsync(x => x.IdempotencyKey == evt.IdempotencyKey, cancellationToken))
        {
            await MarkProcessed(evt, cancellationToken);
            return IngestOutcome.Duplicate;
        }

        var camera = await FindCamera(evt.CameraId, cancellationToken);
        if (camera is null)
            throw new AppException(404, $"Camera '{evt.CameraId}' was not found.", "cameraId");

        var now = DateTimeOffset.UtcNow;
        var resolved = string.Equals(evt.EventType, "ViolationResolved", StringComparison.OrdinalIgnoreCase);
        Violation? row = null;
        if (evt.ViolationId != Guid.Empty)
            row = await db.Violations.Include(x => x.Camera).ThenInclude(x => x!.Zone)
                .FirstOrDefaultAsync(x => x.Id == evt.ViolationId, cancellationToken);

        if (resolved)
        {
            if (row is null)
            {
                await MarkProcessed(evt, cancellationToken);
                return IngestOutcome.Ignored;
            }

            row.Status = "RESOLVED";
            row.ResolvedAt = evt.OccurredAt == default ? now : evt.OccurredAt;
            row.LastSeenAt = row.ResolvedAt.Value;
            row.UpdatedAt = now;
            row.IsViolation = true;
            await MarkProcessed(evt, cancellationToken);
            await db.SaveChangesAsync(cancellationToken);
            var cleared = ToLivePayload(row, isViolation: false);
            await realtime.PublishViolationAsync(cleared, cancellationToken);
            return IngestOutcome.Resolved;
        }

        var created = row is null;
        row ??= new Violation { Id = evt.ViolationId == Guid.Empty ? Guid.NewGuid() : evt.ViolationId };
        var when = evt.OccurredAt == default ? now : evt.OccurredAt;
        if (created)
        {
            row.CameraId = camera.Id;
            row.StartedAt = when;
            row.CreatedAt = now;
            row.IdempotencyKey = string.IsNullOrWhiteSpace(evt.IdempotencyKey) ? null : evt.IdempotencyKey;
            db.Violations.Add(row);
        }

        row.TrackId = evt.TrackId;
        row.ViolationType = type;
        row.Severity = string.IsNullOrWhiteSpace(evt.Severity) ? "high" : evt.Severity.ToLowerInvariant();
        row.Confidence = evt.Confidence;
        row.Status = evt.Confidence > 0 && evt.Confidence < 0.35 ? "PENDING_REVIEW" : row.Status is "RESOLVED" or "ACCEPTED" or "REJECTED" ? row.Status : "OPEN";
        if (created)
            row.Status = evt.Confidence > 0 && evt.Confidence < 0.35 ? "PENDING_REVIEW" : "OPEN";
        row.LastSeenAt = when;
        row.UpdatedAt = now;
        row.SnapshotKey = evt.SnapshotKey ?? row.SnapshotKey;
        row.ZoneId = evt.ZoneId;
        row.ModelFamily = evt.Model?.Family;
        row.ModelVariant = evt.Model?.Variant;
        row.ModelVersion = evt.Model?.Version;
        row.CheckpointHash = evt.Model?.CheckpointHash;
        row.WorkerCode = evt.WorkerCode ?? $"S-{evt.TrackId}";
        row.WorkerName = evt.WorkerName ?? $"Track {evt.TrackId}";
        row.PpeZone = string.Equals(evt.PpeZone, "SHOCKING", StringComparison.OrdinalIgnoreCase) ? "SHOCKING" : "OUTSIDE";
        row.IsViolation = true;
        row.IsImmediate = evt.IsImmediate || row.PpeZone == "SHOCKING";
        row.MissingPpe = evt.MissingPpe;
        row.HelmetDetected = evt.HelmetDetected;
        row.FrameWidth = evt.FrameWidth <= 0 ? camera.FrameWidth : evt.FrameWidth;
        row.FrameHeight = evt.FrameHeight <= 0 ? camera.FrameHeight : evt.FrameHeight;
        row.BoundingBoxesJson = evt.BoundingBoxes is { Count: > 0 }
            ? JsonSerializer.Serialize(evt.BoundingBoxes, Json)
            : row.BoundingBoxesJson;
        row.EvidenceJson = evt.Evidence is null ? row.EvidenceJson : JsonSerializer.Serialize(evt.Evidence, Json);
        if (row.PpeZone == "SHOCKING")
            row.Severity = "critical";

        if (!string.IsNullOrWhiteSpace(row.SnapshotKey))
        {
            var exists = await db.Captures.AnyAsync(x => x.ViolationId == row.Id, cancellationToken);
            if (!exists)
            {
                db.Captures.Add(new Capture
                {
                    Id = Guid.NewGuid(),
                    CameraId = camera.Id,
                    ViolationId = row.Id,
                    StorageKey = row.SnapshotKey,
                    ImageUrl = row.SnapshotKey,
                    CreatedAt = now
                });
            }
        }

        if (created)
        {
            var stat = await Today(cancellationToken);
            stat.Violations += 1;
            var notification = new Notification
            {
                Id = Guid.NewGuid(),
                ViolationId = row.Id,
                Title = $"{row.MissingPpe ?? row.ViolationType} not detected",
                Message = $"{row.WorkerName} on {camera.Code} ({row.PpeZone})",
                Severity = row.Severity,
                Status = "open",
                CreatedAt = now
            };
            db.Notifications.Add(notification);
            db.AuditEvents.Add(new AuditEvent
            {
                Id = Guid.NewGuid(),
                ActorType = "ai-worker",
                ActorId = "ai-worker",
                Action = "violation.created",
                EntityType = "violation",
                EntityId = row.Id.ToString(),
                MetadataJson = JsonSerializer.Serialize(new { evt.EventId, row.ViolationType, row.PpeZone }, Json),
                CreatedAt = now
            });
            await MarkProcessed(evt, cancellationToken);
            try
            {
                await db.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException ex)
            {
                logger.LogWarning(ex, "duplicate_violation {EventId}", evt.EventId);
                return IngestOutcome.Duplicate;
            }

            row.Camera = camera;
            await realtime.PublishViolationAsync(ViolationViews.ToDto(row), cancellationToken);
            await realtime.PublishNotificationAsync(new
            {
                id = notification.Id,
                title = notification.Title,
                message = notification.Message,
                isRead = false,
                severity = notification.Severity,
                createdAt = notification.CreatedAt,
                detectionLogId = row.Id
            }, cancellationToken);
            return IngestOutcome.Created;
        }

        await MarkProcessed(evt, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        row.Camera = camera;
        await realtime.PublishViolationAsync(ViolationViews.ToDto(row), cancellationToken);
        return IngestOutcome.Updated;
    }

    public async Task IngestWorkerStatusAsync(WorkerStatusEvent evt, CancellationToken cancellationToken)
    {
        if (evt.EventId != Guid.Empty && await db.ProcessedEvents.AnyAsync(x => x.EventId == evt.EventId, cancellationToken))
            return;

        var camera = await FindCamera(evt.CameraId, cancellationToken);
        if (camera is not null)
        {
            camera.Status = "online";
            camera.WorkerCount = evt.ActiveTracks;
            camera.LastHeartbeatAt = evt.Timestamp == default ? DateTimeOffset.UtcNow : evt.Timestamp;
            camera.UpdatedAt = DateTimeOffset.UtcNow;
            if (evt.DetectionsDelta > 0)
            {
                var stat = await Today(cancellationToken);
                stat.Detections += evt.DetectionsDelta;
            }

            await db.SaveChangesAsync(cancellationToken);
            await realtime.PublishCameraStatusAsync(CameraViews.Status(camera), cancellationToken);
        }

        if (evt.EventId != Guid.Empty)
        {
            db.ProcessedEvents.Add(new ProcessedEvent
            {
                EventId = evt.EventId,
                EventType = "WorkerStatus",
                ProcessedAt = DateTimeOffset.UtcNow
            });
            try
            {
                await db.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException)
            {
                // duplicate heartbeat
            }
        }
    }

    public async Task IngestCameraStatusAsync(CameraStatusEvent evt, CancellationToken cancellationToken)
    {
        if (evt.EventId != Guid.Empty && await db.ProcessedEvents.AnyAsync(x => x.EventId == evt.EventId, cancellationToken))
            return;

        var camera = await FindCamera(evt.CameraId, cancellationToken);
        if (camera is not null)
        {
            var status = evt.Status.ToUpperInvariant();
            camera.Status = status is "ONLINE" or "DEGRADED" or "RUNNING" ? "online" : "offline";
            camera.LastHeartbeatAt = evt.Timestamp == default ? DateTimeOffset.UtcNow : evt.Timestamp;
            camera.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
            await realtime.PublishCameraStatusAsync(CameraViews.Status(camera), cancellationToken);
        }

        if (evt.EventId != Guid.Empty)
        {
            db.ProcessedEvents.Add(new ProcessedEvent
            {
                EventId = evt.EventId,
                EventType = "CameraStatus",
                ProcessedAt = DateTimeOffset.UtcNow
            });
            try
            {
                await db.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException)
            {
                // redelivery
            }
        }
    }

    private async Task MarkProcessed(ViolationEvent evt, CancellationToken cancellationToken)
    {
        db.ProcessedEvents.Add(new ProcessedEvent
        {
            EventId = evt.EventId,
            EventType = evt.EventType,
            ProcessedAt = DateTimeOffset.UtcNow
        });
        await Task.CompletedTask;
    }

    private async Task<Camera?> FindCamera(string cameraId, CancellationToken cancellationToken)
    {
        if (Guid.TryParse(cameraId, out var id))
        {
            return await db.Cameras.Include(x => x.Zone)
                .FirstOrDefaultAsync(x => x.Id == id || x.Code == cameraId, cancellationToken);
        }

        return await db.Cameras.Include(x => x.Zone)
            .FirstOrDefaultAsync(x => x.Code == cameraId || x.StreamName == cameraId, cancellationToken);
    }

    private async Task<DailyStat> Today(CancellationToken cancellationToken)
    {
        var date = DateTime.UtcNow.Date;
        var stat = await db.DailyStats.FirstOrDefaultAsync(x => x.Date == date, cancellationToken);
        if (stat is not null)
            return stat;
        stat = new DailyStat { Id = Guid.NewGuid(), Date = date };
        db.DailyStats.Add(stat);
        return stat;
    }

    private static object ToLivePayload(Violation row, bool isViolation)
    {
        var dto = ViolationViews.ToDto(row);
        return new Dictionary<string, object?>(StringComparer.Ordinal)
        {
            ["id"] = row.Id,
            ["detectedAt"] = row.LastSeenAt,
            ["violationType"] = row.ViolationType,
            ["missingPpe"] = row.MissingPpe,
            ["isViolation"] = isViolation,
            ["ppeZone"] = row.PpeZone,
            ["workerCode"] = row.WorkerCode,
            ["workerName"] = row.WorkerName,
            ["cameraCode"] = row.Camera?.Code,
            ["severity"] = row.Severity,
            ["confidence"] = row.Confidence,
            ["boundingBoxes"] = null,
            ["helmetDetected"] = row.HelmetDetected,
            ["source"] = dto
        };
    }
}
