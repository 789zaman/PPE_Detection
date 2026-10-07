using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Ppe.Application;
using Ppe.Domain;

namespace Ppe.Tests;

public sealed class ComplianceTests
{
    private static readonly Point[] Shock =
    [
        new(0, 0), new(100, 0), new(100, 100), new(0, 100)
    ];

    [Fact]
    public void Outside_only_helmet_and_goggles()
    {
        var zone = ComplianceEngine.Classify(new Point(200, 200), [Shock]);
        Assert.Equal(FloorZone.Outside, zone);
        var decisions = ComplianceEngine.Evaluate(zone, new HashSet<string>());
        Assert.Contains(decisions, d => d.ViolationType == PpeClasses.Helmet);
        Assert.Contains(decisions, d => d.ViolationType == PpeClasses.Goggles);
        Assert.DoesNotContain(decisions, d => d.ViolationType == PpeClasses.ArcFlashShield);
        Assert.DoesNotContain(decisions, d => d.ViolationType == PpeClasses.ArcSuit);
        Assert.DoesNotContain(decisions, d => d.ViolationType == PpeClasses.Boots);
    }

    [Fact]
    public void Shocking_missing_shield_is_one_arc_violation()
    {
        var zone = ComplianceEngine.Classify(new Point(50, 50), [Shock]);
        Assert.Equal(FloorZone.Shocking, zone);
        var present = new HashSet<string> { PpeClasses.Helmet, PpeClasses.Goggles, PpeClasses.ArcSuit, PpeClasses.ArcGloves };
        var decisions = ComplianceEngine.Evaluate(zone, present);
        Assert.Single(decisions);
        Assert.Equal(PpeClasses.ArcFlashShield, decisions[0].ViolationType);
        Assert.True(decisions[0].IsImmediate);
    }

    [Fact]
    public void Shield_present_is_arc_compliant()
    {
        var decisions = ComplianceEngine.Evaluate(FloorZone.Shocking, new HashSet<string>
        {
            PpeClasses.Helmet, PpeClasses.Goggles, PpeClasses.ArcFlashShield
        });
        Assert.Empty(decisions);
    }

    [Fact]
    public void Boots_never_appear()
    {
        var decisions = ComplianceEngine.Evaluate(FloorZone.Shocking, new HashSet<string>());
        Assert.DoesNotContain(decisions, d => d.ViolationType == PpeClasses.Boots);
    }

    [Fact]
    public void Canonical_filter_maps_frontend_enum_names()
    {
        Assert.Equal("goggles", ViolationTypes.CanonicalFilter("SafetyGlasses"));
        Assert.Equal("arc_flash_shield", ViolationTypes.CanonicalFilter("Vest"));
        Assert.Equal("helmet", ViolationTypes.CanonicalFilter("Helmet"));
    }

    [Fact]
    public void Rtsp_credentials_are_redacted()
    {
        var redacted = SecretRedaction.Rtsp("rtsp://user:secret@10.0.0.8/stream");
        Assert.DoesNotContain("secret", redacted);
        Assert.Contains("***", redacted);
    }
}

public sealed class ApiTests : IDisposable
{
    private readonly ApiFactory _factory = new();

    public void Dispose() => _factory.Dispose();

    [Fact]
    public async Task Health_is_anonymous()
    {
        var client = _factory.CreateClient();
        var live = await client.GetAsync("/health/live");
        Assert.Equal(HttpStatusCode.OK, live.StatusCode);
        var ready = await client.GetAsync("/health/ready");
        Assert.Equal(HttpStatusCode.OK, ready.StatusCode);
    }

    [Fact]
    public async Task Register_login_and_ingest_violation()
    {
        var client = _factory.CreateClient();
        var register = await client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            fullName = "Admin",
            email = "admin@test.local",
            password = "password1",
            confirmPassword = "password1"
        });
        register.EnsureSuccessStatusCode();
        var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { email = "admin@test.local", password = "password1" });
        login.EnsureSuccessStatusCode();
        using var loginDoc = JsonDocument.Parse(await login.Content.ReadAsStringAsync());
        var token = loginDoc.RootElement.GetProperty("data").GetProperty("token").GetString();
        Assert.False(string.IsNullOrWhiteSpace(token));
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var me = await client.GetAsync("api/v1/auth/me");
        me.EnsureSuccessStatusCode();

        var cameras = await client.GetAsync("/api/v1/ppe/cameras");
        cameras.EnsureSuccessStatusCode();

        var evt = new
        {
            eventId = Guid.NewGuid(),
            eventType = "ViolationCreated",
            schemaVersion = 1,
            occurredAt = DateTimeOffset.UtcNow,
            cameraId = "CAM-LIVE-01",
            trackId = 7,
            violationId = Guid.NewGuid(),
            violationType = "helmet",
            severity = "high",
            confidence = 0.8,
            ppeZone = "OUTSIDE",
            missingPpe = "Helmet",
            isImmediate = false,
            isViolation = true,
            workerCode = "S-7",
            workerName = "Track 7",
            frameWidth = 1920,
            frameHeight = 1080,
            boundingBoxes = new[] { new { x = 10, y = 10, w = 40, h = 80, @class = "person", confidence = 0.9 } },
            idempotencyKey = $"CAM-LIVE-01|7|helmet|{DateTime.UtcNow:yyyy-MM-ddTHH:mm}"
        };

        var ingest = _factory.CreateClient();
        ingest.DefaultRequestHeaders.Add("X-Internal-Token", "test-internal");
        var created = await ingest.PostAsJsonAsync("/internal/ai/events/violation", evt);
        created.EnsureSuccessStatusCode();
        var duplicate = await ingest.PostAsJsonAsync("/internal/ai/events/violation", evt);
        duplicate.EnsureSuccessStatusCode();

        var boots = await ingest.PostAsJsonAsync("/internal/ai/events/violation", new
        {
            eventId = Guid.NewGuid(),
            eventType = "ViolationCreated",
            schemaVersion = 1,
            occurredAt = DateTimeOffset.UtcNow,
            cameraId = "CAM-LIVE-01",
            trackId = 8,
            violationId = Guid.NewGuid(),
            violationType = "boots",
            severity = "high",
            confidence = 0.9,
            ppeZone = "SHOCKING"
        });
        boots.EnsureSuccessStatusCode();

        var list = await client.GetAsync("/api/v1/ppe/violations?page=1&pageSize=20");
        list.EnsureSuccessStatusCode();
        using var listDoc = JsonDocument.Parse(await list.Content.ReadAsStringAsync());
        Assert.True(listDoc.RootElement.GetProperty("success").GetBoolean());
        Assert.True(listDoc.RootElement.GetProperty("data").GetArrayLength() >= 1);
        foreach (var item in listDoc.RootElement.GetProperty("data").EnumerateArray())
            Assert.NotEqual("boots", item.GetProperty("violationType").GetString());
    }

    [Fact]
    public async Task Review_rejects_invalid_transition()
    {
        var client = _factory.CreateClient();
        await client.PostAsJsonAsync("/api/v1/auth/register", new
        {
            fullName = "Admin2",
            email = "admin2@test.local",
            password = "password1",
            confirmPassword = "password1"
        });
        var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { email = "admin2@test.local", password = "password1" });
        login.EnsureSuccessStatusCode();
        using var loginDoc = JsonDocument.Parse(await login.Content.ReadAsStringAsync());
        var token = loginDoc.RootElement.GetProperty("data").GetProperty("token").GetString();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var missing = await client.PostAsync($"/api/v1/ppe/violations/{Guid.NewGuid()}/accept", null);
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
    }
}
