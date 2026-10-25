import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export async function resolveCliPath(cliPath) {
  if (!/[\\/]OpenAI[\\/]Codex[\\/]bin[\\/][0-9a-f]+[\\/]codex\.exe$/i.test(cliPath)) return cliPath;
  try { await stat(cliPath); return cliPath; }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const directory = path.dirname(path.dirname(cliPath));
  let latest;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[0-9a-f]+$/i.test(entry.name)) continue;
    const file = path.join(directory, entry.name, "codex.exe");
    let info;
    try { info = await stat(file); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    if (!latest || info.mtimeMs > latest.modified) latest = { file, modified: info.mtimeMs };
  }
  if (!latest) throw new Error("没有找到更新后的 Codex 程序，请重新安装 Codex 或指定有效的 CodexPath。");
  return latest.file;
}

export async function loadSettings(root) {
  let settings = JSON.parse(await readFile(path.join(root, "settings.json"), "utf8"));
  if (settings.installedSettings) {
    const home = process.env.REPLY_EXPLAINER_SOURCE_HOME || process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
    settings = JSON.parse(await readFile(path.join(home, "plugins/reply-explainer-settings.json"), "utf8"));
  }
  return {
    dataDirectory: path.resolve(root, process.env.REPLY_EXPLAINER_DATA_DIR || settings.dataDirectory),
    cliPath: await resolveCliPath(process.env.CODEX_CLI_PATH || settings.cliPath)
  };
}
