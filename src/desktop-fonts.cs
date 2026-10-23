using System;
using System.Globalization;
using System.IO;
using System.Text.RegularExpressions;

class DesktopFonts {
    public readonly double Sans, Code;
    public DesktopFonts(double sans, double code) { Sans = sans; Code = code; }
    public static DesktopFonts Read(string file) {
        string config = File.Exists(file) ? File.ReadAllText(file) : "";
        var desktop = Regex.Match(config, @"(?ms)^\[desktop\][ \t]*\r?\n(.*?)(?=^\[|\z)").Groups[1].Value;
        return new DesktopFonts(Size(desktop, "sansFontSize", 14), Size(desktop, "codeFontSize", 12));
    }
    static double Size(string desktop, string key, double defaultSize) {
        var match = Regex.Match(desktop, @"(?m)^" + key + @"[ \t]*=[ \t]*(\d+(?:\.\d+)?)[ \t]*(?:#.*)?\r?$");
        return match.Success ? Double.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture) : defaultSize;
    }
}
