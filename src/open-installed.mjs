import { readFile } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";

const home = process.env.REPLY_EXPLAINER_SOURCE_HOME || process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
const settings = JSON.parse(await readFile(path.join(home, "plugins/reply-explainer-settings.json"), "utf8"));
const { stdout } = await promisify(execFile)(process.env.CODEX_CLI_PATH || settings.cliPath,
  ["plugin", "list", "--json"], { windowsHide: true, env: { ...process.env, CODEX_HOME: home } });
const plugin = JSON.parse(stdout).installed.find(item => item.pluginId === "reply-explainer@reply-explainer-preview");
if (!plugin || !/^[0-9A-Za-z.+-]+$/.test(plugin.version)) throw new Error("没有找到已安装的 Codex 回复解释。请重新运行安装脚本。");
const root = path.join(home, "plugins/cache/reply-explainer-preview/reply-explainer", plugin.version);
const child = spawn(process.execPath, [path.join(root, "dist/start.mjs")], {
  cwd: root, windowsHide: true, stdio: "inherit", env: { ...process.env, REPLY_EXPLAINER_SOURCE_HOME: home }
});
child.once("error", error => { throw error; });
child.once("exit", code => { process.exitCode = code ?? 1; });
