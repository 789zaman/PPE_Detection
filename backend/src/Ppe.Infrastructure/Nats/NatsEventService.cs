using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using NATS.Client.Core;
using NATS.Client.JetStream;
using NATS.Client.JetStream.Models;
using Ppe.Application;

namespace Ppe.Infrastructure.Nats;

public sealed class NatsEventService(
    IConfiguration configuration,
    IServiceScopeFactory scopes,
    ILogger<NatsEventService> logger) : BackgroundService, INatsPublisher
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private NatsConnection? _connection;
    private NatsJSContext? _js;
    public bool IsConnected { get; private set; }

    public async Task PublishAsync(string subject, object payload, CancellationToken cancellationToken)
    {
        if (_js is null || !IsConnected)
        {
            logger.LogWarning("nats_publish_skipped {Subject}", subject);
            return;
        }

        var json = JsonSerializer.Serialize(payload, Json);
        await _js.PublishAsync(subject, json, cancellationToken: cancellationToken);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!configuration.GetValue("Nats:Enabled", true))
        {
            logger.LogInformation("nats_disabled");
            return;
        }

        var url = configuration["Nats:Url"] ?? "nats://127.0.0.1:4222";
        var backoff = 1;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (_connection is not null)
                    await _connection.DisposeAsync();
                _connection = new NatsConnection(new NatsOpts { Url = url, Name = "ppe-backend" });
                await _connection.ConnectAsync();
                _js = new NatsJSContext(_connection);
                await _js.CreateOrUpdateStreamAsync(new StreamConfig
                {
                    Name = "PPE",
                    Subjects = ["ppe.v1.>"]
                }, stoppingToken);
                var consumer = await _js.CreateOrUpdateConsumerAsync("PPE", new ConsumerConfig
                {
                    DurableName = "ppe-backend",
                    FilterSubject = "ppe.v1.>",
                    MaxDeliver = 8
                }, stoppingToken);
                IsConnected = true;
                backoff = 1;
                logger.LogInformation("nats_connected {Url}", url);
                await ConsumeAsync(consumer, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                IsConnected = false;
                logger.LogWarning(ex, "nats_reconnect {Delay}s", backoff);
                try
                {
                    await Task.Delay(TimeSpan.FromSeconds(backoff), stoppingToken);
                }
                catch (OperationCanceledException)
                {
                    break;
                }

                backoff = Math.Min(30, backoff * 2);
            }
        }

        IsConnected = false;
        if (_connection is not null)
            await _connection.DisposeAsync();
    }

    private async Task ConsumeAsync(INatsJSConsumer consumer, CancellationToken stoppingToken)
    {
        await foreach (var msg in consumer.ConsumeAsync<string>().WithCancellation(stoppingToken))
        {
            var subject = msg.Subject ?? "";
            var body = msg.Data ?? "";
            try
            {
                using var scope = scopes.CreateScope();
                var ingest = scope.ServiceProvider.GetRequiredService<IViolationIngestion>();
                if (subject.Contains("violation", StringComparison.OrdinalIgnoreCase))
                {
                    var evt = JsonSerializer.Deserialize<ViolationEvent>(body, Json)
                        ?? throw new InvalidOperationException("empty violation event");
                    await ingest.IngestAsync(evt, stoppingToken);
                }
                else if (subject.Contains("worker.status", StringComparison.OrdinalIgnoreCase))
                {
                    var evt = JsonSerializer.Deserialize<WorkerStatusEvent>(body, Json)
                        ?? throw new InvalidOperationException("empty worker status");
                    await ingest.IngestWorkerStatusAsync(evt, stoppingToken);
                }
                else if (subject.Contains("camera.status", StringComparison.OrdinalIgnoreCase))
                {
                    var evt = JsonSerializer.Deserialize<CameraStatusEvent>(body, Json)
                        ?? throw new InvalidOperationException("empty camera status");
                    await ingest.IngestCameraStatusAsync(evt, stoppingToken);
                }

                await msg.AckAsync(cancellationToken: stoppingToken);
            }
            catch (AppException ex) when (ex.Status is 400 or 404)
            {
                logger.LogError(ex, "nats_poison {Subject}", subject);
                await msg.AckTerminateAsync(cancellationToken: stoppingToken);
            }
            catch (Exception ex)
            {
                var delivered = msg.Metadata?.NumDelivered ?? 0;
                logger.LogError(ex, "nats_handler_failed {Subject} {Delivered}", subject, delivered);
                if (delivered >= 8)
                    await msg.AckTerminateAsync(cancellationToken: stoppingToken);
                else
                    await msg.NakAsync(delay: TimeSpan.FromSeconds(2), cancellationToken: stoppingToken);
            }
        }
    }
}
