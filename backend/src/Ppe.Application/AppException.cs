namespace Ppe.Application;

public sealed class AppException(int status, string message, string? field = null) : Exception(message)
{
    public int Status { get; } = status;
    public string? Field { get; } = field;
}
