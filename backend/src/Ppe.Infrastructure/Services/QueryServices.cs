using System.Globalization;
using System.Text.Json;
using ClosedXML.Excel;
using Microsoft.EntityFrameworkCore;
using Ppe.Application;
using Ppe.Infrastructure.Persistence;

namespace Ppe.Infrastructure.Services;

public sealed class ViolationQueryService(AppDbContext db)
{
    public async Task<(IReadOnlyList<object> Items, PageMeta Meta)> SearchAsync(
        DateTime? from,
        DateTime? to,
        string? violationType,
        string? search,
        int page,
        int pageSize,
        CancellationToken cancellationToken)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize is < 1 or > 200 ? 20 : pageSize;
        var query = BaseQuery();
        if (from.HasValue)
        {
            var start = DateTime.SpecifyKind(from.Value.Date, DateTimeKind.Utc);
            query = query.Where(x => x.StartedAt >= start);
        }

        if (to.HasValue)
        {
            var end = DateTime.SpecifyKind(to.Value.Date.AddDays(1), DateTimeKind.Utc);
            query = query.Where(x => x.StartedAt < end);
        }

        var canonical = ViolationTypes.CanonicalFilter(violationType);
        if (canonical is not null)
            query = query.Where(x => x.ViolationType == canonical);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(x =>
                (x.WorkerName != null && x.WorkerName.ToLower().Contains(term))
                || (x.WorkerCode != null && x.WorkerCode.ToLower().Contains(term))
                || (x.Camera != null && x.Camera.Code.ToLower().Contains(term))
                || (x.MissingPpe != null && x.MissingPpe.ToLower().Contains(term)));
        }

        var total = await query.CountAsync(cancellationToken);
        List<Violation> rows;
        if (db.Database.ProviderName?.Contains("Sqlite", StringComparison.OrdinalIgnoreCase) == true)
        {
            var all = await query.ToListAsync(cancellationToken);
            rows = all.OrderByDescending(x => x.StartedAt).Skip((page - 1) * pageSize).Take(pageSize).ToList();
        }
        else
        {
            rows = await query.OrderByDescending(x => x.StartedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync(cancellationToken);
        }
        var pages = (int)Math.Ceiling(total / (double)pageSize);
        return (rows.Select(ViolationViews.ToDto).ToList(), new PageMeta(page, pageSize, total, pages));
    }

    public async Task<IReadOnlyList<object>> LatestAsync(int take, CancellationToken cancellationToken)
    {
        take = take is < 1 or > 100 ? 20 : take;
        var source = await BaseQuery().ToListAsync(cancellationToken);
        var rows = source.OrderByDescending(x => x.StartedAt).Take(take).ToList();
        return rows.Select(ViolationViews.ToDto).ToList();
    }

    public async Task<object?> GetAsync(Guid id, CancellationToken cancellationToken)
    {
        var row = await BaseQuery().FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        return row is null ? null : ViolationViews.ToDto(row);
    }

    public async Task<object> ReviewAsync(Guid id, string decision, string? reason, Guid? reviewerId, CancellationToken cancellationToken)
    {
        var row = await db.Violations.FirstOrDefaultAsync(x => x.Id == id, cancellationToken)
            ?? throw new AppException(404, "Violation was not found.");
        var normalized = decision.ToUpperInvariant();
        if (normalized is not ("ACCEPTED" or "REJECTED" or "RESOLVED"))
            throw new AppException(400, "Decision must be accept, reject, or resolve.", "decision");

        var allowed = row.Status switch
        {
            "OPEN" or "PENDING_REVIEW" => normalized is "ACCEPTED" or "REJECTED" or "RESOLVED",
            "ACCEPTED" => normalized == "RESOLVED",
            _ => false
        };
        if (!allowed)
            throw new AppException(409, $"Cannot {normalized.ToLowerInvariant()} a violation in status {row.Status}.", "status");

        row.Status = normalized;
        row.UpdatedAt = DateTimeOffset.UtcNow;
        if (normalized == "RESOLVED")
            row.ResolvedAt = row.UpdatedAt;
        db.ViolationReviews.Add(new ViolationReview
        {
            Id = Guid.NewGuid(),
            ViolationId = row.Id,
            ReviewerId = reviewerId,
            Decision = normalized,
            Reason = reason,
            CreatedAt = row.UpdatedAt
        });
        db.AuditEvents.Add(new AuditEvent
        {
            Id = Guid.NewGuid(),
            ActorType = "user",
            ActorId = reviewerId?.ToString(),
            Action = $"violation.{normalized.ToLowerInvariant()}",
            EntityType = "violation",
            EntityId = row.Id.ToString(),
            MetadataJson = reason,
            CreatedAt = row.UpdatedAt
        });
        await db.SaveChangesAsync(cancellationToken);
        return new { id = row.Id, status = row.Status };
    }

    public async Task<byte[]> ExportAsync(DateTime? from, DateTime? to, string? violationType, string? search, CancellationToken cancellationToken)
    {
        var (items, _) = await SearchAsync(from, to, violationType, search, 1, 200, cancellationToken);
        using var workbook = new XLWorkbook();
        var sheet = workbook.AddWorksheet("Violations");
        var headers = new[] { "Id", "DetectedAt", "Type", "Missing PPE", "Zone", "PPE Zone", "Worker", "Camera", "Severity", "Confidence", "Status" };
        for (var i = 0; i < headers.Length; i++)
            sheet.Cell(1, i + 1).Value = headers[i];

        var rowIndex = 2;
        foreach (var item in items)
        {
            var json = JsonSerializer.Serialize(item);
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            sheet.Cell(rowIndex, 1).Value = Text(root, "id");
            sheet.Cell(rowIndex, 2).Value = Text(root, "detectedAt");
            sheet.Cell(rowIndex, 3).Value = Text(root, "violationType");
            sheet.Cell(rowIndex, 4).Value = Text(root, "missingPpe");
            sheet.Cell(rowIndex, 5).Value = Text(root, "zoneName");
            sheet.Cell(rowIndex, 6).Value = Text(root, "ppeZone");
            sheet.Cell(rowIndex, 7).Value = Text(root, "workerName");
            sheet.Cell(rowIndex, 8).Value = Text(root, "cameraCode");
            sheet.Cell(rowIndex, 9).Value = Text(root, "severity");
            sheet.Cell(rowIndex, 10).Value = Text(root, "confidence");
            sheet.Cell(rowIndex, 11).Value = Text(root, "status");
            rowIndex++;
        }

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return stream.ToArray();
    }

    private static string Text(JsonElement root, string name) =>
        root.TryGetProperty(name, out var value) ? value.ToString() : "";

    private IQueryable<Violation> BaseQuery() =>
        db.Violations.Include(x => x.Camera).ThenInclude(x => x!.Zone).AsNoTracking();
}

