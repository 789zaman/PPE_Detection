using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Ppe.Application;
using Ppe.Domain;
using Ppe.Infrastructure.Persistence;

namespace Ppe.Infrastructure.Services;

public static class CameraViews
{
    public static object ListItem(Camera camera) => new
    {
        id = camera.Id,
        code = camera.Code,
        name = camera.Name,
        zoneId = camera.ZoneId,
        zoneCode = camera.Zone?.Code,
        zoneName = camera.Zone?.Name,
        status = camera.Status,
        isPrimary = camera.IsPrimary,
        isActive = camera.IsActive,
        workerCount = camera.WorkerCount,
        streamUrl = camera.StreamUrl,
        frameWidth = camera.FrameWidth,
        frameHeight = camera.FrameHeight
    };

    public static object Status(Camera camera) => new
    {
        id = camera.Id,
        code = camera.Code,
        name = camera.Name,
        zoneName = camera.Zone?.Name,
        zoneCode = camera.Zone?.Code,
        status = camera.Status,
        isPrimary = camera.IsPrimary,
        workerCount = camera.WorkerCount
    };

    public static (string Protocol, string? WhepUrl, string? VideoUrl) Playback(Camera camera, string webrtcBase)
    {
        var stream = camera.StreamUrl ?? "";
        if (stream.Contains("/whep", StringComparison.OrdinalIgnoreCase))
            return ("webrtc", stream, null);
        if (stream.EndsWith(".mp4", StringComparison.OrdinalIgnoreCase) || stream.EndsWith(".webm", StringComparison.OrdinalIgnoreCase))
            return ("http", null, stream);
        var whep = $"{webrtcBase.TrimEnd('/')}/{camera.StreamName}/whep";
        return ("webrtc", whep, string.IsNullOrWhiteSpace(stream) ? null : stream);
    }
}

