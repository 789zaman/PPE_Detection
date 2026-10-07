using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Ppe.Api.Middleware;
using Ppe.Application;
using Ppe.Infrastructure.Services;

namespace Ppe.Api.Controllers;

[ApiController]
[AllowAnonymous]
[Route("internal/ai")]
public sealed class InternalAiController(
    IConfiguration configuration,
    IViolationIngestion ingest,
    CameraService cameras) : ControllerBase
{
    [HttpPost("workers/heartbeat")]
    public async Task<IActionResult> Heartbeat([FromBody] WorkerStatusEvent evt, CancellationToken cancellationToken)
    {
        if (!Authorized())
            return Unauthorized();
        await ingest.IngestWorkerStatusAsync(evt, cancellationToken);
        return Ok(Envelope.Ok(true));
    }

    [HttpPost("configuration/reload")]
    public async Task<IActionResult> Reload(CancellationToken cancellationToken)
    {
        if (!Authorized())
            return Unauthorized();
        return Ok(Envelope.Ok(await cameras.AiConfigurationAsync(cancellationToken)));
    }

    [HttpGet("configuration")]
    public async Task<IActionResult> Configuration(CancellationToken cancellationToken)
    {
        if (!Authorized())
            return Unauthorized();
        return Ok(Envelope.Ok(await cameras.AiConfigurationAsync(cancellationToken)));
    }

    [HttpPost("events/violation")]
    public async Task<IActionResult> Violation([FromBody] ViolationEvent evt, CancellationToken cancellationToken)
    {
        if (!Authorized())
            return Unauthorized();
        var outcome = await ingest.IngestAsync(evt, cancellationToken);
        return Ok(Envelope.Ok(outcome.ToString()));
    }

    private bool Authorized()
    {
        var expected = configuration["Internal:Token"];
        if (string.IsNullOrWhiteSpace(expected))
            return false;
        return Request.Headers.TryGetValue("X-Internal-Token", out var token) && token == expected;
    }
}
