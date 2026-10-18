import { readFile } from "node:fs/promises";
import path from "node:path";

export async function loadSettings(root) {
  const settings = JSON.parse(await readFile(path.join(root, "settings.json"), "utf8"));
  return {
    dataDirectory: path.resolve(root, process.env.REPLY_EXPLAINER_DATA_DIR || settings.dataDirectory),
    cliPath: process.env.CODEX_CLI_PATH || settings.cliPath
  };
}
