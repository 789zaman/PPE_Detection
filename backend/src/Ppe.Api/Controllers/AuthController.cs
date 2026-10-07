using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Ppe.Api.Auth;
using Ppe.Api.Middleware;

namespace Ppe.Api.Controllers;

[ApiController]
[Route("api/v1/auth")]
public sealed class AuthController(AuthService auth) : ControllerBase
{
    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request, CancellationToken cancellationToken)
    {
        var data = await auth.RegisterAsync(request, cancellationToken);
        return Ok(data);
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login([FromBody] LoginRequest request, CancellationToken cancellationToken)
    {
        var data = await auth.LoginAsync(request, cancellationToken);
        return Ok(Envelope.Ok(data));
    }

    [HttpPost("refresh")]
    [AllowAnonymous]
    public async Task<IActionResult> Refresh([FromBody] RefreshRequest request, CancellationToken cancellationToken)
    {
        var data = await auth.RefreshAsync(request.RefreshToken, cancellationToken);
        return Ok(Envelope.Ok(data));
    }

    [Authorize]
    [HttpGet("me")]
    public IActionResult Me() => Ok(Envelope.Ok(auth.Me(User)));

    [Authorize]
    [HttpPost("hub-connection-token")]
    public IActionResult HubToken() => Ok(Envelope.Ok(new { accessToken = auth.HubToken(User) }));
}
