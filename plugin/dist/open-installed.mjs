// src/open-installed.mjs
import { readFile as readFile2 } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path2 from "node:path";

// src/settings.mjs
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
async function resolveCliPath(cliPath) {
  if (!/[\\/]OpenAI[\\/]Codex[\\/]bin[\\/][0-9a-f]+[\\/]codex\.exe$/i.test(cliPath)) return cliPath;
  try {
    await stat(cliPath);
    return cliPath;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const directory = path.dirname(path.dirname(cliPath));
  let latest;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[0-9a-f]+$/i.test(entry.name)) continue;
    const file = path.join(directory, entry.name, "codex.exe");
    let info;
    try {
      info = await stat(file);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    if (!latest || info.mtimeMs > latest.modified) latest = { file, modified: info.mtimeMs };
  }
  if (!latest) throw new Error("\u6CA1\u6709\u627E\u5230\u66F4\u65B0\u540E\u7684 Codex \u7A0B\u5E8F\uFF0C\u8BF7\u91CD\u65B0\u5B89\u88C5 Codex \u6216\u6307\u5B9A\u6709\u6548\u7684 CodexPath\u3002");
  return latest.file;
}

// src/open-installed.mjs
var home = process.env.REPLY_EXPLAINER_SOURCE_HOME || process.env.CODEX_HOME || path2.join(os.homedir(), ".codex");
var settings = JSON.parse(await readFile2(path2.join(home, "plugins/reply-explainer-settings.json"), "utf8"));
var { stdout } = await promisify(execFile)(
  await resolveCliPath(process.env.CODEX_CLI_PATH || settings.cliPath),
  ["plugin", "list", "--json"],
  { windowsHide: true, env: { ...process.env, CODEX_HOME: home } }
);
var plugin = JSON.parse(stdout).installed.find((item) => item.pluginId === "reply-explainer@reply-explainer-preview");
if (!plugin || !/^[0-9A-Za-z.+-]+$/.test(plugin.version)) throw new Error("\u6CA1\u6709\u627E\u5230\u5DF2\u5B89\u88C5\u7684 Codex \u56DE\u590D\u89E3\u91CA\u3002\u8BF7\u91CD\u65B0\u8FD0\u884C\u5B89\u88C5\u811A\u672C\u3002");
var root = path2.join(home, "plugins/cache/reply-explainer-preview/reply-explainer", plugin.version);
var child = spawn(process.execPath, [path2.join(root, "dist/start.mjs")], {
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