public sealed class CameraService(
    AppDbContext db,
    INatsPublisher nats,
    IMediaMtxRegistrar mediaMtx,
    IRealtimeNotifier realtime,
    Microsoft.Extensions.Configuration.IConfiguration configuration)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private string WebrtcBase => configuration["MediaMtx:WebrtcPublicBase"] ?? "http://127.0.0.1:8889";
    private string RtspBase => configuration["MediaMtx:RtspInternalBase"] ?? "rtsp://mediamtx:8554";

    public async Task<IReadOnlyList<object>> ListAsync(CancellationToken cancellationToken)
    {
        var cameras = await db.Cameras.Include(x => x.Zone).OrderBy(x => x.Code).ToListAsync(cancellationToken);
        return cameras.Select(CameraViews.ListItem).ToList();
    }

    public async Task<object> StatusAsync(CancellationToken cancellationToken)
    {
        var cameras = await db.Cameras.Include(x => x.Zone).OrderBy(x => x.Code).ToListAsync(cancellationToken);
        return new
        {
            total = cameras.Count,
            online = cameras.Count(x => x.Status == "online"),
            offline = cameras.Count(x => x.Status != "online"),
            cameras = cameras.Select(CameraViews.Status).ToList()
        };
    }

    public async Task<object> UpsertAsync(CameraUpsert request, string actorId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Code) || string.IsNullOrWhiteSpace(request.Name))
            throw new AppException(400, "Camera code and name are required.", "code");
        if (request.ZoneId == Guid.Empty)
            throw new AppException(400, "Zone is required.", "zoneId");

        var zone = await db.PlantZones.FirstOrDefaultAsync(x => x.Id == request.ZoneId, cancellationToken)
            ?? throw new AppException(400, "Zone was not found.", "zoneId");

        var code = request.Code.Trim();
        var camera = request.Id is { } id
            ? await db.Cameras.FirstOrDefaultAsync(x => x.Id == id, cancellationToken)
            : await db.Cameras.FirstOrDefaultAsync(x => x.Code == code, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        var created = camera is null;
        if (created)
        {
            if (string.IsNullOrWhiteSpace(request.RtspUrl))
                throw new AppException(400, "RTSP URL is required.", "rtspUrl");
            camera = new Camera
            {
                Id = Guid.NewGuid(),
                CreatedAt = now,
                YellowZoneJson = EmptyPolygon()
            };
            db.Cameras.Add(camera);
            SeedClassConfig(camera.Id, now);
        }

        camera!.Code = code;
        camera.Name = request.Name.Trim();
        camera.ZoneId = zone.Id;
        if (!string.IsNullOrWhiteSpace(request.RtspUrl))
            camera.RtspUrl = request.RtspUrl.Trim();
        camera.StreamUrl = string.IsNullOrWhiteSpace(request.StreamUrl) ? camera.StreamUrl : request.StreamUrl.Trim();
        camera.StreamName = code.ToLowerInvariant();
        camera.IsActive = request.IsActive ?? camera.IsActive;
        camera.UpdatedAt = now;
        camera.FrameWidth = camera.FrameWidth <= 0 ? 1920 : camera.FrameWidth;
        camera.FrameHeight = camera.FrameHeight <= 0 ? 1080 : camera.FrameHeight;
        if (request.IsPrimary == true)
            await ClearPrimary(camera.Id, cancellationToken);
        if (request.IsPrimary.HasValue)
            camera.IsPrimary = request.IsPrimary.Value;

        db.AuditEvents.Add(new AuditEvent
        {
            Id = Guid.NewGuid(),
            ActorType = "user",
            ActorId = actorId,
            Action = created ? "camera.created" : "camera.updated",
            EntityType = "camera",
            EntityId = camera.Id.ToString(),
            MetadataJson = JsonSerializer.Serialize(new { camera.Code, rtsp = SecretRedaction.Rtsp(camera.RtspUrl) }, Json),
            CreatedAt = now
        });

        await db.SaveChangesAsync(cancellationToken);
        await mediaMtx.RegisterPathAsync(camera.StreamName, camera.RtspUrl, cancellationToken);
        await PublishConfig(cancellationToken);
        camera.Zone = zone;
        return CameraViews.ListItem(camera);
    }

    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken)
    {
        var camera = await db.Cameras.FirstOrDefaultAsync(x => x.Id == id, cancellationToken)
            ?? throw new AppException(404, "Camera was not found.");
        db.Cameras.Remove(camera);
        await db.SaveChangesAsync(cancellationToken);
        await PublishConfig(cancellationToken);
    }

    public async Task SetPrimaryAsync(Guid id, CancellationToken cancellationToken)
    {
        var camera = await db.Cameras.FirstOrDefaultAsync(x => x.Id == id, cancellationToken)
            ?? throw new AppException(404, "Camera was not found.");
        await ClearPrimary(camera.Id, cancellationToken);
        camera.IsPrimary = true;
        camera.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        await realtime.PublishPrimarySwitchedAsync(camera.Id, camera.Code, cancellationToken);
    }

    public async Task<IReadOnlyList<object>> ListZonesAsync(CancellationToken cancellationToken)
    {
        var zones = await db.PlantZones.OrderBy(x => x.Code).ToListAsync(cancellationToken);
        return zones.Select(z => new { id = z.Id, code = z.Code, name = z.Name, description = z.Description, isActive = z.IsActive }).ToList();
    }

    public async Task<object> UpsertZoneAsync(ZoneUpsert request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Code) || string.IsNullOrWhiteSpace(request.Name))
            throw new AppException(400, "Zone code and name are required.", "code");
        var code = request.Code.Trim();
        var zone = request.Id is { } id
            ? await db.PlantZones.FirstOrDefaultAsync(x => x.Id == id, cancellationToken)
            : await db.PlantZones.FirstOrDefaultAsync(x => x.Code == code, cancellationToken);
        var now = DateTimeOffset.UtcNow;
        if (zone is null)
        {
            zone = new PlantZone { Id = Guid.NewGuid(), CreatedAt = now };
            db.PlantZones.Add(zone);
        }

        zone.Code = code;
        zone.Name = request.Name.Trim();
        zone.Description = request.Description;
        zone.IsActive = request.IsActive ?? true;
        zone.UpdatedAt = now;
        await db.SaveChangesAsync(cancellationToken);
        return new { id = zone.Id, code = zone.Code, name = zone.Name, description = zone.Description, isActive = zone.IsActive };
    }

    public async Task<object?> ZonesAsync(string code, CancellationToken cancellationToken)
    {
        var camera = await Find(code, cancellationToken);
        if (camera is null)
            return null;
        return ZonePayload(camera);
    }

    public async Task<object> SaveZonesAsync(string code, ZoneSave request, string actorId, CancellationToken cancellationToken)
    {
        var camera = await Find(code, cancellationToken) ?? throw new AppException(404, "Camera was not found.");
        camera.FrameWidth = request.FrameWidth is > 0 ? request.FrameWidth.Value : camera.FrameWidth;
        camera.FrameHeight = request.FrameHeight is > 0 ? request.FrameHeight.Value : camera.FrameHeight;
        camera.YellowZoneJson = SerializeZone(request.YellowZone);
        camera.RedZoneJson = SerializeZone(request.RedZone);
        camera.UpdatedAt = DateTimeOffset.UtcNow;
        db.AuditEvents.Add(new AuditEvent
        {
            Id = Guid.NewGuid(),
            ActorType = "user",
            ActorId = actorId,
            Action = "camera.zones.updated",
            EntityType = "camera",
            EntityId = camera.Id.ToString(),
            MetadataJson = JsonSerializer.Serialize(new { camera.Code }, Json),
            CreatedAt = camera.UpdatedAt
        });
        await db.SaveChangesAsync(cancellationToken);
        await PublishConfig(cancellationToken);
        return ZonePayload(camera);
    }

    public async Task<object?> StreamAsync(string idOrCode, CancellationToken cancellationToken)
    {
        var camera = await Find(idOrCode, cancellationToken);
        if (camera is null)
            return null;
        var playback = CameraViews.Playback(camera, WebrtcBase);
        return new
        {
            id = camera.Id,
            code = camera.Code,
            protocol = playback.Protocol,
            whepUrl = playback.WhepUrl,
            streamUrl = camera.StreamUrl ?? playback.WhepUrl,
            videoUrl = playback.VideoUrl,
            frameWidth = camera.FrameWidth,
            frameHeight = camera.FrameHeight,
            stream = new { whepUrl = playback.WhepUrl, url = camera.StreamUrl, protocol = playback.Protocol, frameWidth = camera.FrameWidth, frameHeight = camera.FrameHeight }
        };
    }

    public async Task<object> AiConfigurationAsync(CancellationToken cancellationToken)
    {
        var cameras = await db.Cameras.Where(x => x.IsActive).ToListAsync(cancellationToken);
        return new
        {
            cameras = cameras.Select(camera => new
            {
                id = camera.Id,
                code = camera.Code,
                streamName = camera.StreamName,
                aiRtspUrl = $"{RtspBase.TrimEnd('/')}/{camera.StreamName}",
                enabled = camera.IsActive,
                frameWidth = camera.FrameWidth,
                frameHeight = camera.FrameHeight,
                yellowZone = Parse(camera.YellowZoneJson),
                redZone = Parse(camera.RedZoneJson)
            })
        };
    }

    private async Task ClearPrimary(Guid except, CancellationToken cancellationToken)
    {
        var others = await db.Cameras.Where(x => x.IsPrimary && x.Id != except).ToListAsync(cancellationToken);
        foreach (var other in others)
            other.IsPrimary = false;
    }

    private void SeedClassConfig(Guid cameraId, DateTimeOffset now)
    {
        foreach (var name in new[] { "person", "helmet", "goggles", "arc_suit", "arc_flash_shield", "arc_gloves", "boots" })
        {
            db.PpeConfigurations.Add(new PpeConfiguration
            {
                Id = Guid.NewGuid(),
                CameraId = cameraId,
                ClassName = name,
                CandidateConfidence = name is "goggles" or "arc_flash_shield" or "arc_gloves" ? 0.15 : 0.20,
                AssociationThreshold = 0.15,
                MinConsecutiveObservations = 3,
                ClearConsecutiveObservations = 5,
                Enabled = name != "boots",
                UpdatedAt = now
            });
        }
    }

    private async Task<Camera?> Find(string idOrCode, CancellationToken cancellationToken)
    {
        if (Guid.TryParse(idOrCode, out var id))
            return await db.Cameras.Include(x => x.Zone).FirstOrDefaultAsync(x => x.Id == id || x.Code == idOrCode, cancellationToken);
        return await db.Cameras.Include(x => x.Zone)
            .FirstOrDefaultAsync(x => x.Code == idOrCode || x.StreamName == idOrCode, cancellationToken);
    }

    private object ZonePayload(Camera camera) => new
    {
        cameraCode = camera.Code,
        cameraId = camera.Id,
        frameWidth = camera.FrameWidth,
        frameHeight = camera.FrameHeight,
        yellowZone = Parse(camera.YellowZoneJson),
        redZone = Parse(camera.RedZoneJson),
        yellowPolygon = Points(camera.YellowZoneJson),
        redPolygon = Points(camera.RedZoneJson)
    };

    private static string SerializeZone(JsonElement? zone)
    {
        if (zone is null || zone.Value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
            return EmptyPolygon();
        return zone.Value.GetRawText();
    }

    private static string EmptyPolygon() => """{"type":"polygon","points":[]}""";

    private static object Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return new { type = "polygon", points = Array.Empty<int[]>() };
        try
        {
            return JsonSerializer.Deserialize<JsonElement>(json);
        }
        catch (JsonException)
        {
            return new { type = "polygon", points = Array.Empty<int[]>() };
        }
    }

    private static object Points(string? json)
    {
        var points = Geometry.ParsePolygon(json);
        return points.Count < 3 ? Array.Empty<object>() : points.Select(p => new { x = p.X, y = p.Y }).ToArray();
    }

    private async Task PublishConfig(CancellationToken cancellationToken)
    {
        await nats.PublishAsync("ppe.v1.configuration.changed", new
        {
            eventId = Guid.NewGuid(),
            eventType = "ConfigurationChanged",
            schemaVersion = 1,
            occurredAt = DateTimeOffset.UtcNow
        }, cancellationToken);
    }
}

public sealed record CameraUpsert(Guid? Id, string Code, string Name, Guid ZoneId, string? RtspUrl, string? StreamUrl, bool? IsPrimary, bool? IsActive);

public sealed record ZoneUpsert(Guid? Id, string Code, string Name, string? Description, bool? IsActive);

public sealed record ZoneSave(int? FrameWidth, int? FrameHeight, JsonElement? YellowZone, JsonElement? RedZone);
