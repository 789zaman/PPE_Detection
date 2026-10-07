using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.IdentityModel.Tokens;
using Ppe.Api.Auth;
using Ppe.Api.Hubs;
using Ppe.Api.Middleware;
using Ppe.Api.Realtime;
using Ppe.Application;
using Ppe.Infrastructure.Nats;
using Ppe.Infrastructure.Persistence;
using Ppe.Infrastructure.Services;
using Ppe.Infrastructure.Streaming;

var builder = WebApplication.CreateBuilder(args);

builder.Logging.ClearProviders();
builder.Logging.AddJsonConsole(o =>
{
    o.IncludeScopes = true;
    o.TimestampFormat = "O";
});

builder.Services.AddControllers().AddJsonOptions(o =>
{
    o.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
});
builder.Services.AddSignalR();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddOpenApi();

var jwtKey = builder.Configuration["Jwt:Key"] ?? "dev-only-change-me-please-use-32-chars!";
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "ppe",
            ValidAudience = builder.Configuration["Jwt:Audience"] ?? "ppe",
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
        };
        o.Events = new JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                var token = ctx.Request.Query["access_token"];
                if (!string.IsNullOrEmpty(token) && ctx.HttpContext.Request.Path.StartsWithSegments("/hubs"))
                    ctx.Token = token;
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization(o =>
{
    o.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build();
    o.AddPolicy("Manage", p => p.RequireAssertion(ctx =>
        ctx.User.IsInRole("Super_Admin") || ctx.User.IsInRole("Administrator") || ctx.User.IsInRole("Supervisor")));
    o.AddPolicy("Review", p => p.RequireAssertion(ctx =>
        ctx.User.IsInRole("Super_Admin") || ctx.User.IsInRole("Administrator") || ctx.User.IsInRole("Supervisor") || ctx.User.IsInRole("Reviewer")));
    o.AddPolicy("SuperAdmin", p => p.RequireRole("Super_Admin"));
});

var origins = (builder.Configuration["Cors:Origins"] ?? "http://localhost:4200")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
builder.Services.AddCors(o => o.AddPolicy("ui", p =>
{
    if (builder.Environment.IsDevelopment() || builder.Environment.IsEnvironment("Testing"))
        p.SetIsOriginAllowed(origin =>
            {
                if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri))
                    return false;
                return uri.IsLoopback;
            })
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    else
        p.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod().AllowCredentials();
}));

var provider = builder.Configuration["Database:Provider"] ?? "Postgres";
builder.Services.AddDbContext<AppDbContext>(o =>
{
    if (string.Equals(provider, "Sqlite", StringComparison.OrdinalIgnoreCase))
        o.UseSqlite(builder.Configuration.GetConnectionString("Sqlite") ?? "Data Source=ppe-dev.db");
    else
        o.UseNpgsql(builder.Configuration.GetConnectionString("Postgres"));
});

builder.Services.AddHttpClient("mediamtx", c => c.Timeout = TimeSpan.FromSeconds(5));
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<CameraService>();
builder.Services.AddScoped<DashboardService>();
builder.Services.AddScoped<ViolationQueryService>();
builder.Services.AddScoped<NotificationService>();
builder.Services.AddScoped<CaptureService>();
builder.Services.AddScoped<IViolationIngestion, ViolationIngestionService>();
builder.Services.AddScoped<IMediaMtxRegistrar, MediaMtxRegistrar>();
builder.Services.AddSingleton<IRealtimeNotifier, SignalRNotifier>();
builder.Services.AddSingleton<NatsEventService>();
builder.Services.AddSingleton<INatsPublisher>(sp => sp.GetRequiredService<NatsEventService>());
if (!builder.Environment.IsEnvironment("Testing") && builder.Configuration.GetValue("Nats:Enabled", true))
    builder.Services.AddHostedService(sp => sp.GetRequiredService<NatsEventService>());

builder.Services.AddHealthChecks()
    .AddCheck("self", () => HealthCheckResult.Healthy(), tags: ["live"])
    .AddCheck<DatabaseHealthCheck>("database", tags: ["ready"])
    .AddCheck<NatsHealthCheck>("nats", tags: ["ready"]);

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var log = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("startup");
    await DbInitializer.InitializeAsync(db, app.Configuration, log);
}

app.UseMiddleware<CorrelationMiddleware>();
app.UseMiddleware<ErrorMiddleware>();
if (!app.Environment.IsEnvironment("Testing"))
{
    app.MapOpenApi().AllowAnonymous();
}
app.UseCors("ui");
app.UseAuthentication();
app.UseAuthorization();

var mediaRoot = app.Configuration["Media:Root"] ?? Path.Combine(app.Environment.ContentRootPath, "data", "media");
Directory.CreateDirectory(mediaRoot);
app.UseStaticFiles(new StaticFileOptions
{
    RequestPath = "/snapshots",
    FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(
        Directory.CreateDirectory(Path.Combine(mediaRoot, "snapshots")).FullName)
});
app.UseStaticFiles(new StaticFileOptions
{
    RequestPath = "/captures",
    FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(
        Directory.CreateDirectory(Path.Combine(mediaRoot, "snapshots")).FullName)
});

app.MapControllers();
app.MapHub<PpeComplianceHub>("/hubs/ppe-compliance");
app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = r => r.Tags.Contains("live") }).AllowAnonymous();
app.MapHealthChecks("/health/ready", new HealthCheckOptions { Predicate = r => r.Tags.Contains("ready") }).AllowAnonymous();
app.MapHealthChecks("/health").AllowAnonymous();
app.MapGet("/api/health", () => Results.Redirect("/health")).AllowAnonymous();
app.MapGet("/api/health/ready", () => Results.Redirect("/health/ready")).AllowAnonymous();

app.Logger.LogInformation("backend_listening");
app.Run();

public sealed class DatabaseHealthCheck(AppDbContext db) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        return await db.Database.CanConnectAsync(cancellationToken)
            ? HealthCheckResult.Healthy("database")
            : HealthCheckResult.Unhealthy("database");
    }
}

public sealed class NatsHealthCheck(INatsPublisher nats, IConfiguration configuration) : IHealthCheck
{
    public Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        if (!configuration.GetValue("Nats:Enabled", true))
            return Task.FromResult(HealthCheckResult.Healthy("nats disabled"));
        return Task.FromResult(nats.IsConnected ? HealthCheckResult.Healthy("nats") : HealthCheckResult.Degraded("nats disconnected"));
    }
}

public partial class Program;