public sealed class DashboardService(AppDbContext db, Microsoft.Extensions.Configuration.IConfiguration configuration)
{
    public async Task<object> KpisAsync(CancellationToken cancellationToken)
    {
        var today = DateTime.UtcNow.Date;
        var yesterday = today.AddDays(-1);
        var detections = await db.DailyStats.Where(x => x.Date == today).Select(x => x.Detections).FirstOrDefaultAsync(cancellationToken);
        var counts = await Counts(today, cancellationToken);
        var previous = await Counts(yesterday, cancellationToken);
        if (detections < counts.Values.Sum())
            detections = counts.Values.Sum();
        return new
        {
            helmet = Metric(counts, previous, "helmet", detections),
            gloves = Metric(counts, previous, "arc_gloves", detections),
            safetyGlasses = Metric(counts, previous, "goggles", detections),
            arcFlashSuit = Metric(counts, previous, "arc_suit", detections),
            arcFlashShield = Metric(counts, previous, "arc_flash_shield", detections),
            vest = Metric(counts, previous, "arc_flash_shield", detections),
            boots = Metric(counts, previous, "boots", detections)
        };
    }

    public async Task<object> StatisticsAsync(CancellationToken cancellationToken)
    {
        var today = DateTime.UtcNow.Date;
        var stat = await db.DailyStats.FirstOrDefaultAsync(x => x.Date == today, cancellationToken);
        var violations = await db.Violations.CountAsync(x => x.StartedAt >= today, cancellationToken);
        return new
        {
            totalViolationsToday = violations,
            totalDetectionsToday = Math.Max(stat?.Detections ?? 0, violations),
            onlineCameras = await db.Cameras.CountAsync(x => x.Status == "online", cancellationToken),
            totalCameras = await db.Cameras.CountAsync(cancellationToken),
            unreadNotifications = await db.Notifications.CountAsync(x => !x.IsRead, cancellationToken)
        };
    }

