namespace Ppe.Domain;

/// <summary>
/// Canonical PPE class names. Ids are never hard-coded; callers resolve names first.
/// </summary>
public static class PpeClasses
{
    public const string Person = "person";
    public const string Helmet = "helmet";
    public const string Goggles = "goggles";
    public const string ArcSuit = "arc_suit";
    public const string ArcFlashShield = "arc_flash_shield";
    public const string ArcGloves = "arc_gloves";
    public const string Boots = "boots";

    public static bool IsBoots(string? className) =>
        string.Equals(Normalize(className), Boots, StringComparison.Ordinal);

    public static string Normalize(string? className)
    {
        var key = (className ?? string.Empty).Trim().ToLowerInvariant().Replace('-', '_').Replace(' ', '_');
        return key switch
        {
            "hardhat" or "helmet" => Helmet,
            "goggles" or "glasses" or "safety_glasses" or "safetyglasses" => Goggles,
            "arc_suit" or "arcsuit" or "arc_flash_suit" or "suit" => ArcSuit,
            "arc_flash_shield" or "arc_shield" or "arcshield" or "face_shield" or "vest" or "safety_vest" => ArcFlashShield,
            "arc_gloves" or "gloves" or "glove" => ArcGloves,
            "boots" or "boot" or "shoes" or "shoe" or "no_boots" => Boots,
            "person" or "people" => Person,
            _ => key
        };
    }
}

public readonly record struct Point(double X, double Y);

public enum FloorZone
{
    Outside = 0,
    Shocking = 1
}

public sealed record ComplianceDecision(
    string ViolationType,
    string MissingPpeLabel,
    string Severity,
    bool IsImmediate);

/// <summary>
/// Authoritative PPE rule used by tests and the backend safety net.
/// The AI worker implements the same matrix.
///
/// Outside the shocking boundary: helmet and goggles only.
/// Inside the shocking boundary: helmet, goggles, and one Arc PPE violation
/// when the flash shield is absent. Shield present means arc suit and arc gloves
/// do not create separate violations.
/// Boots never create a violation.
/// </summary>
public static class ComplianceEngine
{
    public static FloorZone Classify(Point feet, IEnumerable<IReadOnlyList<Point>> shockingPolygons)
    {
        foreach (var polygon in shockingPolygons)
        {
            if (Geometry.Contains(polygon, feet))
                return FloorZone.Shocking;
        }

        return FloorZone.Outside;
    }

    public static IReadOnlyList<ComplianceDecision> Evaluate(FloorZone zone, IReadOnlySet<string> associated)
    {
        var present = new HashSet<string>(associated.Select(PpeClasses.Normalize), StringComparer.Ordinal);
        var shocking = zone == FloorZone.Shocking;
        var decisions = new List<ComplianceDecision>();

        if (!present.Contains(PpeClasses.Helmet))
        {
            decisions.Add(new ComplianceDecision(
                PpeClasses.Helmet,
                "Helmet",
                shocking ? "critical" : "high",
                shocking));
        }

        if (!present.Contains(PpeClasses.Goggles))
        {
            decisions.Add(new ComplianceDecision(
                PpeClasses.Goggles,
                "Safety Glasses",
                shocking ? "critical" : "medium",
                shocking));
        }

        if (shocking && !present.Contains(PpeClasses.ArcFlashShield))
        {
            decisions.Add(new ComplianceDecision(
                PpeClasses.ArcFlashShield,
                "Arc Flash Shield",
                "critical",
                true));
        }

        return decisions;
    }
}

public static class Geometry
{
    public static bool Contains(IReadOnlyList<Point> polygon, Point point)
    {
        if (polygon.Count < 3)
            return false;

        var inside = false;
        for (int i = 0, j = polygon.Count - 1; i < polygon.Count; j = i++)
        {
            var pi = polygon[i];
            var pj = polygon[j];
            var denom = pj.Y - pi.Y;
            if (Math.Abs(denom) < 1e-9)
                denom = denom < 0 ? -1e-9 : 1e-9;

            var intersects = ((pi.Y > point.Y) != (pj.Y > point.Y))
                && (point.X < (pj.X - pi.X) * (point.Y - pi.Y) / denom + pi.X);
            if (intersects)
                inside = !inside;
        }

        return inside;
    }

    public static IReadOnlyList<Point> ParsePolygon(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return [];

        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(json);
            return ReadPoints(doc.RootElement);
        }
        catch (System.Text.Json.JsonException)
        {
            return [];
        }
    }

    private static List<Point> ReadPoints(System.Text.Json.JsonElement element)
    {
        if (element.ValueKind == System.Text.Json.JsonValueKind.Object)
        {
            if (element.TryGetProperty("points", out var points))
                return ReadPoints(points);
            if (element.TryGetProperty("polygon", out var polygon))
                return ReadPoints(polygon);
        }

        var list = new List<Point>();
        if (element.ValueKind != System.Text.Json.JsonValueKind.Array)
            return list;

        foreach (var item in element.EnumerateArray())
        {
            if (item.ValueKind == System.Text.Json.JsonValueKind.Array && item.GetArrayLength() >= 2)
            {
                list.Add(new Point(item[0].GetDouble(), item[1].GetDouble()));
                continue;
            }

            if (item.ValueKind == System.Text.Json.JsonValueKind.Object
                && TryNumber(item, "x", out var x)
                && TryNumber(item, "y", out var y))
            {
                list.Add(new Point(x, y));
            }
        }

        return list;
    }

    private static bool TryNumber(System.Text.Json.JsonElement obj, string name, out double value)
    {
        value = 0;
        if (!obj.TryGetProperty(name, out var prop) && !obj.TryGetProperty(char.ToUpperInvariant(name[0]) + name[1..], out prop))
            return false;
        if (prop.ValueKind == System.Text.Json.JsonValueKind.Number)
        {
            value = prop.GetDouble();
            return true;
        }

        return prop.ValueKind == System.Text.Json.JsonValueKind.String && double.TryParse(prop.GetString(), out value);
    }
}

public static class SecretRedaction
{
    public static string Rtsp(string? url)
    {
        if (string.IsNullOrWhiteSpace(url))
            return string.Empty;

        var scheme = url.IndexOf("://", StringComparison.Ordinal);
        if (scheme < 0)
            return url;

        var at = url.IndexOf('@', scheme + 3);
        if (at < 0)
            return url;

        return string.Concat(url.AsSpan(0, scheme + 3), "***:***", url.AsSpan(at));
    }
}
