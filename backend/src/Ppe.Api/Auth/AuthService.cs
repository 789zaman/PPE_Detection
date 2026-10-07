using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Ppe.Application;
using Ppe.Infrastructure.Persistence;

namespace Ppe.Api.Auth;

public sealed class AuthService(AppDbContext db, IConfiguration configuration)
{
    private readonly PasswordHasher<string> _hasher = new();

    public async Task<object> RegisterAsync(RegisterRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.FullName) || string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
            throw new AppException(400, "Full name, email, and password are required.");
        if (request.Password != request.ConfirmPassword)
            throw new AppException(400, "Passwords do not match.", "confirmPassword");
        if (request.Password.Length < 8)
            throw new AppException(400, "Password must be at least 8 characters.", "password");
        if (await db.Users.AnyAsync(cancellationToken))
            throw new AppException(403, "Registration is only allowed for the first Super Admin.");

        var user = new AppUser
        {
            Id = Guid.NewGuid(),
            FullName = request.FullName.Trim(),
            Email = request.Email.Trim().ToLowerInvariant(),
            PasswordHash = _hasher.HashPassword(request.Email, request.Password),
            Role = "Super_Admin",
            CreatedAt = DateTimeOffset.UtcNow
        };
        db.Users.Add(user);
        var tokens = await IssueAsync(user, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        return AuthBody(user, tokens.Access, tokens.Refresh, tokens.Expires);
    }

    public async Task<object> LoginAsync(LoginRequest request, CancellationToken cancellationToken)
    {
        var email = (request.Email ?? "").Trim().ToLowerInvariant();
        var user = await db.Users.FirstOrDefaultAsync(x => x.Email == email, cancellationToken)
            ?? throw new AppException(401, "Invalid email or password.");
        var result = _hasher.VerifyHashedPassword(user.Email, user.PasswordHash, request.Password ?? "");
        if (result == PasswordVerificationResult.Failed)
            throw new AppException(401, "Invalid email or password.");
        var tokens = await IssueAsync(user, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        return AuthBody(user, tokens.Access, tokens.Refresh, tokens.Expires);
    }

    public async Task<object> RefreshAsync(string? refreshToken, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(refreshToken))
            throw new AppException(401, "No refresh token available.");
        var row = await db.RefreshTokens.Include(x => x.User)
            .FirstOrDefaultAsync(x => x.Token == refreshToken && x.RevokedAt == null, cancellationToken)
            ?? throw new AppException(401, "Session expired. Please sign in again.");
        if (row.ExpiresAt < DateTimeOffset.UtcNow || row.User is null)
            throw new AppException(401, "Session expired. Please sign in again.");
        row.RevokedAt = DateTimeOffset.UtcNow;
        var tokens = await IssueAsync(row.User, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        return AuthBody(row.User, tokens.Access, tokens.Refresh, tokens.Expires);
    }

    public object Me(ClaimsPrincipal principal)
    {
        var user = UserFrom(principal);
        return new
        {
            userId = user.Id,
            id = user.Id,
            fullName = user.FullName,
            email = user.Email,
            roles = Roles(user.Role),
            permissions = Permissions(user.Role),
            actions = Permissions(user.Role)
        };
    }

    public string HubToken(ClaimsPrincipal principal)
    {
        var user = UserFrom(principal);
        return CreateJwt(user, TimeSpan.FromMinutes(5));
    }

    private static AppUser UserFrom(ClaimsPrincipal principal)
    {
        var id = principal.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? throw new AppException(401, "Not authenticated.");
        return new AppUser
        {
            Id = Guid.Parse(id),
            FullName = principal.FindFirstValue(ClaimTypes.Name) ?? "",
            Email = principal.FindFirstValue(ClaimTypes.Email) ?? "",
            Role = principal.FindFirstValue(ClaimTypes.Role) ?? "Viewer"
        };
    }

    private async Task<(string Access, string Refresh, DateTimeOffset Expires)> IssueAsync(AppUser user, CancellationToken cancellationToken)
    {
        var expires = DateTimeOffset.UtcNow.AddHours(8);
        var access = CreateJwt(user, TimeSpan.FromHours(8));
        var refresh = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        db.RefreshTokens.Add(new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Token = refresh,
            ExpiresAt = DateTimeOffset.UtcNow.AddDays(7),
            CreatedAt = DateTimeOffset.UtcNow
        });
        await Task.CompletedTask;
        return (access, refresh, expires);
    }

    private string CreateJwt(AppUser user, TimeSpan lifetime)
    {
        var key = configuration["Jwt:Key"] ?? throw new InvalidOperationException("Jwt:Key is required.");
        var creds = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)), SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: configuration["Jwt:Issuer"] ?? "ppe",
            audience: configuration["Jwt:Audience"] ?? "ppe",
            claims:
            [
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Name, user.FullName),
                new Claim(ClaimTypes.Email, user.Email),
                new Claim(ClaimTypes.Role, user.Role)
            ],
            expires: DateTime.UtcNow.Add(lifetime),
            signingCredentials: creds);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static object AuthBody(AppUser user, string token, string refresh, DateTimeOffset expires) => new
    {
        token,
        accessToken = token,
        refreshToken = refresh,
        expiresAt = expires,
        userId = user.Id,
        fullName = user.FullName,
        email = user.Email,
        roles = Roles(user.Role),
        permissions = Permissions(user.Role),
        actions = Permissions(user.Role)
    };

    public static string[] Roles(string role) => [role];

    public static string[] Permissions(string role) => role switch
    {
        "Super_Admin" or "Administrator" or "Supervisor" => ["ppe:view", "ppe:manage", "ppe:review"],
        "Reviewer" => ["ppe:view", "ppe:review"],
        _ => ["ppe:view"]
    };
}

public sealed record LoginRequest(string? Email, string? Password);
public sealed record RegisterRequest(string? FullName, string? Email, string? Password, string? ConfirmPassword);
public sealed record RefreshRequest(string? RefreshToken);
