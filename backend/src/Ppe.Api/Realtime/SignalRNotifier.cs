using Microsoft.AspNetCore.SignalR;
using Ppe.Api.Hubs;
using Ppe.Application;

namespace Ppe.Api.Realtime;

public sealed class SignalRNotifier(IHubContext<PpeComplianceHub> hub) : IRealtimeNotifier
{
    public Task PublishViolationAsync(object payload, CancellationToken cancellationToken) =>
        hub.Clients.All.SendAsync("ViolationReceived", payload, cancellationToken);

    public Task PublishCameraStatusAsync(object payload, CancellationToken cancellationToken) =>
        hub.Clients.All.SendAsync("CameraStatusUpdated", payload, cancellationToken);

    public Task PublishNotificationAsync(object payload, CancellationToken cancellationToken) =>
        hub.Clients.All.SendAsync("NotificationReceived", payload, cancellationToken);

    public Task PublishPrimarySwitchedAsync(Guid cameraId, string cameraCode, CancellationToken cancellationToken) =>
        hub.Clients.All.SendAsync("PrimaryCameraSwitched", new { cameraId, cameraCode }, cancellationToken);
}