    public async Task<object> TrendsAsync(int days, CancellationToken cancellationToken)
    {
        days = days is < 1 or > 90 ? 14 : days;
        var start = DateTime.UtcNow.Date.AddDays(-(days - 1));
        var rows = await db.Violations.AsNoTracking()
            .Where(x => x.StartedAt >= start)
            .Select(x => new { x.StartedAt, x.ViolationType })
            .ToListAsync(cancellationToken);
        var series = new List<object>();
        for (var i = 0; i < days; i++)
        {
            var day = start.AddDays(i);
            var next = day.AddDays(1);
            var slice = rows.Where(x => x.StartedAt >= day && x.StartedAt < next).ToList();
            int Count(string type) => slice.Count(x => x.ViolationType == type);
            var helmet = Count("helmet");
            var gloves = Count("arc_gloves");
            var glasses = Count("goggles");
            var suit = Count("arc_suit");
            var shield = Count("arc_flash_shield");
            var boots = Count("boots");
            series.Add(new
            {
                date = day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                helmet,
                gloves,
                safetyGlasses = glasses,
                arcFlashSuit = suit,
                arcFlashShield = shield,
                boots,
                total = helmet + gloves + glasses + suit + shield + boots
            });
        }

        return new { series };
    }

    public async Task<object> LiveAsync(CancellationToken cancellationToken)
    {
        var camera = await db.Cameras.Include(x => x.Zone).FirstOrDefaultAsync(x => x.IsPrimary, cancellationToken)
            ?? await db.Cameras.Include(x => x.Zone).OrderBy(x => x.Code).FirstOrDefaultAsync(cancellationToken);
        object? primary = null;
        if (camera is not null)
        {
            var webrtc = configuration["MediaMtx:WebrtcPublicBase"] ?? "http://127.0.0.1:8889";
            var playback = CameraViews.Playback(camera, webrtc);
            primary = new
            {
                id = camera.Id,
                code = camera.Code,
                name = camera.Name,
                zoneName = camera.Zone?.Name,
                status = camera.Status,
                whepUrl = playback.WhepUrl,
                streamUrl = camera.StreamUrl ?? playback.WhepUrl,
                videoUrl = playback.VideoUrl,
                protocol = playback.Protocol,
                frameWidth = camera.FrameWidth,
                frameHeight = camera.FrameHeight,
                stream = new { whepUrl = playback.WhepUrl, url = camera.StreamUrl, protocol = playback.Protocol }
            };
        }

        var latest = await db.Violations.Include(x => x.Camera).ThenInclude(c => c!.Zone)
            .OrderByDescending(x => x.StartedAt)
            .Take(20)
            .ToListAsync(cancellationToken);
        return new
        {
            primaryCamera = primary,
            latestAlerts = latest.Select(ViolationViews.ToDto).ToList(),
            kpiSummary = await KpisAsync(cancellationToken)
        };
    }

    private async Task<Dictionary<string, int>> Counts(DateTime day, CancellationToken cancellationToken)
    {
        var next = day.AddDays(1);
        var grouped = await db.Violations.AsNoTracking()
            .Where(x => x.StartedAt >= day && x.StartedAt < next)
            .GroupBy(x => x.ViolationType)
            .Select(g => new { g.Key, Count = g.Count() })
            .ToListAsync(cancellationToken);
        return grouped.ToDictionary(x => x.Key, x => x.Count);
    }

    private static object Metric(Dictionary<string, int> today, Dictionary<string, int> yesterday, string key, int detections)
    {
        today.TryGetValue(key, out var count);
        yesterday.TryGetValue(key, out var previous);
        var rate = detections <= 0 ? 0 : Math.Round(count * 100.0 / detections, 1);
        var trend = previous == 0 ? (count > 0 ? 100 : 0) : Math.Round((count - previous) * 100.0 / previous, 1);
        return new { rawEventCount = count, violationRate = rate, trendPercent = trend };
    }
}

