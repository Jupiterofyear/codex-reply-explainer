using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Markup;

class PromptSettings {
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
    static async Task<string> Request(string node, string dataRoot, string action, object value = null) {
        string script = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "prompt-request.mjs");
        var info = new ProcessStartInfo(node, "\"" + script + "\" \"" + dataRoot + "\" " + action) {
            UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true,
            RedirectStandardOutput = true, RedirectStandardError = true,
            StandardOutputEncoding = new UTF8Encoding(false), StandardErrorEncoding = new UTF8Encoding(false),
            WorkingDirectory = Path.GetDirectoryName(script)
        };
        return await Task.Run(async () => {
            using (var child = Process.Start(info)) {
                var output = child.StandardOutput.ReadToEndAsync();
                var error = child.StandardError.ReadToEndAsync();
                using (var input = new StreamWriter(child.StandardInput.BaseStream, new UTF8Encoding(false)))
                    if (value != null) input.Write(Json.Serialize(value));
                string result = await output, failure = await error;
                child.WaitForExit();
                if (child.ExitCode != 0) throw new Exception(failure.Trim());
                return result;
            }
        });
    }
    public static async Task Show(Window owner, string node, string dataRoot, double fontSize) {
        var values = Json.Deserialize<Dictionary<string, object>>(await Request(node, dataRoot, "get"));
        var prompts = (Dictionary<string, object>)values["prompts"];
        var defaults = (Dictionary<string, object>)values["defaults"];
        var window = (Window)XamlReader.Parse(@"<Window xmlns=""http://schemas.microsoft.com/winfx/2006/xaml/presentation"" xmlns:x=""http://schemas.microsoft.com/winfx/2006/xaml"" xmlns:shell=""clr-namespace:System.Windows.Shell;assembly=PresentationFramework""
 Title=""提示词设置"" Width=""660"" Height=""730"" MinWidth=""320"" MinHeight=""480"" WindowStartupLocation=""CenterOwner"" WindowStyle=""None"" ResizeMode=""CanResize"" ShowInTaskbar=""False"" Background=""White"" Foreground=""#202020"" FontFamily=""Segoe UI, Microsoft YaHei UI"" FontSize=""14"" UseLayoutRounding=""True"" TextOptions.TextFormattingMode=""Display"" TextOptions.TextRenderingMode=""ClearType"">
 <shell:WindowChrome.WindowChrome><shell:WindowChrome CaptionHeight=""48"" ResizeBorderThickness=""6"" CornerRadius=""12"" GlassFrameThickness=""0"" UseAeroCaptionButtons=""False""/></shell:WindowChrome.WindowChrome>
 <Window.Resources><Style x:Key=""SettingsAction"" TargetType=""Button""><Setter Property=""Height"" Value=""40""/><Setter Property=""Background"" Value=""White""/><Setter Property=""BorderBrush"" Value=""#DCDCDC""/><Setter Property=""FocusVisualStyle"" Value=""{x:Null}""/><Setter Property=""Template""><Setter.Value><ControlTemplate TargetType=""Button""><Border x:Name=""Surface"" CornerRadius=""12"" Background=""{TemplateBinding Background}"" BorderBrush=""{TemplateBinding BorderBrush}"" BorderThickness=""1""><ContentPresenter HorizontalAlignment=""Center"" VerticalAlignment=""Center""/></Border><ControlTemplate.Triggers><Trigger Property=""IsMouseOver"" Value=""True""><Setter TargetName=""Surface"" Property=""Opacity"" Value=""0.75""/></Trigger><Trigger Property=""IsKeyboardFocused"" Value=""True""><Setter TargetName=""Surface"" Property=""BorderBrush"" Value=""#686868""/></Trigger><Trigger Property=""IsEnabled"" Value=""False""><Setter TargetName=""Surface"" Property=""Opacity"" Value=""0.4""/></Trigger></ControlTemplate.Triggers></ControlTemplate></Setter.Value></Setter></Style></Window.Resources>
 <Border BorderBrush=""#E5E5E5"" BorderThickness=""1"" CornerRadius=""12"" Padding=""20,0,20,20""><Grid>
  <Grid.RowDefinitions><RowDefinition Height=""48""/><RowDefinition Height=""Auto""/><RowDefinition Height=""*""/><RowDefinition Height=""Auto""/><RowDefinition Height=""Auto""/></Grid.RowDefinitions>
  <Grid><Grid.ColumnDefinitions><ColumnDefinition Width=""*""/><ColumnDefinition Width=""32""/></Grid.ColumnDefinitions><TextBlock Text=""提示词设置"" TextTrimming=""CharacterEllipsis"" Margin=""0,0,8,0"" FontWeight=""SemiBold"" VerticalAlignment=""Center""/><Button x:Name=""Close"" Grid.Column=""1"" HorizontalAlignment=""Right"" Width=""32"" Height=""32"" AutomationProperties.Name=""关闭设置"" shell:WindowChrome.IsHitTestVisibleInChrome=""True""><Path Data=""M 0,0 L 9,9 M 9,0 L 0,9"" Stroke=""#686868"" StrokeThickness=""1""/></Button></Grid>
  <TextBlock Grid.Row=""1"" Text=""分别设置解释和提问的回答要求。保存后对所有聊天生效，正在生成的回答继续使用原设置。"" TextWrapping=""Wrap"" Foreground=""#767676"" Margin=""0,10,0,16""/>
  <TabControl x:Name=""Tabs"" Grid.Row=""2"" BorderThickness=""0"" Background=""White"">
   <TabControl.Template><ControlTemplate TargetType=""TabControl""><Grid><Grid.RowDefinitions><RowDefinition Height=""44""/><RowDefinition Height=""*""/></Grid.RowDefinitions><Border BorderBrush=""#EAEAEA"" BorderThickness=""0,0,0,1""><TabPanel IsItemsHost=""True""/></Border><ContentPresenter x:Name=""PART_SelectedContentHost"" Grid.Row=""1"" ContentSource=""SelectedContent"" Margin=""0,16,0,0""/></Grid></ControlTemplate></TabControl.Template>
   <TabItem Header=""解释提示词""><Grid><Grid.RowDefinitions><RowDefinition Height=""Auto""/><RowDefinition Height=""*""/></Grid.RowDefinitions><TextBlock Text=""点击“解释当前对话”时，使用这里的文字解释最新完整回复。"" TextWrapping=""Wrap"" Foreground=""#767676"" Margin=""0,0,0,12""/><Border Grid.Row=""1"" CornerRadius=""12"" BorderBrush=""#DCDCDC"" BorderThickness=""1"" Padding=""14""><TextBox x:Name=""Explanation"" AutomationProperties.Name=""解释提示词""/></Border></Grid></TabItem>
   <TabItem Header=""提问提示词""><Grid><Grid.RowDefinitions><RowDefinition Height=""Auto""/><RowDefinition Height=""*""/></Grid.RowDefinitions><TextBlock Text=""作为提问分支的固定回答要求。修改后，下一问会建立新分支并带上小窗历史。"" TextWrapping=""Wrap"" Foreground=""#767676"" Margin=""0,0,0,12""/><Border Grid.Row=""1"" CornerRadius=""12"" BorderBrush=""#DCDCDC"" BorderThickness=""1"" Padding=""14""><TextBox x:Name=""Question"" AutomationProperties.Name=""提问提示词""/></Border></Grid></TabItem>
   <TabItem Header=""工作原理""><ScrollViewer VerticalScrollBarVisibility=""Auto"" HorizontalScrollBarVisibility=""Disabled""><StackPanel Margin=""0,0,10,8"">
    <TextBlock FontWeight=""SemiBold"" TextWrapping=""Wrap"" Text=""提示词决定怎样答，上下文提供讨论依据""/>
    <TextBlock Margin=""0,8,0,18"" TextWrapping=""Wrap"" Text=""提示词用于说明目标、语气、长度和需要的依据。上下文提供主对话及小窗讨论的内容。修改提示词会影响后续回答的组织方式；模型仍会结合继承的对话与其中的要求判断怎样作答。""/>
    <TextBlock FontWeight=""SemiBold"" TextWrapping=""Wrap"" Text=""解释与提问如何使用提示词""/>
    <TextBlock Margin=""0,8,0,18"" TextWrapping=""Wrap"" Text=""解释：每次点击按钮，复制主对话截至最新完整回复的上下文，在独立分支中把解释提示词作为本轮请求发送。修改后即使主回复未变，也可以重新解释。&#10;&#10;提问：在独立分支建立时，把提问提示词作为应用的固定指令传入；它的优先级高于普通用户消息。后续提问沿用该分支。主对话出现新的完整回复，或提问提示词改变时，下一问自动建立新分支。分支保留主对话当时可用的上下文，不向主聊天发送消息。""/>
    <TextBlock FontWeight=""SemiBold"" TextWrapping=""Wrap"" Text=""小窗历史怎样加入""/>
    <TextBlock Margin=""0,8,0,18"" TextWrapping=""Wrap"" Text=""建立新提问分支时，小窗中保留的问答会作为带来源标记的历史材料一次性加入。程序另加固定说明：它们是过去的讨论，旧计划、推测和回答不代表当前真实进度，事实和进度以最新主对话的证据为准。这个说明独立于可编辑的提示词。已有回答继续保留，保存设置不会重写它们。""/>
    <TextBlock FontWeight=""SemiBold"" TextWrapping=""Wrap"" Text=""怎样写更有效""/>
    <TextBlock Margin=""0,8,0,18"" TextWrapping=""Wrap"" Text=""写清目标和取舍即可，例如：先给结论，再给两三条关键依据；涉及计算时保留必要推导。避免同时要求“极短”与“所有细节完整展开”。长提示词会占用上下文，反复重复要求不一定更有效。&#10;&#10;默认提示词要求简洁、无防御性、有信息量。你可以自由修改。留空表示不添加这项回答要求；解释仍会发送基本的解释请求，提问仍保留程序对历史来源的说明。提示词不能改变模型与运行环境中优先级更高的要求，也不会改变提问分支的工具权限。""/>
    <TextBlock FontWeight=""SemiBold"" TextWrapping=""Wrap"" Text=""保存、恢复默认与生效时间""/>
    <TextBlock Margin=""0,8,0,18"" TextWrapping=""Wrap"" Text=""设置保存在本机，关闭小窗、切换聊天和更新插件后仍保留。点击“保存设置”后，从下一次请求开始生效；已经开始的生成继续使用原设置。“恢复本项默认”只修改当前编辑框，仍需保存；取消会放弃本次编辑。每项最多 32000 字。""/>
    <TextBlock TextWrapping=""Wrap""><Hyperlink x:Name=""Documentation"" Focusable=""False"">参考：OpenAI 提示词说明（英文）</Hyperlink></TextBlock>
   </StackPanel></ScrollViewer></TabItem>
  </TabControl>
  <TextBlock x:Name=""Error"" Grid.Row=""3"" Foreground=""#AD5142"" TextWrapping=""Wrap"" Margin=""0,12,0,0""/>
  <Grid x:Name=""Actions"" Grid.Row=""4"" Margin=""0,16,0,0""><Grid.RowDefinitions><RowDefinition Height=""Auto""/><RowDefinition Height=""Auto""/></Grid.RowDefinitions><Grid.ColumnDefinitions><ColumnDefinition Width=""*""/><ColumnDefinition Width=""84""/><ColumnDefinition Width=""110""/></Grid.ColumnDefinitions><Button x:Name=""Restore"" Content=""恢复本项默认"" HorizontalAlignment=""Left"" Width=""130""/><Button x:Name=""Cancel"" Grid.Column=""1"" Content=""取消"" IsCancel=""True"" Margin=""0,0,10,0""/><Button x:Name=""Save"" Grid.Column=""2"" Content=""保存设置"" Background=""#202020"" Foreground=""White""/></Grid>
 </Grid></Border>
</Window>");
        window.Owner = owner;
        window.FontSize = fontSize;
        window.Height = Math.Min(window.Height, SystemParameters.WorkArea.Height - 48);
        var tabs = (TabControl)window.FindName("Tabs");
        tabs.Resources = ((TabControl)owner.FindName("Pages")).Resources;
        var explanation = (TextBox)window.FindName("Explanation");
        var question = (TextBox)window.FindName("Question");
        foreach (var editor in new[] { explanation, question }) {
            editor.FontSize = fontSize;
            editor.FontWeight = FontWeights.Normal;
            editor.AcceptsReturn = true;
            editor.TextWrapping = TextWrapping.Wrap;
            editor.VerticalScrollBarVisibility = ScrollBarVisibility.Auto;
            editor.BorderThickness = new Thickness(0);
            editor.Background = System.Windows.Media.Brushes.Transparent;
            editor.MaxLength = 32000;
        }
        explanation.Text = (string)prompts["explanation"];
        question.Text = (string)prompts["question"];
        var close = (Button)window.FindName("Close");
        close.Style = (Style)owner.FindResource("WindowButton");
        var save = (Button)window.FindName("Save");
        var cancel = (Button)window.FindName("Cancel");
        var restore = (Button)window.FindName("Restore");
        foreach (var button in new[] { save, cancel, restore }) button.Style = (Style)window.FindResource("SettingsAction");
        window.SizeChanged += (s, e) => {
            if (!e.WidthChanged) return;
            bool narrow = window.ActualWidth < 480;
            ((TabItem)tabs.Items[0]).Header = narrow ? "解释" : "解释提示词";
            ((TabItem)tabs.Items[1]).Header = narrow ? "提问" : "提问提示词";
            Grid.SetColumnSpan(restore, narrow ? 3 : 1);
            restore.Margin = new Thickness(0, 0, 0, narrow ? 10 : 0);
            Grid.SetRow(cancel, narrow ? 1 : 0);
            Grid.SetRow(save, narrow ? 1 : 0);
        };
        ((TabItem)tabs.Items[0]).ToolTip = "解释提示词";
        ((TabItem)tabs.Items[1]).ToolTip = "提问提示词";
        close.Click += (s, e) => window.Close();
        bool saving = false;
        window.Closing += (s, e) => e.Cancel = saving;
        var actions = (Grid)window.FindName("Actions");
        var failure = (TextBlock)window.FindName("Error");
        tabs.SelectionChanged += (s, e) => {
            bool editing = tabs.SelectedIndex < 2;
            actions.Visibility = editing ? Visibility.Visible : Visibility.Collapsed;
            actions.IsEnabled = editing;
            failure.Visibility = editing ? Visibility.Visible : Visibility.Collapsed;
            restore.IsEnabled = !saving && editing;
        };
        restore.Click += (s, e) => {
            if (tabs.SelectedIndex == 0) explanation.Text = (string)defaults["explanation"];
            else question.Text = (string)defaults["question"];
        };
        ((System.Windows.Documents.Hyperlink)window.FindName("Documentation")).Click += (s, e) => Process.Start(new ProcessStartInfo("https://developers.openai.com/api/docs/guides/prompt-engineering") { UseShellExecute = true });
        save.Click += async (s, e) => {
            saving = true; save.IsEnabled = false; cancel.IsEnabled = false; close.IsEnabled = false; restore.IsEnabled = false;
            try {
                await Request(node, dataRoot, "save", new { explanation = explanation.Text, question = question.Text });
                saving = false; window.DialogResult = true;
            } catch (Exception error) {
                ((TextBlock)window.FindName("Error")).Text = "保存失败：" + error.Message;
            } finally {
                saving = false; save.IsEnabled = true; cancel.IsEnabled = true; close.IsEnabled = true; restore.IsEnabled = tabs.SelectedIndex < 2;
            }
        };
        window.ShowDialog();
    }
}
