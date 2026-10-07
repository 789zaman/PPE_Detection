using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Ppe.Infrastructure.Persistence;

public sealed class AppDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<AppDbContext>();
        options.UseNpgsql("Host=localhost;Port=5432;Database=ppe;Username=ppe;Password=ppe_dev_password");
        return new AppDbContext(options.Options);
    }
}