public sealed class NotificationService(AppDbContext db)
{
    public async Task<(IReadOnlyList<object> Items, PageMeta Meta)> ListAsync(int page, int pageSize, CancellationToken cancellationToken)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize is < 1 or > 200 ? 20 : pageSize;
        var query = db.Notifications.AsNoTracking().OrderByDescending(x => x.CreatedAt);
        var total = await query.CountAsync(cancellationToken);
        var rows = await query.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(cancellationToken);
        var pages = (int)Math.Ceiling(total / (double)pageSize);
        return (rows.Select(Map).ToList(), new PageMeta(page, pageSize, total, pages));
    }

    public Task<int> UnreadAsync(CancellationToken cancellationToken) =>
        db.Notifications.CountAsync(x => !x.IsRead, cancellationToken);

    public async Task MarkReadAsync(Guid id, CancellationToken cancellationToken)
    {
        var row = await db.Notifications.FirstOrDefaultAsync(x => x.Id == id, cancellationToken)
            ?? throw new AppException(404, "Notification was not found.");
        row.IsRead = true;
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task SetStatusAsync(Guid id, string status, CancellationToken cancellationToken)
    {
        var row = await db.Notifications.FirstOrDefaultAsync(x => x.Id == id, cancellationToken)
            ?? throw new AppException(404, "Notification was not found.");
        row.Status = status;
        row.IsRead = true;
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task MarkAllReadAsync(CancellationToken cancellationToken)
    {
        await db.Notifications.Where(x => !x.IsRead).ExecuteUpdateAsync(s => s.SetProperty(x => x.IsRead, true), cancellationToken);
    }

    private static object Map(Notification n) => new
    {
        id = n.Id,
        title = n.Title,
        message = n.Message,
        isRead = n.IsRead,
        status = n.Status,
        severity = n.Severity,
        createdAt = n.CreatedAt,
        detectionLogId = n.ViolationId
    };
}

public sealed class CaptureService(AppDbContext db, Microsoft.Extensions.Configuration.IConfiguration configuration)
{
    public async Task<(IReadOnlyList<object> Items, PageMeta Meta)> ListAsync(string? cameraCode, Guid? detectionLogId, int page, int pageSize, CancellationToken cancellationToken)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize is < 1 or > 100 ? 20 : pageSize;
        var query = db.Captures.Include(x => x.Camera).AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(cameraCode))
            query = query.Where(x => x.Camera != null && x.Camera.Code == cameraCode);
        if (detectionLogId.HasValue)
            query = query.Where(x => x.ViolationId == detectionLogId);
        var total = await query.CountAsync(cancellationToken);
        var rows = await query.OrderByDescending(x => x.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(cancellationToken);
        return (rows.Select(Map).ToList(), new PageMeta(page, pageSize, total, Math.Max(1, (int)Math.Ceiling(total / (double)pageSize))));
    }

    public async Task<object> SaveUploadAsync(Guid cameraId, string cameraCode, byte[] bytes, string extension, CancellationToken cancellationToken)
    {
        var root = configuration["Media:Root"] ?? "data/media";
        var id = Guid.NewGuid();
        var relative = $"snapshots/{cameraCode}/{id}{extension}";
        var full = Path.Combine(root, relative.Replace('/', Path.DirectorySeparatorChar));
        Directory.CreateDirectory(Path.GetDirectoryName(full)!);
        await File.WriteAllBytesAsync(full, bytes, cancellationToken);
        var capture = new Capture
        {
            Id = id,
            CameraId = cameraId,
            StorageKey = relative,
            ImageUrl = relative,
            CreatedAt = DateTimeOffset.UtcNow
        };
        db.Captures.Add(capture);
        await db.SaveChangesAsync(cancellationToken);
        return Map(capture);
    }

    private static object Map(Capture capture) => new
    {
        id = capture.Id,
        cameraCode = capture.Camera?.Code,
        detectionLogId = capture.ViolationId,
        imageUrl = capture.ImageUrl ?? capture.StorageKey,
        storageKey = capture.StorageKey,
        imagePath = capture.StorageKey,
        createdAt = capture.CreatedAt
    };
}
