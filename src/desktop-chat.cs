using System;
using System.Diagnostics;
using System.Linq;
using System.Threading.Tasks;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using System.Web.Script.Serialization;

class DesktopChat {
    public static async Task<string> Current(string node, string sourceHome) {
        string title = await Task.Run(() => {
            var hosts = Process.GetProcessesByName("ChatGPT").Where(p => p.MainWindowHandle != IntPtr.Zero).ToArray();
            if (hosts.Length != 1) throw new Exception("请保留一个 Codex 主窗口后重试。");
            var automation = (IUIAutomation)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("ff48dba4-60ef-4201-aa87-54103eef594e")));
            var root = automation.ElementFromHandle(hosts[0].MainWindowHandle);
            // UIA AriaProperties, substring match. Only sidebar conversation rows qualify.
            var condition = automation.CreatePropertyConditionEx(30102, "current=page", 2);
            var selected = root.FindAll(4, condition);
            var names = new List<string>();
            var walker = automation.GetControlViewWalker();
            for (int i = 0; i < selected.Length; i++) {
                var item = selected.GetElement(i);
                var parent = item;
                for (int level = 0; level < 3; level++) {
                    parent = walker.GetParentElement(parent);
                    if (parent == null) break;
                    if ((parent.GetCurrentPropertyValue(30101) as string) == "listitem") {
                        names.Add(item.GetCurrentPropertyValue(30005) as string); break;
                    }
                }
            }
            var titles = names.Where(name => !String.IsNullOrEmpty(name)).Distinct().ToArray();
            if (titles.Length != 1) throw new Exception("请在主窗口侧栏选中一段本地聊天。");
            return titles[0];
        });
        var info = new ProcessStartInfo(node, "--disable-warning=ExperimentalWarning \"" + System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "current-chat.mjs") + "\" \"" + sourceHome + "\"") {
            UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true,
            RedirectStandardOutput = true, RedirectStandardError = true,
            StandardOutputEncoding = System.Text.Encoding.UTF8, StandardErrorEncoding = System.Text.Encoding.UTF8
        };
        return await Task.Run(() => {
            using (var child = Process.Start(info)) {
                using (var input = new System.IO.StreamWriter(child.StandardInput.BaseStream, new System.Text.UTF8Encoding(false))) input.Write(new JavaScriptSerializer().Serialize(title));
                string output = child.StandardOutput.ReadToEnd(), error = child.StandardError.ReadToEnd();
                child.WaitForExit();
                if (child.ExitCode != 0) throw new Exception(error.Trim());
                return output.Trim();
            }
        });
    }
}

// Read-only subset of the Windows UI Automation COM interfaces, in SDK vtable order.
[ComImport, Guid("30cbe57d-d9d0-452a-ab13-7ac5ac4825ee"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IUIAutomation {
    void CompareElements(); void CompareRuntimeIds(); void GetRootElement();
    IUIAutomationElement ElementFromHandle(IntPtr window);
    void ElementFromPoint(); void GetFocusedElement(); void GetRootElementBuildCache();
    void ElementFromHandleBuildCache(); void ElementFromPointBuildCache(); void GetFocusedElementBuildCache();
    void CreateTreeWalker(); IUIAutomationTreeWalker GetControlViewWalker(); void GetContentViewWalker(); void GetRawViewWalker();
    void GetRawViewCondition(); void GetControlViewCondition(); void GetContentViewCondition(); void CreateCacheRequest();
    void CreateTrueCondition(); void CreateFalseCondition(); void CreatePropertyCondition();
    [return: MarshalAs(UnmanagedType.Interface)] object CreatePropertyConditionEx(int property, [MarshalAs(UnmanagedType.Struct)] object value, int flags);
}
[ComImport, Guid("d22108aa-8ac5-49a5-837b-37bbb3d7591e"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IUIAutomationElement {
    void SetFocus(); void GetRuntimeId(); void FindFirst();
    IUIAutomationElementArray FindAll(int scope, [MarshalAs(UnmanagedType.Interface)] object condition);
    void FindFirstBuildCache(); void FindAllBuildCache(); void BuildUpdatedCache();
    [return: MarshalAs(UnmanagedType.Struct)] object GetCurrentPropertyValue(int property);
}
[ComImport, Guid("14314595-b4bc-4055-95f2-58f2e42c9855"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IUIAutomationElementArray {
    int Length { get; }
    IUIAutomationElement GetElement(int index);
}

[ComImport, Guid("4042c624-389c-4afc-a630-9df854a541fc"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IUIAutomationTreeWalker {
    IUIAutomationElement GetParentElement(IUIAutomationElement element);
}
