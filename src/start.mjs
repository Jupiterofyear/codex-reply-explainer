import { loadSettings } from "./settings.mjs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { openFloatingWindow } from "./floating.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const settings = await loadSettings(root);
await openFloatingWindow({ root,
  dataRoot: settings.dataDirectory,
  sourceHome: process.env.REPLY_EXPLAINER_SOURCE_HOME || process.env.CODEX_HOME || path.join(os.homedir(), ".codex")
});
