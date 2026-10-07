using Microsoft.EntityFrameworkCore;

namespace Ppe.Infrastructure.Persistence;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<PlantZone> PlantZones => Set<PlantZone>();
    public DbSet<Camera> Cameras => Set<Camera>();
    public DbSet<PpeConfiguration> PpeConfigurations => Set<PpeConfiguration>();
    public DbSet<Violation> Violations => Set<Violation>();
    public DbSet<ViolationReview> ViolationReviews => Set<ViolationReview>();
    public DbSet<AuditEvent> AuditEvents => Set<AuditEvent>();
    public DbSet<ProcessedEvent> ProcessedEvents => Set<ProcessedEvent>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<Capture> Captures => Set<Capture>();
    public DbSet<DailyStat> DailyStats => Set<DailyStat>();
    public DbSet<SystemSetting> SystemSettings => Set<SystemSetting>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AppUser>(entity =>
        {
            entity.ToTable("users");
            entity.HasIndex(x => x.Email).IsUnique();
            entity.Property(x => x.Email).HasMaxLength(256);
            entity.Property(x => x.FullName).HasMaxLength(200);
            entity.Property(x => x.Role).HasMaxLength(64);
        });

        modelBuilder.Entity<RefreshToken>(entity =>
        {
            entity.ToTable("refresh_tokens");
            entity.HasIndex(x => x.Token).IsUnique();
            entity.Property(x => x.Token).HasMaxLength(256);
            entity.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId);
        });

        modelBuilder.Entity<PlantZone>(entity =>
        {
            entity.ToTable("plant_zones");
            entity.HasIndex(x => x.Code).IsUnique();
            entity.Property(x => x.Code).HasMaxLength(64);
            entity.Property(x => x.Name).HasMaxLength(200);
        });

        modelBuilder.Entity<Camera>(entity =>
        {
            entity.ToTable("cameras");
            entity.HasIndex(x => x.Code).IsUnique();
            entity.HasIndex(x => x.StreamName).IsUnique();
            entity.Property(x => x.Code).HasMaxLength(64);
            entity.Property(x => x.Name).HasMaxLength(200);
            entity.Property(x => x.StreamName).HasMaxLength(128);
            entity.Property(x => x.Status).HasMaxLength(32);
            entity.Property(x => x.RtspUrl).HasMaxLength(1000);
            entity.HasOne(x => x.Zone).WithMany(x => x.Cameras).HasForeignKey(x => x.ZoneId);
        });

        modelBuilder.Entity<PpeConfiguration>(entity =>
        {
            entity.ToTable("ppe_configurations");
            entity.Property(x => x.ClassName).HasMaxLength(64);
            entity.HasIndex(x => new { x.CameraId, x.ClassName }).IsUnique();
        });

        modelBuilder.Entity<Violation>(entity =>
        {
            entity.ToTable("violations");
            entity.Property(x => x.ViolationType).HasMaxLength(64);
            entity.Property(x => x.Severity).HasMaxLength(32);
            entity.Property(x => x.Status).HasMaxLength(32);
            entity.Property(x => x.PpeZone).HasMaxLength(32);
            entity.Property(x => x.IdempotencyKey).HasMaxLength(256);
            entity.HasIndex(x => x.IdempotencyKey).IsUnique();
            entity.HasIndex(x => new { x.CameraId, x.CreatedAt });
            entity.HasIndex(x => new { x.Status, x.CreatedAt });
            entity.HasIndex(x => new { x.ViolationType, x.CreatedAt });
            entity.HasOne(x => x.Camera).WithMany().HasForeignKey(x => x.CameraId);
        });

        modelBuilder.Entity<ViolationReview>(entity =>
        {
            entity.ToTable("violation_reviews");
            entity.HasIndex(x => x.ViolationId);
            entity.HasOne(x => x.Violation).WithMany(x => x.Reviews).HasForeignKey(x => x.ViolationId);
        });

        modelBuilder.Entity<AuditEvent>(entity =>
        {
            entity.ToTable("audit_events");
            entity.HasIndex(x => new { x.EntityType, x.EntityId });
            entity.Property(x => x.Action).HasMaxLength(64);
            entity.Property(x => x.EntityType).HasMaxLength(64);
        });

        modelBuilder.Entity<ProcessedEvent>(entity =>
        {
            entity.ToTable("event_consumption");
            entity.HasKey(x => x.EventId);
            entity.Property(x => x.EventType).HasMaxLength(64);
        });

        modelBuilder.Entity<Notification>(entity =>
        {
            entity.ToTable("notifications");
            entity.HasIndex(x => x.CreatedAt);
            entity.Property(x => x.Title).HasMaxLength(200);
            entity.Property(x => x.Status).HasMaxLength(32);
        });

        modelBuilder.Entity<Capture>(entity =>
        {
            entity.ToTable("captures");
            entity.HasIndex(x => x.CameraId);
            entity.HasIndex(x => x.ViolationId);
            entity.HasOne(x => x.Camera).WithMany().HasForeignKey(x => x.CameraId);
        });

        modelBuilder.Entity<DailyStat>(entity =>
        {
            entity.ToTable("daily_stats");
            entity.HasIndex(x => x.Date).IsUnique();
        });

        modelBuilder.Entity<SystemSetting>(entity =>
        {
            entity.ToTable("system_settings");
            entity.HasKey(x => x.Key);
            entity.Property(x => x.Key).HasMaxLength(128);
        });
    }
}
