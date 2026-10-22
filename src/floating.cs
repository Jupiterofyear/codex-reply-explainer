using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Markup;
using System.Windows.Threading;

class FloatingExplanation {
    static JavaScriptSerializer json = new JavaScriptSerializer();
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetClipboardSequenceNumber();
    static Dictionary<string, object> ReadJson(string file) {
        try {
            using (var stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            using (var reader = new StreamReader(stream, Encoding.UTF8)) return json.Deserialize<Dictionary<string, object>>(reader.ReadToEnd());
        } catch (FileNotFoundException) { return null; }
        catch (DirectoryNotFoundException) { return null; }
    }
    static bool ProcessAlive(int pid) {
        try { using (var process = Process.GetProcessById(pid)) return !process.HasExited; }
        catch (ArgumentException) { return false; }
    }
    static string Text(Dictionary<string, object> value, string key) {
        return value != null && value.ContainsKey(key) ? value[key] as string ?? "" : "";
    }
    static void CheckId(string value) {
        if (!Regex.IsMatch(value, "^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$")) throw new Exception("聊天标识无效。");
    }
    static async Task<string> CurrentChat() {
        var hosts = Process.GetProcessesByName("ChatGPT").Where(p => p.MainWindowHandle != IntPtr.Zero).ToArray();
        if (hosts.Length != 1) throw new Exception("请保留一个 Codex 主窗口后重试。");
        var host = hosts[0];
        var original = Clipboard.GetDataObject();
        var saved = new DataObject();
        if (original != null) foreach (var format in original.GetFormats(false)) {
            var data = original.GetData(format, false);
            var stream = data as MemoryStream;
            saved.SetData(format, stream == null ? data : new MemoryStream(stream.ToArray()));
        }
        uint before = GetClipboardSequenceNumber();
        uint copied = 0;
        try {
            SetForegroundWindow(host.MainWindowHandle);
            await Task.Delay(200);
            if (GetForegroundWindow() != host.MainWindowHandle) throw new Exception("请把 Codex 窗口打开后再试。");
            System.Windows.Forms.SendKeys.SendWait("^%l");
            var deadline = DateTime.UtcNow.AddSeconds(3);
            while (DateTime.UtcNow < deadline) {
                uint sequence = GetClipboardSequenceNumber();
                if (sequence != before && Clipboard.ContainsText()) {
                    var match = Regex.Match(Clipboard.GetText(), @"^codex://threads/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})(?:\?.*)?$", RegexOptions.IgnoreCase);
                    if (match.Success) { copied = sequence; return match.Groups[1].Value; }
                }
                await Task.Delay(50);
            }
            throw new Exception("没有收到当前聊天的应用内链接。");
        } finally {
            if (copied != 0 && GetClipboardSequenceNumber() == copied) {
                if (original == null) Clipboard.Clear(); else Clipboard.SetDataObject(saved, true);
            }
        }
    }
    static async Task Request(string node, string dataRoot, string sourceHome, string threadId) {
        var script = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "request.mjs");
        var info = new ProcessStartInfo(node, "\"" + script + "\" \"" + dataRoot + "\" \"" + sourceHome + "\" " + threadId) {
            UseShellExecute = false, CreateNoWindow = true, RedirectStandardError = true, StandardErrorEncoding = new UTF8Encoding(false),
            WorkingDirectory = Path.GetDirectoryName(script)
        };
        await Task.Run(() => {
            using (var child = Process.Start(info)) {
                string error = child.StandardError.ReadToEnd();
                child.WaitForExit();
                if (child.ExitCode != 0) throw new Exception(error.Trim());
            }
        });
    }
    [STAThread] static int Main(string[] args) {
        System.Windows.Media.RenderOptions.ProcessRenderMode = System.Windows.Interop.RenderMode.SoftwareOnly;
        string dataRoot = Path.GetFullPath(args[0]);
        string sourceHome = Path.GetFullPath(args[1]);
        string node = Path.GetFullPath(args[2]);
        string directory = Path.Combine(dataRoot, "floating");
        string digest;
        using (var hash = SHA256.Create()) digest = BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(dataRoot.ToLowerInvariant()))).Replace("-", "");
        bool created;
        using (var mutex = new Mutex(true, "Local\\CodexReplyExplainer-" + digest, out created)) {
            if (!created) return 0;
            try {
                Directory.CreateDirectory(directory);
                File.WriteAllText(Path.Combine(directory, "window.json"), json.Serialize(new { pid = Process.GetCurrentProcess().Id }), new UTF8Encoding(false));
                var window = (Window)XamlReader.Parse(@"<Window xmlns=""http://schemas.microsoft.com/winfx/2006/xaml/presentation"" xmlns:x=""http://schemas.microsoft.com/winfx/2006/xaml"" xmlns:shell=""clr-namespace:System.Windows.Shell;assembly=PresentationFramework""
 Title=""Codex 回复解释"" Width=""420"" Height=""860"" MinWidth=""360"" MinHeight=""270"" Topmost=""True"" ShowActivated=""False""
 FontFamily=""Microsoft YaHei UI"" Foreground=""#202020"" Background=""White"" WindowStyle=""None"" WindowStartupLocation=""Manual"" ResizeMode=""CanResize"" UseLayoutRounding=""True"" TextOptions.TextFormattingMode=""Display"" TextOptions.TextRenderingMode=""ClearType"">
 <shell:WindowChrome.WindowChrome><shell:WindowChrome CaptionHeight=""48"" ResizeBorderThickness=""6"" CornerRadius=""12"" GlassFrameThickness=""0"" UseAeroCaptionButtons=""False""/></shell:WindowChrome.WindowChrome>
 <Window.Resources>
  <Style x:Key=""WindowButton"" TargetType=""Button"">
   <Setter Property=""Width"" Value=""32""/><Setter Property=""Height"" Value=""32""/><Setter Property=""Background"" Value=""Transparent""/><Setter Property=""Foreground"" Value=""#686868""/><Setter Property=""FocusVisualStyle"" Value=""{x:Null}""/>
   <Setter Property=""Template""><Setter.Value><ControlTemplate TargetType=""Button""><Border x:Name=""Surface"" Background=""{TemplateBinding Background}"" CornerRadius=""8""><ContentPresenter HorizontalAlignment=""Center"" VerticalAlignment=""Center""/></Border><ControlTemplate.Triggers><Trigger Property=""IsMouseOver"" Value=""True""><Setter TargetName=""Surface"" Property=""Background"" Value=""#F0F0F0""/></Trigger><Trigger Property=""IsPressed"" Value=""True""><Setter TargetName=""Surface"" Property=""Background"" Value=""#E5E5E5""/></Trigger></ControlTemplate.Triggers></ControlTemplate></Setter.Value></Setter>
  </Style>
  <Style x:Key=""ExplainButton"" TargetType=""Button"">
   <Setter Property=""Height"" Value=""42""/><Setter Property=""FontSize"" Value=""14""/><Setter Property=""Background"" Value=""White""/><Setter Property=""BorderBrush"" Value=""#DCDCDC""/><Setter Property=""BorderThickness"" Value=""1""/><Setter Property=""Cursor"" Value=""Hand""/><Setter Property=""FocusVisualStyle"" Value=""{x:Null}""/>
   <Setter Property=""Template""><Setter.Value><ControlTemplate TargetType=""Button""><Border x:Name=""Surface"" Background=""{TemplateBinding Background}"" BorderBrush=""{TemplateBinding BorderBrush}"" BorderThickness=""{TemplateBinding BorderThickness}"" CornerRadius=""21""><ContentPresenter HorizontalAlignment=""Center"" VerticalAlignment=""Center""/></Border><ControlTemplate.Triggers><Trigger Property=""IsMouseOver"" Value=""True""><Setter TargetName=""Surface"" Property=""Background"" Value=""#F5F5F5""/></Trigger><Trigger Property=""IsPressed"" Value=""True""><Setter TargetName=""Surface"" Property=""Background"" Value=""#EBEBEB""/></Trigger><Trigger Property=""IsKeyboardFocused"" Value=""True""><Setter TargetName=""Surface"" Property=""BorderBrush"" Value=""#888888""/></Trigger><Trigger Property=""IsEnabled"" Value=""False""><Setter TargetName=""Surface"" Property=""Opacity"" Value=""0.45""/></Trigger></ControlTemplate.Triggers></ControlTemplate></Setter.Value></Setter>
  </Style>
  <Style x:Key=""Notice"" TargetType=""TextBlock""><Setter Property=""FontSize"" Value=""12""/><Setter Property=""Foreground"" Value=""#858585""/><Setter Property=""TextWrapping"" Value=""Wrap""/><Setter Property=""Margin"" Value=""0,0,0,14""/><Style.Triggers><Trigger Property=""Text"" Value=""""><Setter Property=""Visibility"" Value=""Collapsed""/></Trigger></Style.Triggers></Style>
 </Window.Resources>
 <Border BorderBrush=""#E5E5E5"" BorderThickness=""1"" CornerRadius=""12"" Background=""White"">
  <Grid>
   <Grid.RowDefinitions><RowDefinition Height=""48""/><RowDefinition Height=""*""/></Grid.RowDefinitions>
   <Grid Margin=""20,0,8,0""><Grid.ColumnDefinitions><ColumnDefinition Width=""*""/><ColumnDefinition Width=""36""/><ColumnDefinition Width=""36""/></Grid.ColumnDefinitions>
    <TextBlock Text=""Codex 回复解释"" FontSize=""14"" FontWeight=""SemiBold"" VerticalAlignment=""Center""/>
    <Button x:Name=""Minimize"" Grid.Column=""1"" Style=""{StaticResource WindowButton}"" AutomationProperties.Name=""最小化"" shell:WindowChrome.IsHitTestVisibleInChrome=""True""><Path Data=""M 0,0 L 10,0"" Stroke=""#686868"" StrokeThickness=""1""/></Button>
    <Button x:Name=""CloseWindow"" Grid.Column=""2"" Style=""{StaticResource WindowButton}"" AutomationProperties.Name=""关闭"" shell:WindowChrome.IsHitTestVisibleInChrome=""True""><Path Data=""M 0,0 L 9,9 M 9,0 L 0,9"" Stroke=""#686868"" StrokeThickness=""1""/></Button>
   </Grid>
   <Grid Grid.Row=""1"" Margin=""22,10,22,22"">
    <Grid.RowDefinitions><RowDefinition Height=""Auto""/><RowDefinition Height=""Auto""/><RowDefinition Height=""Auto""/><RowDefinition Height=""*""/><RowDefinition Height=""Auto""/></Grid.RowDefinitions>
    <Button x:Name=""ExplainCurrent"" Style=""{StaticResource ExplainButton}"" AutomationProperties.Name=""解释当前聊天""><StackPanel Orientation=""Horizontal""><Path Data=""M 12,4 A 5,5 0 1 0 12,10 M 12,0 L 12,4 L 8,4"" Width=""14"" Height=""14"" Stretch=""Uniform"" Stroke=""#505050"" StrokeThickness=""1.2"" Margin=""0,0,8,0"" VerticalAlignment=""Center""/><TextBlock Text=""解释当前聊天""/></StackPanel></Button>
    <TextBlock x:Name=""ChatName"" Grid.Row=""1"" Margin=""0,24,0,18"" FontSize=""17"" FontWeight=""SemiBold"" TextWrapping=""Wrap""/>
    <TextBlock x:Name=""Status"" Grid.Row=""2"" Style=""{StaticResource Notice}""/>
    <Grid x:Name=""ExplanationHost"" Grid.Row=""3""/>
    <TextBlock x:Name=""Failure"" Grid.Row=""4"" Style=""{StaticResource Notice}"" Margin=""0,12,0,0"" Foreground=""#AD5142""/>
   </Grid>
  </Grid>
 </Border>
</Window>");
                var button = (Button)window.FindName("ExplainCurrent");
                var chatName = (TextBlock)window.FindName("ChatName");
                var status = (TextBlock)window.FindName("Status");
                var explanation = new MarkdownView();
                ((Grid)window.FindName("ExplanationHost")).Children.Add(explanation);
                var failure = (TextBlock)window.FindName("Failure");
                ((Button)window.FindName("Minimize")).Click += (sender, ev) => window.WindowState = WindowState.Minimized;
                ((Button)window.FindName("CloseWindow")).Click += (sender, ev) => window.Close();
                var layoutFile = Path.Combine(dataRoot, "window-layout.json");
                var area = SystemParameters.WorkArea;
                window.Height = Math.Min(window.Height, area.Height - 48);
                window.Left = Math.Max(area.Left, area.Right - window.Width - 28);
                window.Top = Math.Max(area.Top, area.Bottom - window.Height - 24);
                var layout = ReadJson(layoutFile);
                if (layout != null) {
                    window.Width = Convert.ToDouble(layout["width"]);
                    window.Height = Convert.ToDouble(layout["height"]);
                    window.Left = Convert.ToDouble(layout["left"]);
                    window.Top = Convert.ToDouble(layout["top"]);
                }
                window.Closing += (sender, ev) => {
                    var bounds = window.RestoreBounds;
                    File.WriteAllText(layoutFile, json.Serialize(new { left = bounds.Left, top = bounds.Top, width = bounds.Width, height = bounds.Height }), Encoding.UTF8);
                };
                string lastOpenId = null;
                bool closed = false;
                Action refresh = () => {
                    var selected = ReadJson(Path.Combine(directory, "selection.json"));
                    if (selected == null) {
                        chatName.Text = ""; explanation.SetText("");
                        status.Text = "点击上方按钮，解释当前打开的聊天。";
                        return;
                    }
                    string id = Text(selected, "openId"); CheckId(id);
                    CheckId(Text(selected, "threadId"));
                    if (id != lastOpenId) {
                        lastOpenId = id;
                        chatName.Text = Text(selected, "title");
                        failure.Text = "";
                        window.WindowState = WindowState.Normal;
                        window.Activate();
                    }
                    var latest = ReadJson(Path.Combine(directory, "latest-" + id + ".json"));
                    Dictionary<string, object> state = null;
                    if (latest != null) {
                        string turn = Text(latest, "turnId");
                        if (!Regex.IsMatch(turn, "^[a-zA-Z0-9_-]{1,100}$")) throw new Exception("回复标识无效。");
                        state = ReadJson(Path.Combine(directory, "result-" + id + "-" + turn + ".json"));
                    }
                    explanation.SetText(Text(state, "text"));
                    if (state != null) failure.Text = Text(state, "error");
                    string stateStatus = state == null ? Text(selected, "initialStatus") : Text(state, "status");
                    if (state != null && state.ContainsKey("workerPid") && (stateStatus == "queued" || stateStatus == "generating") && !ProcessAlive(Convert.ToInt32(state["workerPid"]))) {
                        stateStatus = "error";
                        failure.Text = "解释后台已退出。点击“解释当前聊天”可重新生成。";
                    }
                    switch (stateStatus) {
                        case "ready": status.Text = ""; break;
                        case "queued":
                        case "generating": status.Text = "正在生成解释…"; break;
                        case "error": status.Text = "这次解释没有生成成功"; break;
                        case "unavailable": status.Text = "暂时没有找到这段聊天已保存的完整回复。"; break;
                        default: status.Text = "正在读取这段聊天的解释…"; break;
                    }
                };
                var timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
                timer.Tick += (sender, ev) => {
                    try { refresh(); }
                    catch (Exception error) { status.Text = "暂时无法读取解释"; failure.Text = error.Message; timer.Stop(); }
                };
                button.Click += async (sender, ev) => {
                    button.IsEnabled = false;
                    failure.Text = "";
                    try {
                        string id = await CurrentChat();
                        if (closed) return;
                        window.Activate();
                        button.IsEnabled = true;
                        await Request(node, dataRoot, sourceHome, id);
                    } catch (Exception error) { if (!closed) failure.Text = error.Message; }
                    finally { if (!closed) button.IsEnabled = true; }
                };
                window.ContentRendered += async (sender, ev) => {
                    try { await explanation.InitializeAsync(dataRoot); if (!closed) { refresh(); timer.Start(); } }
                    catch (Exception error) { if (!closed) { status.Text = "显示未能启动"; failure.Text = error.Message; } }
                };
                var app = new Application { ShutdownMode = ShutdownMode.OnExplicitShutdown };
                window.Closed += async (sender, ev) => {
                    closed = true; timer.Stop();
                    File.Delete(Path.Combine(directory, "window.json"));
                    File.Delete(Path.Combine(directory, "selection.json"));
                    foreach (string file in Directory.GetFiles(directory, "latest-*.json")) File.Delete(file);
                    foreach (string file in Directory.GetFiles(directory, "result-*.json")) File.Delete(file);
                    await explanation.CloseAsync();
                    app.Shutdown();
                };
                app.Run(window);
                return 0;
            } catch (Exception error) { MessageBox.Show(error.Message, "Codex 回复解释"); return 1; }
            finally { File.Delete(Path.Combine(directory, "window.json")); mutex.ReleaseMutex(); }
        }
    }
}
