import { build } from "esbuild";
import { mkdir, readFile, writeFile, cp, readdir } from "node:fs/promises";
await mkdir("dist", { recursive: true });
import { execFileSync } from "node:child_process";
import path from "node:path";
const temporary = path.resolve(".local/build-tmp");
await mkdir(temporary, { recursive: true });
const framework = path.join(process.env.WINDIR, "Microsoft.NET/Framework64/v4.0.30319");
execFileSync(path.join(framework, "csc.exe"), ["/nologo", "/target:winexe", "/platform:x64", "/codepage:65001", "/out:" + path.resolve("dist/floating.exe"),
  "/reference:" + path.join(framework, "WPF/PresentationFramework.dll"),
  "/reference:" + path.join(framework, "WPF/PresentationCore.dll"),
  "/reference:" + path.join(framework, "WPF/WindowsBase.dll"),
  "/reference:" + path.join(framework, "System.Windows.Forms.dll"),
  "/reference:" + path.join(framework, "System.Xaml.dll"),
  "/reference:" + path.join(framework, "System.Web.Extensions.dll"),
  "/reference:" + path.resolve("vendor/webview2/lib/net462/Microsoft.Web.WebView2.Core.dll"),
  "/reference:" + path.resolve("vendor/webview2/lib/net462/Microsoft.Web.WebView2.Wpf.dll"),
  path.resolve("src/floating.cs"), path.resolve("src/markdown-view.cs")],
  { env: { ...process.env, TMP: temporary, TEMP: temporary }, windowsHide: true, stdio: "inherit" });
await build({ entryPoints: ["src/server.mjs", "src/stop.mjs", "src/request.mjs", "src/start.mjs", "src/open-installed.mjs", "src/worker.mjs"], outdir: "dist", bundle: true, platform: "node", format: "esm", target: "node22", outExtension: { ".js": ".mjs" } });
for (const name of ["Microsoft.Web.WebView2.Core.dll", "Microsoft.Web.WebView2.Wpf.dll"])
  await cp("vendor/webview2/lib/net462/" + name, "dist/" + name);
await cp("vendor/webview2/runtimes/win-x64/native/WebView2Loader.dll", "dist/WebView2Loader.dll");
let mathCss = await readFile("node_modules/katex/dist/katex.min.css", "utf8");
const fonts = new Map();
for (const match of mathCss.matchAll(/src:url\((fonts\/[^)]+\.woff2)\)[^;}]+/g))
  fonts.set(match[1], (await readFile("node_modules/katex/dist/" + match[1])).toString("base64"));
mathCss = mathCss.replace(/src:url\((fonts\/[^)]+\.woff2)\)[^;}]+/g, (_, file) => 'src:url(data:font/woff2;base64,' + fonts.get(file) + ') format("woff2")');
const markdownCss = mathCss + "\n" + await readFile("src/markdown.css", "utf8");
await build({ entryPoints: ["src/floating-document.mjs"], outfile: "dist/floating-document.js", bundle: true, platform: "browser", format: "esm", target: "es2022" });
await writeFile("dist/floating-document.html", (await readFile("src/floating-document.html", "utf8")).replace("/* MARKDOWN_STYLE */", () => markdownCss));
await mkdir("dist/licenses", { recursive: true });
for (const name of ["LICENSE.txt", "NOTICE.txt"]) await cp("vendor/webview2/" + name, "dist/licenses/WebView2-" + name);
const modules = await readdir("node_modules", { withFileTypes: true });
const packageFolders = [];
for (const entry of modules) {
  if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
  if (entry.name.startsWith("@")) {
    for (const child of await readdir("node_modules/" + entry.name, { withFileTypes: true }))
      if (child.isDirectory()) packageFolders.push(entry.name + "/" + child.name);
  } else packageFolders.push(entry.name);
}
const notices = ["# Third-party notices", "", "Runtime bundles contain code from the packages below. Their original license texts are included in dist/licenses. Microsoft WebView2 SDK redistribution terms and notices are also included.", "", "| Package | Version | License |", "|---|---|---|"];
for (const name of packageFolders.sort()) {
  const folder = "node_modules/" + name;
  const manifest = JSON.parse(await readFile(folder + "/package.json", "utf8"));
  notices.push(`| ${name} | ${manifest.version} | ${typeof manifest.license === "string" ? manifest.license : "See bundled license"} |`);
  for (const file of await readdir(folder))
    if (/^(license|copying|notice)(\.|$)/i.test(file)) await cp(folder + "/" + file, "dist/licenses/" + name.replaceAll("/", "-") + "-" + file);
}
await writeFile("THIRD_PARTY_NOTICES.md", notices.join("\n") + "\n");
const panel = await build({ entryPoints: ["src/panel.mjs"], bundle: true, format: "esm", platform: "browser", target: "es2022", write: false });
const html = await readFile("src/panel.html", "utf8");
await writeFile("dist/panel.html", html.replace("/* MARKDOWN_STYLE */", () => markdownCss).replace("/* PANEL_SCRIPT */", () => panel.outputFiles[0].text.replaceAll("</script", "<\\/script")), "utf8");
await import("./marketplace.mjs");
