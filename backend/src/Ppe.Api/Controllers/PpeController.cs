using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Ppe.Api.Middleware;
using Ppe.Infrastructure.Persistence;
using Ppe.Infrastructure.Services;

namespace Ppe.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/ppe")]
public sealed class PpeController(
    CameraService cameras,
    DashboardService dashboard,
    ViolationQueryService violations,
    NotificationService notifications,
    CaptureService captures,
    AppDbContext db,
    IWebHostEnvironment environment) : ControllerBase
{
    [HttpGet("dashboard/kpis")]
    public async Task<IActionResult> Kpis(CancellationToken cancellationToken) =>
        Ok(Envelope.Ok(await dashboard.KpisAsync(cancellationToken)));

    [HttpGet("dashboard/live")]
    public async Task<IActionResult> Live(CancellationToken cancellationToken) =>
        Ok(Envelope.Ok(await dashboard.LiveAsync(cancellationToken)));

    [HttpGet("dashboard/alerts")]
    public async Task<IActionResult> Alerts([FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken cancellationToken = default)
    {
        var (items, meta) = await violations.SearchAsync(null, null, null, null, page, pageSize, cancellationToken);
        return Ok(Envelope.Ok(items, meta: Envelope.PageMeta(meta)));
    }

    [HttpGet("dashboard/statistics")]
    public async Task<IActionResult> Statistics(CancellationToken cancellationToken) =>
        Ok(Envelope.Ok(await dashboard.StatisticsAsync(cancellationToken)));

    [HttpGet("dashboard/trends")]
    public async Task<IActionResult> Trends([FromQuery] int days = 14, CancellationToken cancellationToken = default) =>
        Ok(Envelope.Ok(await dashboard.TrendsAsync(days, cancellationToken)));

    [HttpGet("cameras")]
    public async Task<IActionResult> Cameras(CancellationToken cancellationToken) =>
        Ok(Envelope.Ok(await cameras.ListAsync(cancellationToken)));

    [HttpGet("cameras/status")]
    public async Task<IActionResult> CameraStatus(CancellationToken cancellationToken) =>
        Ok(Envelope.Ok(await cameras.StatusAsync(cancellationToken)));

    [HttpGet("cameras/zones")]
    public async Task<IActionResult> PlantZones(CancellationToken cancellationToken) =>
        Ok(Envelope.Ok(await cameras.ListZonesAsync(cancellationToken)));

    [HttpPost("cameras/zones")]
    [Authorize(Policy = "Manage")]
    public async Task<IActionResult> UpsertPlantZone([FromBody] ZoneUpsert request, CancellationToken cancellationToken) =>
        Ok(Envelope.Ok(await cameras.UpsertZoneAsync(request, cancellationToken)));

    [HttpPost("cameras")]
    [Authorize(Policy = "Manage")]
    public async Task<IActionResult> UpsertCamera([FromBody] CameraUpsert request, CancellationToken cancellationToken) =>
        Ok(Envelope.Ok(await cameras.UpsertAsync(request, ActorId(), cancellationToken)));

    [HttpDelete("cameras/{id:guid}")]
    [Authorize(Policy = "SuperAdmin")]
    public async Task<IActionResult> DeleteCamera(Guid id, CancellationToken cancellationToken)
    {
        await cameras.DeleteAsync(id, cancellationToken);
        return Ok(Envelope.Ok(true));
    }

    [HttpPost("cameras/{id:guid}/primary")]
    [Authorize(Policy = "Manage")]
    public async Task<IActionResult> Primary(Guid id, CancellationToken cancellationToken)
    {
        await cameras.SetPrimaryAsync(id, cancellationToken);
        return Ok(Envelope.Ok(true));
    }

    [HttpGet("cameras/{code}/zones")]
    public async Task<IActionResult> RoiZones(string code, CancellationToken cancellationToken)
    {
        var data = await cameras.ZonesAsync(code, cancellationToken);
        return data is null ? NotFound(Envelope.Ok<object?>(null, "Camera was not found.")) : Ok(Envelope.Ok(data));
    }

    [HttpPut("cameras/{code}/zones")]
    [Authorize(Policy = "Manage")]
    public async Task<IActionResult> SaveRoi(string code, [FromBody] JsonElement body, CancellationToken cancellationToken)
    {
        var request = ParseZones(body);
        return Ok(Envelope.Ok(await cameras.SaveZonesAsync(code, request, ActorId(), cancellationToken)));
    }

    [HttpGet("cameras/{idOrCode}/stream")]
    public async Task<IActionResult> Stream(string idOrCode, CancellationToken cancellationToken)
    {
        var data = await cameras.StreamAsync(idOrCode, cancellationToken);
        return data is null ? NotFound(Envelope.Ok<object?>(null, "Camera was not found.")) : Ok(Envelope.Ok(data));
    }

    [HttpGet("violations")]
    public async Task<IActionResult> Violations(
        [FromQuery] DateTime? dateFrom,
        [FromQuery] DateTime? dateTo,
        [FromQuery] string? violationType,
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 60,
        CancellationToken cancellationToken = default)
    {
        var (items, meta) = await violations.SearchAsync(dateFrom, dateTo, violationType, search, page, pageSize, cancellationToken);
        return Ok(Envelope.Ok(items, meta: Envelope.PageMeta(meta)));
    }

    [HttpGet("violations/latest")]
    public async Task<IActionResult> Latest([FromQuery] int take = 20, CancellationToken cancellationToken = default) =>
        Ok(Envelope.Ok(await violations.LatestAsync(take, cancellationToken)));

    [HttpGet("violations/{id:guid}")]
    public async Task<IActionResult> Violation(Guid id, CancellationToken cancellationToken)
    {
        var data = await violations.GetAsync(id, cancellationToken);
        return data is null ? NotFound(Envelope.Ok<object?>(null, "Violation was not found.")) : Ok(Envelope.Ok(data));
    }

    [HttpPost("violations/{id:guid}/accept")]
    [Authorize(Policy = "Review")]
    public async Task<IActionResult> Accept(Guid id, CancellationToken cancellationToken) =>
        Ok(Envelope.Ok(await violations.ReviewAsync(id, "ACCEPTED", null, UserGuid(), cancellationToken)));

    [HttpPost("violations/{id:guid}/reject")]
    [Authorize(Policy = "Review")]
    public async Task<IActionResult> Reject(Guid id, [FromBody] ReviewBody? body, CancellationToken cancellationToken = default) =>
        Ok(Envelope.Ok(await violations.ReviewAsync(id, "REJECTED", body?.Reason, UserGuid(), cancellationToken)));

    [HttpPost("violations/{id:guid}/resolve")]
    [Authorize(Policy = "Review")]
    public async Task<IActionResult> Resolve(Guid id, CancellationToken cancellationToken) =>
        Ok(Envelope.Ok(await violations.ReviewAsync(id, "RESOLVED", null, UserGuid(), cancellationToken)));

    [HttpGet("violations/export")]
    public async Task<IActionResult> Export(
        [FromQuery] DateTime? dateFrom,
        [FromQuery] DateTime? dateTo,
        [FromQuery] string? violationType,
        [FromQuery] string? search,
        CancellationToken cancellationToken)
    {
        var bytes = await violations.ExportAsync(dateFrom, dateTo, violationType, search, cancellationToken);
        return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "violations.xlsx");
    }

    [HttpGet("notifications")]
    public async Task<IActionResult> Notifications([FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken cancellationToken = default)
    {
        var (items, meta) = await notifications.ListAsync(page, pageSize, cancellationToken);
        return Ok(Envelope.Ok(items, meta: Envelope.PageMeta(meta)));
    }

    [HttpGet("notifications/unread-count")]
    public async Task<IActionResult> Unread(CancellationToken cancellationToken) =>
        Ok(Envelope.Ok(new { count = await notifications.UnreadAsync(cancellationToken) }));

    [HttpPost("notifications/{id:guid}/read")]
    public async Task<IActionResult> Read(Guid id, CancellationToken cancellationToken)
    {
        await notifications.MarkReadAsync(id, cancellationToken);
        return Ok(Envelope.Ok(true));
    }

    [HttpPost("notifications/{id:guid}/acknowledge")]
    public async Task<IActionResult> Ack(Guid id, CancellationToken cancellationToken)
    {
        await notifications.SetStatusAsync(id, "acknowledged", cancellationToken);
        return Ok(Envelope.Ok(true));
    }

    [HttpPost("notifications/{id:guid}/resolve")]
    public async Task<IActionResult> ResolveNote(Guid id, CancellationToken cancellationToken)
    {
        await notifications.SetStatusAsync(id, "resolved", cancellationToken);
        return Ok(Envelope.Ok(true));
    }

    [HttpPost("notifications/read-all")]
    public async Task<IActionResult> ReadAll(CancellationToken cancellationToken)
    {
        await notifications.MarkAllReadAsync(cancellationToken);
        return Ok(Envelope.Ok(true));
    }

    [HttpGet("captures")]
    public async Task<IActionResult> Captures([FromQuery] string? cameraCode, [FromQuery] Guid? detectionLogId, [FromQuery] int page = 1, [FromQuery] int pageSize = 5, CancellationToken cancellationToken = default)
    {
        var (items, meta) = await captures.ListAsync(cameraCode, detectionLogId, page, pageSize, cancellationToken);
        return Ok(Envelope.Ok(items, meta: Envelope.PageMeta(meta)));
    }

    [HttpPost("captures")]
    [Authorize(Policy = "Manage")]
    [RequestSizeLimit(8_000_000)]
    public async Task<IActionResult> Upload(CancellationToken cancellationToken)
    {
        var code = Request.Form["cameraCode"].FirstOrDefault() ?? Request.Form["CameraCode"].FirstOrDefault();
        var file = Request.Form.Files.FirstOrDefault();
        if (string.IsNullOrWhiteSpace(code) || file is null)
            return BadRequest(Envelope.Ok<object?>(null, "cameraCode and file are required."));
        var camera = await db.Cameras.FirstOrDefaultAsync(x => x.Code == code, cancellationToken);
        if (camera is null)
            return NotFound(Envelope.Ok<object?>(null, "Camera was not found."));
        await using var stream = new MemoryStream();
        await file.CopyToAsync(stream, cancellationToken);
        var ext = Path.GetExtension(file.FileName);
        if (string.IsNullOrWhiteSpace(ext))
            ext = ".jpg";
        return Ok(Envelope.Ok(await captures.SaveUploadAsync(camera.Id, camera.Code, stream.ToArray(), ext, cancellationToken)));
    }

    [HttpGet("configuration")]
    [Authorize(Policy = "Manage")]
    public IActionResult GetConfig() => Ok(Envelope.Ok(new
    {
        environment = environment.EnvironmentName,
        shockingBoundary = new
        {
            outside = new[] { "helmet", "goggles" },
            inside = new[] { "helmet", "goggles", "arc_flash_shield" },
            bootsExempt = true
        }
    }));

    [HttpPut("configuration")]
    [Authorize(Policy = "Manage")]
    public IActionResult PutConfig() => Ok(Envelope.Ok(true, "PPE rules are configuration-driven in the AI worker. Zone polygons are saved per camera."));

    private string ActorId() => User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "unknown";
    private Guid? UserGuid() => Guid.TryParse(ActorId(), out var id) ? id : null;

    private static ZoneSave ParseZones(JsonElement body)
    {
        JsonElement? yellow = Get(body, "yellowZone") ?? Get(body, "yellowPolygon");
        JsonElement? red = Get(body, "redZone") ?? Get(body, "redPolygon");
        int? fw = body.TryGetProperty("frameWidth", out var w) && w.ValueKind == JsonValueKind.Number ? w.GetInt32() : null;
        int? fh = body.TryGetProperty("frameHeight", out var h) && h.ValueKind == JsonValueKind.Number ? h.GetInt32() : null;
        return new ZoneSave(fw, fh, yellow, red);
    }

    private static JsonElement? Get(JsonElement body, string name) =>
        body.TryGetProperty(name, out var value) ? value : null;
}

public sealed record ReviewBody(string? Reason);
