using System.Diagnostics;
using System.Text.Json;
using Ppe.Application;

namespace Ppe.Api.Middleware;

public sealed class CorrelationMiddleware(RequestDelegate next, ILogger<CorrelationMiddleware> logger)
{
    public const string Header = "X-Correlation-ID";

    public async Task Invoke(HttpContext context)
    {
        var id = context.Request.Headers[Header].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(id))
            id = Activity.Current?.Id ?? Guid.NewGuid().ToString("N");
        context.Response.Headers[Header] = id;
        using (logger.BeginScope(new Dictionary<string, object> { ["correlationId"] = id, ["service"] = "backend" }))
        {
            await next(context);
        }
    }
}

public sealed class ErrorMiddleware(RequestDelegate next, ILogger<ErrorMiddleware> logger)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task Invoke(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (AppException ex)
        {
            logger.LogWarning(ex, "app_error {Status}", ex.Status);
            await Write(context, ex.Status, ex.Message, ex.Field);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "unhandled");
            await Write(context, 500, "An unexpected error occurred.", null);
        }
    }

    private static async Task Write(HttpContext context, int status, string message, string? field)
    {
        if (context.Response.HasStarted)
            return;
        context.Response.StatusCode = status;
        context.Response.ContentType = "application/json";
        var errors = new[] { new ApiError(status.ToString(), message, field) };
        await context.Response.WriteAsync(JsonSerializer.Serialize(new ApiEnvelope<object>(false, null, message, errors, null), Json));
    }
}

public static class Envelope
{
    public static ApiEnvelope<T> Ok<T>(T data, string? message = null, object? meta = null) =>
        new(true, data, message, null, meta);

    public static object PageMeta(Application.PageMeta meta) => new
    {
        pageNumber = meta.PageNumber,
        pageSize = meta.PageSize,
        totalRecords = meta.TotalRecords,
        totalPages = meta.TotalPages
    };
}
