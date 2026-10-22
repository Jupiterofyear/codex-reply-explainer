// src/open-installed.mjs
import { readFile } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
var home = process.env.REPLY_EXPLAINER_SOURCE_HOME || process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
var settings = JSON.parse(await readFile(path.join(home, "plugins/reply-explainer-settings.json"), "utf8"));
var { stdout } = await promisify(execFile)(
  process.env.CODEX_CLI_PATH || settings.cliPath,
  ["plugin", "list", "--json"],
  { windowsHide: true, env: { ...process.env, CODEX_HOME: home } }
);
var plugin = JSON.parse(stdout).installed.find((item) => item.pluginId === "reply-explainer@reply-explainer-preview");
if (!plugin || !/^[0-9A-Za-z.+-]+$/.test(plugin.version)) throw new Error("\u6CA1\u6709\u627E\u5230\u5DF2\u5B89\u88C5\u7684 Codex \u56DE\u590D\u89E3\u91CA\u3002\u8BF7\u91CD\u65B0\u8FD0\u884C\u5B89\u88C5\u811A\u672C\u3002");
var root = path.join(home, "plugins/cache/reply-explainer-preview/reply-explainer", plugin.version);
var child = spawn(process.execPath, [path.join(root, "dist/start.mjs")], {
  cwd: root,
  windowsHide: true,
  stdio: "inherit",
  env: { ...process.env, REPLY_EXPLAINER_SOURCE_HOME: home }
});
child.once("error", (error) => {
  throw error;
});
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
