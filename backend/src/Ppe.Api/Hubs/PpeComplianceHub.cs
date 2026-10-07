using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Ppe.Api.Hubs;

[Authorize]
public sealed class PpeComplianceHub : Hub;
