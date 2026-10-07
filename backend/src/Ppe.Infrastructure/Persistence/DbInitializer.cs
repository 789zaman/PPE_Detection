using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Ppe.Infrastructure.Persistence;

public static class DbInitializer
{
    public static async Task InitializeAsync(AppDbContext db, IConfiguration configuration, ILogger logger)
    {
        var provider = configuration["Database:Provider"] ?? "Postgres";
        if (string.Equals(provider, "Sqlite", StringComparison.OrdinalIgnoreCase)
            || !db.Database.GetMigrations().Any())
            await db.Database.EnsureCreatedAsync();
        else if (configuration.GetValue("Database:MigrateOnStartup", true))
            await db.Database.MigrateAsync();

        var now = DateTimeOffset.UtcNow;
        if (!await db.PlantZones.AnyAsync())
        {
            db.PlantZones.Add(new PlantZone
            {
                Id = Guid.Parse("11111111-1111-1111-1111-111111111111"),
                Code = "ZONE-SWG",
                Name = "Switchgear Room 2",
                Description = "Electrical switchgear",
                IsActive = true,
                CreatedAt = now,
                UpdatedAt = now
            });
        }

        if (!await db.Cameras.AnyAsync())
        {
            db.Cameras.Add(new Camera
            {
                Id = Guid.Parse("22222222-2222-2222-2222-222222222222"),
                Code = "CAM-LIVE-01",
                Name = "Switchgear primary",
                ZoneId = Guid.Parse("11111111-1111-1111-1111-111111111111"),
                RtspUrl = "rtsp://mediamtx:8554/cam-live-01",
                StreamUrl = configuration["MediaMtx:WebrtcPublicBase"] is { Length: > 0 } whep
                    ? $"{whep.TrimEnd('/')}/cam-live-01/whep"
                    : "http://127.0.0.1:8889/cam-live-01/whep",
                StreamName = "cam-live-01",
                IsPrimary = true,
                IsActive = true,
                Status = "offline",
                FrameWidth = 1920,
                FrameHeight = 1080,
                YellowZoneJson = """{"type":"polygon","points":[[100,700],[1800,700],[1800,1070],[100,1070]]}""",
                CreatedAt = now,
                UpdatedAt = now
            });
        }

        if (!await db.PpeConfigurations.AnyAsync())
        {
            foreach (var name in new[] { "person", "helmet", "goggles", "arc_suit", "arc_flash_shield", "arc_gloves", "boots" })
            {
                db.PpeConfigurations.Add(new PpeConfiguration
                {
                    Id = Guid.NewGuid(),
                    CameraId = Guid.Parse("22222222-2222-2222-2222-222222222222"),
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

        await db.SaveChangesAsync();
        logger.LogInformation("database_ready");
    }
}
