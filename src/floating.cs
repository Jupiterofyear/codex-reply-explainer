using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
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
    static JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
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
    static async Task Request(string node, string dataRoot, string sourceHome, string threadId, bool explain, bool follow = false) {
        var script = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "request.mjs");
        var info = new ProcessStartInfo(node, "\"" + script + "\" \"" + dataRoot + "\" \"" + sourceHome + "\" " + threadId + (follow ? " follow" : explain ? " explain" : " select")) {
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
    static async Task QuestionRequest(string node, string dataRoot, string openId, string action, string text) {
        var script = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "question-request.mjs");
        var info = new ProcessStartInfo(node, "\"" + script + "\" \"" + dataRoot + "\" " + openId + " " + action) {
            UseShellExecute = false, CreateNoWindow = true, RedirectStandardError = true, RedirectStandardInput = true,
            StandardErrorEncoding = new UTF8Encoding(false), WorkingDirectory = Path.GetDirectoryName(script)
        };
        await Task.Run(() => {
            using (var child = Process.Start(info)) {
                using (var input = new StreamWriter(child.StandardInput.BaseStream, new UTF8Encoding(false))) input.Write(text);
                string error = child.StandardError.ReadToEnd(); child.WaitForExit();
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
 FontFamily=""Segoe UI, Microsoft YaHei UI"" FontWeight=""Normal"" Foreground=""#202020"" Background=""White"" WindowStyle=""None"" WindowStartupLocation=""Manual"" ResizeMode=""CanResize"" UseLayoutRounding=""True"" TextOptions.TextFormattingMode=""Display"" TextOptions.TextRenderingMode=""ClearType"">
 <shell:WindowChrome.WindowChrome><shell:WindowChrome CaptionHeight=""48"" ResizeBorderThickness=""6"" CornerRadius=""12"" GlassFrameThickness=""0"" UseAeroCaptionButtons=""False""/></shell:WindowChrome.WindowChrome>
 <Window.Resources>
  <Style TargetType=""ContextMenu""><Setter Property=""FontFamily"" Value=""Segoe UI, Microsoft YaHei UI""/><Setter Property=""FontSize"" Value=""13""/><Setter Property=""Foreground"" Value=""#202020""/><Setter Property=""Template""><Setter.Value><ControlTemplate TargetType=""ContextMenu""><Border Width=""190"" Background=""White"" BorderBrush=""#E5E5E5"" BorderThickness=""1"" CornerRadius=""12"" Padding=""6""><StackPanel IsItemsHost=""True"" KeyboardNavigation.DirectionalNavigation=""Cycle""/></Border></ControlTemplate></Setter.Value></Setter></Style>
  <Style TargetType=""MenuItem""><Setter Property=""Template""><Setter.Value><ControlTemplate TargetType=""MenuItem""><Border x:Name=""MenuSurface"" Background=""Transparent"" CornerRadius=""6"" Padding=""10,9""><ContentPresenter ContentSource=""Header""/></Border><ControlTemplate.Triggers><Trigger Property=""IsHighlighted"" Value=""True""><Setter TargetName=""MenuSurface"" Property=""Background"" Value=""#F3F3F3""/></Trigger><Trigger Property=""IsEnabled"" Value=""False""><Setter Property=""Opacity"" Value=""0.45""/></Trigger></ControlTemplate.Triggers></ControlTemplate></Setter.Value></Setter></Style>
  <Style TargetType=""Separator""><Setter Property=""Template""><Setter.Value><ControlTemplate TargetType=""Separator""><Border Height=""1"" Background=""#EAEAEA"" Margin=""8,4""/></ControlTemplate></Setter.Value></Setter></Style>
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
   <Grid.RowDefinitions><RowDefinition Height=""48""/><RowDefinition Height=""44""/><RowDefinition Height=""38""/><RowDefinition Height=""*""/></Grid.RowDefinitions>
   <Grid Margin=""20,0,8,0""><Grid.ColumnDefinitions><ColumnDefinition Width=""*""/><ColumnDefinition Width=""36""/><ColumnDefinition Width=""36""/></Grid.ColumnDefinitions>
    <TextBlock Text=""Codex 回复解释"" FontSize=""14"" FontWeight=""SemiBold"" VerticalAlignment=""Center""/>
    <Button x:Name=""Minimize"" Grid.Column=""1"" Style=""{StaticResource WindowButton}"" AutomationProperties.Name=""最小化"" shell:WindowChrome.IsHitTestVisibleInChrome=""True""><Path Data=""M 0,0 L 10,0"" Stroke=""#686868"" StrokeThickness=""1""/></Button>
    <Button x:Name=""CloseWindow"" Grid.Column=""2"" Style=""{StaticResource WindowButton}"" AutomationProperties.Name=""关闭"" shell:WindowChrome.IsHitTestVisibleInChrome=""True""><Path Data=""M 0,0 L 9,9 M 9,0 L 0,9"" Stroke=""#686868"" StrokeThickness=""1""/></Button>
   </Grid>
   <TabControl x:Name=""Pages"" Grid.Row=""1"" Grid.RowSpan=""3"" Background=""White"" BorderThickness=""0"" SelectedIndex=""0"">
    <TabControl.Template><ControlTemplate TargetType=""TabControl""><Grid><Grid.RowDefinitions><RowDefinition Height=""44""/><RowDefinition Height=""38""/><RowDefinition Height=""*""/></Grid.RowDefinitions><Border BorderBrush=""#EAEAEA"" BorderThickness=""0,0,0,1"" Padding=""22,0,0,0""><TabPanel IsItemsHost=""True""/></Border><ContentPresenter x:Name=""PART_SelectedContentHost"" Grid.Row=""2"" ContentSource=""SelectedContent""/></Grid></ControlTemplate></TabControl.Template>
    <TabControl.Resources>
     <Style TargetType=""TabItem""><Setter Property=""Foreground"" Value=""#858585""/><Setter Property=""FontSize"" Value=""14""/><Setter Property=""FocusVisualStyle"" Value=""{x:Null}""/><Setter Property=""Template""><Setter.Value><ControlTemplate TargetType=""TabItem""><Border x:Name=""Tab"" BorderThickness=""0,0,0,2"" BorderBrush=""Transparent"" Margin=""0,0,24,0"" Padding=""4,10,4,10"" Background=""Transparent""><ContentPresenter x:Name=""TabHeader"" ContentSource=""Header"" HorizontalAlignment=""Center"" VerticalAlignment=""Center""/></Border><ControlTemplate.Triggers><Trigger Property=""IsSelected"" Value=""True""><Setter Property=""Foreground"" Value=""#202020""/><Setter TargetName=""TabHeader"" Property=""TextElement.FontWeight"" Value=""SemiBold""/><Setter TargetName=""Tab"" Property=""BorderBrush"" Value=""#202020""/></Trigger><Trigger Property=""IsMouseOver"" Value=""True""><Setter Property=""Foreground"" Value=""#202020""/></Trigger><Trigger Property=""IsKeyboardFocused"" Value=""True""><Setter TargetName=""Tab"" Property=""Background"" Value=""#F5F5F5""/></Trigger></ControlTemplate.Triggers></ControlTemplate></Setter.Value></Setter></Style>
    </TabControl.Resources>
    <TabItem x:Name=""ExplainTab"" Header=""解释"">
     <Grid Margin=""22,18,22,22""><Grid.RowDefinitions><RowDefinition Height=""Auto""/><RowDefinition Height=""Auto""/><RowDefinition Height=""*""/><RowDefinition Height=""Auto""/><RowDefinition Height=""Auto""/></Grid.RowDefinitions>
      <TextBlock x:Name=""ChatName"" Grid.Row=""0"" Margin=""0,0,0,18"" FontSize=""17"" FontWeight=""SemiBold"" TextWrapping=""Wrap""/>
      <TextBlock x:Name=""Status"" Grid.Row=""1"" Style=""{StaticResource Notice}""/>
      <Grid x:Name=""ExplanationHost"" Grid.Row=""2""/>
      <TextBlock x:Name=""Failure"" Grid.Row=""3"" Style=""{StaticResource Notice}"" Margin=""0,12,0,0"" Foreground=""#AD5142""/>
      <Button x:Name=""ExplainCurrent"" Grid.Row=""4"" Content=""解释当前对话"" Margin=""0,16,0,0"" Style=""{StaticResource ExplainButton}"" AutomationProperties.Name=""解释当前对话"" ToolTip=""解释当前标签中这段聊天的最新完整回复""/>
     </Grid>
    </TabItem>
    <TabItem x:Name=""AskTab"" Header=""提问"">
     <Grid Margin=""22,14,22,18""><Grid.RowDefinitions><RowDefinition Height=""Auto""/><RowDefinition Height=""*""/><RowDefinition Height=""Auto""/><RowDefinition Height=""Auto""/></Grid.RowDefinitions>
      <Grid Margin=""0,0,0,16""><Grid.ColumnDefinitions><ColumnDefinition Width=""*""/><ColumnDefinition Width=""32""/></Grid.ColumnDefinitions>
       <TextBlock x:Name=""AskChatName"" FontSize=""13"" Foreground=""#858585"" TextTrimming=""CharacterEllipsis"" VerticalAlignment=""Center""/>
       <Button x:Name=""QuestionMenu"" Grid.Column=""1"" Style=""{StaticResource WindowButton}"" AutomationProperties.Name=""提问选项"" ToolTip=""提问选项""><StackPanel Orientation=""Horizontal""><Ellipse Width=""3"" Height=""3"" Fill=""#686868"" Margin=""2""/><Ellipse Width=""3"" Height=""3"" Fill=""#686868"" Margin=""2""/><Ellipse Width=""3"" Height=""3"" Fill=""#686868"" Margin=""2""/></StackPanel><Button.ContextMenu><ContextMenu><MenuItem x:Name=""RestartQuestions"" Header=""重新开始提问""/></ContextMenu></Button.ContextMenu></Button>
      </Grid>
      <Grid Grid.Row=""1""><Grid x:Name=""QuestionsHost""/><StackPanel x:Name=""QuestionWelcome"" VerticalAlignment=""Center"" HorizontalAlignment=""Center"" IsHitTestVisible=""False""><TextBlock Text=""有什么想问的？"" FontSize=""20"" FontWeight=""SemiBold"" HorizontalAlignment=""Center""/><TextBlock x:Name=""QuestionHint"" Text=""结合这段聊天，继续聊聊"" FontSize=""13"" Foreground=""#858585"" Margin=""0,10,0,0"" HorizontalAlignment=""Center""/></StackPanel></Grid>
      <StackPanel Grid.Row=""2"" Margin=""0,10,0,0""><TextBlock x:Name=""AskStatus"" Style=""{StaticResource Notice}"" Margin=""0,0,0,8""/><TextBlock x:Name=""AskFailure"" Style=""{StaticResource Notice}"" Foreground=""#AD5142"" Margin=""0,0,0,8""/></StackPanel>
      <Border x:Name=""Composer"" Grid.Row=""3"" ClipToBounds=""True"" CornerRadius=""22"" Background=""White"" BorderBrush=""#E5E5E5"" BorderThickness=""1"" Padding=""14,12,10,10""><Grid><Grid.RowDefinitions><RowDefinition Height=""Auto""/><RowDefinition Height=""38""/></Grid.RowDefinitions>
       <Grid><TextBox x:Name=""QuestionInput"" AcceptsReturn=""True"" TextWrapping=""Wrap"" MinHeight=""46"" MaxHeight=""140"" Padding=""0"" BorderThickness=""0"" Background=""Transparent"" FontWeight=""Normal"" FontSize=""16"" VerticalScrollBarVisibility=""Auto"" MaxLength=""32000"" AutomationProperties.Name=""输入问题""><TextBox.Template><ControlTemplate TargetType=""TextBox""><ScrollViewer x:Name=""PART_ContentHost""/></ControlTemplate></TextBox.Template></TextBox><TextBlock x:Name=""QuestionPlaceholder"" Text=""询问这段聊天…"" Foreground=""#B4B4B4"" FontWeight=""Normal"" FontSize=""16"" IsHitTestVisible=""False""><TextBlock.Style><Style TargetType=""TextBlock""><Setter Property=""Visibility"" Value=""Collapsed""/><Style.Triggers><DataTrigger Binding=""{Binding Text, ElementName=QuestionInput}"" Value=""""><Setter Property=""Visibility"" Value=""Visible""/></DataTrigger></Style.Triggers></Style></TextBlock.Style></TextBlock></Grid>
       <Button x:Name=""SendQuestion"" IsEnabled=""False"" Grid.Row=""1"" Width=""32"" Height=""32"" HorizontalAlignment=""Right"" VerticalAlignment=""Bottom"" AutomationProperties.Name=""发送问题"" ToolTip=""Enter 发送 · Shift+Enter 换行"" Foreground=""White"" FocusVisualStyle=""{x:Null}""><Button.Template><ControlTemplate TargetType=""Button""><Border x:Name=""SendSurface"" CornerRadius=""16"" Background=""#202020""><ContentPresenter HorizontalAlignment=""Center"" VerticalAlignment=""Center""/></Border><ControlTemplate.Triggers><Trigger Property=""IsMouseOver"" Value=""True""><Setter TargetName=""SendSurface"" Property=""Background"" Value=""#444444""/></Trigger><Trigger Property=""IsKeyboardFocused"" Value=""True""><Setter TargetName=""SendSurface"" Property=""Background"" Value=""#555555""/></Trigger><Trigger Property=""IsEnabled"" Value=""False""><Setter TargetName=""SendSurface"" Property=""Background"" Value=""#DCDCDC""/></Trigger></ControlTemplate.Triggers></ControlTemplate></Button.Template><Path x:Name=""SendIcon"" Data=""M 0,6 L 5,1 L 10,6 M 5,1 L 5,12"" Stroke=""White"" StrokeThickness=""1.8"" StrokeStartLineCap=""Round"" StrokeEndLineCap=""Round"" StrokeLineJoin=""Round""/></Button>
      </Grid></Border>
     </Grid>
    </TabItem>
   </TabControl>
   <ScrollViewer x:Name=""ChatStrip"" Grid.Row=""2"" Margin=""18,4,12,2"" HorizontalScrollBarVisibility=""Hidden"" VerticalScrollBarVisibility=""Disabled"" PanningMode=""HorizontalOnly""><StackPanel x:Name=""ChatTabs"" Orientation=""Horizontal""/></ScrollViewer>
  </Grid>
 </Border>
</Window>");
                var button = (Button)window.FindName("ExplainCurrent");
                Func<Task<string>> currentChat = () => args.Length > 3 ? Task.FromResult(args[3]) : DesktopChat.Current(node, sourceHome);
                var chatName = (TextBlock)window.FindName("ChatName");
                var explainStatus = (TextBlock)window.FindName("Status");
                var askStatus = (TextBlock)window.FindName("AskStatus");
                var explanation = new MarkdownView();
                ((Grid)window.FindName("ExplanationHost")).Children.Add(explanation);
                var explainFailure = (TextBlock)window.FindName("Failure");
                var askFailure = (TextBlock)window.FindName("AskFailure");
                var questions = new MarkdownView();
                ((Grid)window.FindName("QuestionsHost")).Children.Add(questions);
                var askChatName = (TextBlock)window.FindName("AskChatName");
                var welcome = (StackPanel)window.FindName("QuestionWelcome");
                var hint = (TextBlock)window.FindName("QuestionHint");
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
                string lastDesktopId = args.Length > 3 ? args[3] : null, chatTabsKey = null;
                var drafts = new Dictionary<string, string>();
                var chatTabs = (StackPanel)window.FindName("ChatTabs");
                var chatStrip = (ScrollViewer)window.FindName("ChatStrip");
                chatStrip.PreviewMouseWheel += (sender, ev) => { chatStrip.ScrollToHorizontalOffset(chatStrip.HorizontalOffset - ev.Delta); ev.Handled = true; };
                Action refresh = null;
                Func<string, Task> selectTab = null;
                bool closed = false, asking = false, submitting = false, selecting = false, questionsInitialized = false, questionReady = false, questionBusy = false, stopping = false;
                Task questionsInitialization = null;
                var pages = (TabControl)window.FindName("Pages");
                var questionInput = (TextBox)window.FindName("QuestionInput");
                var sendQuestion = (Button)window.FindName("SendQuestion");
                var questionMenu = (Button)window.FindName("QuestionMenu");
                var restartQuestions = (MenuItem)window.FindName("RestartQuestions");
                Action<string> showFailure = text => { (asking ? askFailure : explainFailure).Text = text; };
                var sendIcon = (System.Windows.Shapes.Path)window.FindName("SendIcon");
                var arrowGeometry = sendIcon.Data;
                var stopGeometry = System.Windows.Media.Geometry.Parse("M 1,1 L 11,1 L 11,11 L 1,11 Z");
                Action updateSendQuestion = () => {
                    sendQuestion.IsEnabled = !submitting && !selecting && (questionBusy ? !stopping : questionReady && !String.IsNullOrWhiteSpace(questionInput.Text));
                    sendIcon.Data = questionBusy ? stopGeometry : arrowGeometry;
                    sendIcon.Fill = questionBusy ? System.Windows.Media.Brushes.White : System.Windows.Media.Brushes.Transparent;
                    sendQuestion.ToolTip = questionBusy ? stopping ? "正在停止…" : "停止生成" : "Enter 发送 · Shift+Enter 换行";
                    System.Windows.Automation.AutomationProperties.SetName(sendQuestion, questionBusy ? "停止生成" : "发送问题");
                };
                string fontSettings = Path.Combine(sourceHome, "config.toml");
                DateTime lastFontSettings = DateTime.MinValue;
                refresh = () => {
                    DateTime changed = File.GetLastWriteTimeUtc(fontSettings);
                    if (lastFontSettings != changed) {
                        var fonts = DesktopFonts.Read(fontSettings);
                        questionInput.FontSize = fonts.Sans;
                        ((TextBlock)window.FindName("QuestionPlaceholder")).FontSize = fonts.Sans;
                        explanation.SetFontSizes(fonts.Sans, fonts.Code);
                        questions.SetFontSizes(fonts.Sans, fonts.Code);
                        lastFontSettings = changed;
                    }
                    var status = asking ? askStatus : explainStatus;
                    var failure = asking ? askFailure : explainFailure;
                    var selected = ReadJson(Path.Combine(directory, "selection.json"));
                    if (selected == null) {
                        chatName.Text = "尚未选择聊天"; askChatName.Text = "当前讨论：尚未选择聊天"; explanation.SetText(""); questions.SetText("");
                        questions.Visibility = Visibility.Collapsed; welcome.Visibility = Visibility.Visible; hint.Text = "在主窗口选中聊天后自动同步";
                        questionBusy = false; stopping = false; questionReady = true; updateSendQuestion(); restartQuestions.IsEnabled = false;
                        status.Text = asking ? "" : "点击下方按钮，解释当前标签里的对话。";
                        return;
                    }
                    string id = Text(selected, "openId"); CheckId(id);
                    CheckId(Text(selected, "threadId"));
                    if (id != lastOpenId) {
                        if (lastOpenId != null) drafts[lastOpenId] = questionInput.Text;
                        string draft;
                        questionInput.Text = drafts.TryGetValue(id, out draft) ? draft : "";
                        lastOpenId = id;
                        chatName.Text = Text(selected, "title"); askChatName.Text = "当前讨论：" + chatName.Text;
                        askChatName.ToolTip = chatName.Text;
                        explainFailure.Text = ""; askFailure.Text = "";
                    }
                    var savedChats = ReadJson(Path.Combine(directory, "chats.json"));
                    string tabsKey = json.Serialize(savedChats) + id;
                    if (tabsKey != chatTabsKey) {
                        chatTabs.Children.Clear();
                        if (savedChats != null) foreach (Dictionary<string, object> chat in (System.Collections.ArrayList)savedChats["selections"]) {
                            string thread = Text(chat, "threadId");
                            bool active = Text(chat, "openId") == id;
                            var label = new TextBlock { Text = Text(chat, "title"), TextTrimming = TextTrimming.CharacterEllipsis, MaxWidth = 126, FontSize = 12, Foreground = active ? System.Windows.Media.Brushes.Black : System.Windows.Media.Brushes.DimGray };
                            var tab = new Button { Content = label, ToolTip = Text(chat, "title"), Padding = new Thickness(10,5,10,5), Margin = new Thickness(0,0,5,0), BorderThickness = new Thickness(0), Background = active ? new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(238,238,238)) : System.Windows.Media.Brushes.Transparent, FocusVisualStyle = null };
                            System.Windows.Automation.AutomationProperties.SetName(tab, "聊天标签：" + Text(chat, "title"));
                            var template = (ControlTemplate)XamlReader.Parse(@"<ControlTemplate xmlns=""http://schemas.microsoft.com/winfx/2006/xaml/presentation"" TargetType=""Button""><Border Background=""{TemplateBinding Background}"" CornerRadius=""8"" Padding=""{TemplateBinding Padding}""><ContentPresenter/></Border></ControlTemplate>");
                            tab.Template = template;
                            tab.Click += async (sender, ev) => await selectTab(thread);
                            chatTabs.Children.Add(tab);
                            if (active) tab.Loaded += (sender, ev) => tab.BringIntoView();
                        }
                        chatTabsKey = tabsKey;
                    }
                    if (asking) {
                        string prefix = Path.Combine(directory, "questions-" + id);
                        var control = ReadJson(prefix + "-control.json");
                        var answer = ReadJson(prefix + ".json");
                        if (Text(answer, "revision") != Text(control, "revision")) answer = null;
                        var messages = answer != null && answer.ContainsKey("messages") ? (System.Collections.ArrayList)answer["messages"] : new System.Collections.ArrayList();
                        string partial = Text(answer, "partial");
                        hint.Text = "结合这段聊天，继续聊聊";
                        bool pending = Text(control, "requestId").Length > 0 && Text(control, "requestId") != Text(answer, "requestId");
                        bool busy = pending || Text(answer, "status") == "generating";
                        var worker = ReadJson(Path.Combine(dataRoot, "backend", "state.json"));
                        bool alive = worker != null && ProcessAlive(Convert.ToInt32(worker["pid"]));
                        failure.Text = Text(answer, "error");
                        if (!alive) failure.Text = "后台已退出。发送问题时将重新启动。";
                        questionBusy = alive && busy;
                        stopping = questionBusy && control != null && control.ContainsKey("stopRequested") && Convert.ToBoolean(control["stopRequested"]);
                        var thinking = answer != null && answer.ContainsKey("thinking") ? (System.Collections.ArrayList)answer["thinking"] : new System.Collections.ArrayList();
                        object activity = alive && busy ? new {
                            label = stopping ? "正在停止" : pending || Text(answer, "phase") == "preparing" ? "正在准备" : Text(answer, "phase") == "thinking" ? "正在思考" : "正在回答",
                            startedAt = pending ? Text(control, "submittedAt") : Text(answer, "startedAt")
                        } : null;
                        questions.SetMessages(messages, partial, "questions-" + id, activity, thinking);
                        bool empty = messages.Count == 0 && partial.Length == 0 && activity == null;
                        welcome.Visibility = empty ? Visibility.Visible : Visibility.Collapsed;
                        if (questionsInitialized) questions.Visibility = empty ? Visibility.Collapsed : Visibility.Visible;
                        status.Text = !alive ? "后台已退出" : "";
                        questionReady = !alive || (!busy && Text(answer, "status") != "error");
                        updateSendQuestion();
                        restartQuestions.IsEnabled = alive && !submitting && !selecting;
                        return;
                    }
                    var latest = ReadJson(Path.Combine(directory, "latest-" + id + ".json"));
                    Dictionary<string, object> state = null;
                    if (latest != null) {
                        string turn = Text(latest, "turnId");
                        if (!Regex.IsMatch(turn, "^[a-zA-Z0-9_-]{1,100}$")) throw new Exception("回复标识无效。");
                        state = ReadJson(Path.Combine(directory, "result-" + id + "-" + turn + ".json"));
                    }
                    explanation.SetText(Text(state, "text"), "explanation-" + id);
                    if (state != null) failure.Text = Text(state, "error");
                    string stateStatus = state == null ? Text(selected, "initialStatus") : Text(state, "status");
                    if (state != null && state.ContainsKey("workerPid") && (stateStatus == "queued" || stateStatus == "generating") && !ProcessAlive(Convert.ToInt32(state["workerPid"]))) {
                        stateStatus = "error";
                        failure.Text = "解释后台已退出。点击“解释当前对话”可重新生成。";
                    }
                    switch (stateStatus) {
                        case "ready": status.Text = ""; break;
                        case "queued":
                        case "generating": status.Text = "正在生成解释…"; break;
                        case "error": status.Text = "这次解释没有生成成功"; break;
                        case "unavailable": status.Text = "暂时没有找到这段聊天已保存的完整回复。"; break;
                        default: status.Text = "点击下方按钮生成解释。"; break;
                    }
                };
                pages.SelectionChanged += async (sender, ev) => {
                    if (ev.Source != pages) return;
                    asking = pages.SelectedIndex == 1;
                    if (asking && !questionsInitialized) {
                        try {
                            if (questionsInitialization == null) questionsInitialization = questions.InitializeAsync(Path.Combine(dataRoot, "questions-view"));
                            await questionsInitialization; questionsInitialized = true;
                        }
                        catch (Exception error) { if (!closed) askFailure.Text = error.Message; return; }
                    }
                    if (closed) return;
                    refresh();
                    if (asking) await window.Dispatcher.InvokeAsync(new Action(() => { if (!closed && asking) questionInput.Focus(); }));
                };
                questionInput.TextChanged += (sender, ev) => updateSendQuestion();
                var composer = (System.Windows.Controls.Border)window.FindName("Composer");
                questionInput.SizeChanged += (sender, ev) => {
                    double height = ev.NewSize.Height + 62;
                    double previous = composer.ActualHeight;
                    composer.BeginAnimation(FrameworkElement.HeightProperty, null);
                    composer.Height = height;
                    if (!SystemParameters.ClientAreaAnimation || previous == 0 || previous == height) return;
                    var animation = new System.Windows.Media.Animation.DoubleAnimationUsingKeyFrames();
                    animation.KeyFrames.Add(new System.Windows.Media.Animation.LinearDoubleKeyFrame(previous, TimeSpan.Zero));
                    animation.KeyFrames.Add(new System.Windows.Media.Animation.SplineDoubleKeyFrame(height, TimeSpan.FromMilliseconds(220), new System.Windows.Media.Animation.KeySpline(.2, 0, 0, 1)));
                    composer.BeginAnimation(FrameworkElement.HeightProperty, animation);
                };
                questionMenu.Click += (sender, ev) => {
                    questionMenu.ContextMenu.PlacementTarget = questionMenu;
                    questionMenu.ContextMenu.Placement = System.Windows.Controls.Primitives.PlacementMode.Bottom;
                    questionMenu.ContextMenu.HorizontalOffset = -158;
                    questionMenu.ContextMenu.IsOpen = true;
                };
                var selectionLock = new SemaphoreSlim(1, 1);
                selectTab = async thread => {
                    if (closed || submitting || selecting) return;
                    selecting = true;
                    await selectionLock.WaitAsync();
                    try { await Request(node, dataRoot, sourceHome, thread, false, true); if (!closed) refresh(); }
                    catch (Exception error) { if (!closed) showFailure(error.Message); }
                    finally { selectionLock.Release(); selecting = false; if (!closed) refresh(); }
                };
                Func<Task<string>> syncCurrentChat = async () => {
                    await selectionLock.WaitAsync();
                    try {
                        string current = await currentChat();
                        if (!closed && current != lastDesktopId) {
                            await Request(node, dataRoot, sourceHome, current, false, true);
                            lastDesktopId = current;
                        }
                        return Text(ReadJson(Path.Combine(directory, "selection.json")), "threadId");
                    } finally { selectionLock.Release(); }
                };
                Func<string, Task> questionAction = async action => {
                    if (submitting || selecting || ((action == "reset" || action == "stop") && lastOpenId == null)) return;
                    if (action == "ask" && (questionBusy || !sendQuestion.IsEnabled || String.IsNullOrWhiteSpace(questionInput.Text))) return;
                    string text = questionInput.Text, id = lastOpenId;
                    submitting = true; questionReady = false; updateSendQuestion(); restartQuestions.IsEnabled = false;
                    try {
                        if (action == "ask") {
                            string current = await syncCurrentChat();
                            if (closed) return;
                            await Request(node, dataRoot, sourceHome, current, false);
                            if (closed) return;
                            var selected = ReadJson(Path.Combine(directory, "selection.json"));
                            if (Text(selected, "threadId") != current) throw new Exception("当前对话已切换，请重新发送。");
                            id = Text(selected, "openId");
                            refresh();
                        }
                        await QuestionRequest(node, dataRoot, id, action, text);
                        if (!closed && lastOpenId == id) { if (action == "ask" && questionInput.Text == text) questionInput.Clear(); refresh(); }
                    } catch (Exception error) { if (!closed) showFailure(error.Message); }
                    finally { submitting = false; if (!closed) refresh(); }
                };
                sendQuestion.Click += async (sender, ev) => await questionAction(questionBusy ? "stop" : "ask");
                restartQuestions.Click += async (sender, ev) => await questionAction("reset");
                questionInput.PreviewKeyDown += async (sender, ev) => {
                    if (ev.Key == System.Windows.Input.Key.Enter && (System.Windows.Input.Keyboard.Modifiers == System.Windows.Input.ModifierKeys.None || System.Windows.Input.Keyboard.Modifiers == System.Windows.Input.ModifierKeys.Control)) {
                        ev.Handled = true; await questionAction("ask");
                    }
                };
                bool syncing = false;
                string trackingError = null;
                Func<Task> followCurrentChat = async () => {
                    if (args.Length > 3 || closed || submitting || selecting || syncing) return;
                    syncing = true;
                    try {
                        await syncCurrentChat();
                        if (!closed && trackingError != null) {
                            if (askFailure.Text == trackingError) askFailure.Text = "";
                            if (explainFailure.Text == trackingError) explainFailure.Text = "";
                            trackingError = null;
                        }
                    } finally { syncing = false; }
                };
                Func<Task> trackAndRefresh = async () => {
                    try { await followCurrentChat(); if (!closed) refresh(); }
                    catch (Exception error) { if (!closed) { trackingError = error.Message; refresh(); showFailure(trackingError); } }
                };
                var timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
                timer.Tick += async (sender, ev) => await trackAndRefresh();
                window.Activated += async (sender, ev) => await trackAndRefresh();
                button.Click += async (sender, ev) => {
                    selecting = true; button.IsEnabled = false;
                    updateSendQuestion(); restartQuestions.IsEnabled = false;
                    showFailure("");
                    try {
                        string id = await syncCurrentChat();
                        if (closed) return;
                        await Request(node, dataRoot, sourceHome, id, true);
                    } catch (Exception error) { if (!closed) showFailure(error.Message); }
                    finally { if (!closed) { selecting = false; button.IsEnabled = true; refresh(); } }
                };
                window.ContentRendered += async (sender, ev) => {
                    try { await explanation.InitializeAsync(dataRoot); if (!closed) { refresh(); timer.Start(); } }
                    catch (Exception error) { if (!closed) { explainStatus.Text = "显示未能启动"; showFailure(error.Message); } }
                };
                var app = new Application { ShutdownMode = ShutdownMode.OnExplicitShutdown };
                window.Closed += async (sender, ev) => {
                    closed = true; timer.Stop();
                    File.Delete(Path.Combine(directory, "window.json"));
                    File.Delete(Path.Combine(directory, "selection.json"));
                    File.Delete(Path.Combine(directory, "chats.json"));
                    foreach (string file in Directory.GetFiles(directory, "latest-*.json")) File.Delete(file);
                    foreach (string file in Directory.GetFiles(directory, "result-*.json")) File.Delete(file);
                    foreach (string file in Directory.GetFiles(directory, "questions-*.json")) File.Delete(file);
                    await questions.CloseAsync();
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
