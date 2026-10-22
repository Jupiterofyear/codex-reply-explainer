using System;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

class MarkdownView : WebView2 {
    const string Page = "https://reply-explainer.invalid/floating-document.html";
    readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
    CoreWebView2Environment environment;
    string profileDirectory, currentContent = "{\"text\":\"\",\"page\":\"explanation\"}";
    Task initialization;
    bool ready;

    public Task InitializeAsync(string dataRoot) {
        return initialization = InitializeCoreAsync(dataRoot);
    }
    async Task InitializeCoreAsync(string dataRoot) {
        profileDirectory = Path.Combine(dataRoot, "renderer");
        CreationProperties = new CoreWebView2CreationProperties { UserDataFolder = profileDirectory, IsInPrivateModeEnabled = true };
        await EnsureCoreWebView2Async();
        environment = CoreWebView2.Environment;
        CoreWebView2.Settings.AreHostObjectsAllowed = false;
        CoreWebView2.Settings.AreDevToolsEnabled = false;
        CoreWebView2.Settings.AreDefaultScriptDialogsEnabled = false;
        CoreWebView2.Settings.IsStatusBarEnabled = false;
        CoreWebView2.SetVirtualHostNameToFolderMapping("reply-explainer.invalid", AppDomain.CurrentDomain.BaseDirectory, CoreWebView2HostResourceAccessKind.DenyCors);
        CoreWebView2.NavigationStarting += (sender, args) => {
            if (args.Uri == Page) return;
            args.Cancel = true;
            if (args.IsUserInitiated) OpenLink(args.Uri);
        };
        CoreWebView2.NewWindowRequested += (sender, args) => { args.Handled = true; if (args.IsUserInitiated) OpenLink(args.Uri); };
        CoreWebView2.NavigationCompleted += (sender, args) => {
            if (!args.IsSuccess) throw new InvalidOperationException("正文页面未能加载：" + args.WebErrorStatus);
            ready = true; SendText();
        };
        CoreWebView2.Navigate(Page);
    }
    static void OpenLink(string value) {
        Uri uri;
        if (Uri.TryCreate(value, UriKind.Absolute, out uri) && (uri.Scheme == "https" || uri.Scheme == "http"))
            Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true });
    }
    public void SetText(string value, string page = "explanation") {
        SetContent(new { text = value, page = page });
    }
    public void SetMessages(object messages, string partial, string page) {
        SetContent(new { messages = messages, partial = partial, page = page });
    }
    void SetContent(object content) {
        string value = json.Serialize(content);
        if (value == currentContent) return;
        currentContent = value;
        if (ready) SendText();
    }
    void SendText() { CoreWebView2.PostWebMessageAsJson(currentContent); }
    public async Task CloseAsync() {
        if (initialization != null) await initialization;
        if (environment == null) { Dispose(); return; }
        var exited = new TaskCompletionSource<bool>();
        environment.BrowserProcessExited += (sender, args) => exited.TrySetResult(true);
        Dispose();
        await exited.Task;
        Directory.Delete(profileDirectory, true);
    }
}
