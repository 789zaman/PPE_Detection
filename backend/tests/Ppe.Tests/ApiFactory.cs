using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace Ppe.Tests;

public sealed class ApiFactory : WebApplicationFactory<Program>
{
    private readonly string _db = Path.Combine(Path.GetTempPath(), $"ppe-test-{Guid.NewGuid():N}.db");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureAppConfiguration((_, config) =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Database:Provider"] = "Sqlite",
                ["Database:MigrateOnStartup"] = "false",
                ["ConnectionStrings:Sqlite"] = $"Data Source={_db}",
                ["Nats:Enabled"] = "false",
                ["Jwt:Key"] = "dev-only-change-me-please-use-32-chars!",
                ["Jwt:Issuer"] = "ppe",
                ["Jwt:Audience"] = "ppe",
                ["Internal:Token"] = "test-internal",
                ["Cors:Origins"] = "http://localhost:4200",
                ["MediaMtx:WebrtcPublicBase"] = "http://127.0.0.1:8889",
                ["MediaMtx:ApiBase"] = ""
            });
        });
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        try { File.Delete(_db); } catch { /* ignore */ }
    }
}
