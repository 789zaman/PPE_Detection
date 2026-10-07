using System.Net.Http.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Ppe.Application;
using Ppe.Domain;

namespace Ppe.Infrastructure.Streaming;

public sealed class MediaMtxRegistrar(
    IHttpClientFactory httpFactory,
    IConfiguration configuration,
    ILogger<MediaMtxRegistrar> logger) : IMediaMtxRegistrar
{
    public async Task RegisterPathAsync(string streamName, string sourceRtsp, CancellationToken cancellationToken)
    {
        var baseUrl = configuration["MediaMtx:ApiBase"];
        if (string.IsNullOrWhiteSpace(baseUrl) || string.IsNullOrWhiteSpace(streamName) || string.IsNullOrWhiteSpace(sourceRtsp))
            return;

        var client = httpFactory.CreateClient("mediamtx");
        var path = streamName.Trim('/');
        var payload = new { source = sourceRtsp, sourceOnDemand = true };
        try
        {
            using var patch = await client.PatchAsJsonAsync(
                $"{baseUrl.TrimEnd('/')}/v3/config/paths/patch/{path}",
                payload,
                cancellationToken);
            if (patch.IsSuccessStatusCode)
                return;

            using var add = await client.PostAsJsonAsync(
                $"{baseUrl.TrimEnd('/')}/v3/config/paths/add/{path}",
                payload,
                cancellationToken);
            if (!add.IsSuccessStatusCode)
            {
                logger.LogWarning(
                    "mediamtx_path_failed {Path} {Status} rtsp={Rtsp}",
                    path,
                    add.StatusCode,
                    SecretRedaction.Rtsp(sourceRtsp));
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "mediamtx_unavailable {Path}", path);
        }
    }
}
