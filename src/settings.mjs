import { readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export async function loadSettings(root) {
  let settings = JSON.parse(await readFile(path.join(root, "settings.json"), "utf8"));
  if (settings.installedSettings) {
    const home = process.env.REPLY_EXPLAINER_SOURCE_HOME || process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
    settings = JSON.parse(await readFile(path.join(home, "plugins/reply-explainer-settings.json"), "utf8"));
  }
  return {
    dataDirectory: path.resolve(root, process.env.REPLY_EXPLAINER_DATA_DIR || settings.dataDirectory),
    cliPath: process.env.CODEX_CLI_PATH || settings.cliPath
  };
}
