// src/settings.mjs
import { readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
async function loadSettings(root2) {
  let settings2 = JSON.parse(await readFile(path.join(root2, "settings.json"), "utf8"));
  if (settings2.installedSettings) {
    const home = process.env.REPLY_EXPLAINER_SOURCE_HOME || process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
    settings2 = JSON.parse(await readFile(path.join(home, "plugins/reply-explainer-settings.json"), "utf8"));
  }
  return {
    dataDirectory: path.resolve(root2, process.env.REPLY_EXPLAINER_DATA_DIR || settings2.dataDirectory),
    cliPath: process.env.CODEX_CLI_PATH || settings2.cliPath
  };
}

// src/start.mjs
import path5 from "node:path";
import os2 from "node:os";
import { fileURLToPath } from "node:url";

// src/worker-client.mjs
import { spawn } from "node:child_process";
import { openSync, closeSync } from "node:fs";
import { setTimeout as delay2 } from "node:timers/promises";
import path3 from "node:path";

// src/state.mjs
import { readFile as readFile2, writeFile, rename, mkdir, readdir, rm, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path2 from "node:path";
import { setTimeout as delay } from "node:timers/promises";
function threadDirectory(dataRoot, threadId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(threadId)) throw new Error("\u5F53\u524D\u804A\u5929\u6807\u8BC6\u65E0\u6548\u3002");
  return path2.join(dataRoot, "threads", threadId);
}
async function readJson(file) {
  try {
    return JSON.parse(await readFile2(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
async function writeJson(file, value) {
  await mkdir(path2.dirname(file), { recursive: true });
  const temporary = file + "." + process.pid + ".tmp";
  await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", "utf8");
  const deadline = Date.now() + 5e3;
  try {
    while (true) {
      try {
        await rename(temporary, file);
        return;
      } catch (error) {
        if (process.platform !== "win32" || error.code !== "EPERM" || Date.now() >= deadline) throw error;
        await delay(25);
      }
    }
  } finally {
    await rm(temporary, { force: true });
  }
}
function explanationFiles(dataRoot, selection, turnId) {
  threadDirectory(dataRoot, selection.openId);
  if (turnId !== void 0 && !/^[a-zA-Z0-9_-]{1,100}$/.test(turnId)) throw new Error("\u56DE\u590D\u6807\u8BC6\u65E0\u6548\u3002");
  const directory = path2.join(path2.resolve(dataRoot), "floating");
  return {
    directory,
    latest: path2.join(directory, "latest-" + selection.openId + ".json"),
    result: turnId === void 0 ? null : path2.join(directory, "result-" + selection.openId + "-" + turnId + ".json")
  };
}
async function isWindowOpen(dataRoot) {
  const directory = path2.join(dataRoot, "floating");
  const file = path2.join(directory, "window.json");
  let window;
  try {
    window = await readJson(file);
  } catch (error) {
    if (process.platform === "win32" && error.code === "EPERM") {
      try {
        await stat(file);
      } catch (checkError) {
        if (checkError.code === "ENOENT") return null;
      }
    }
    throw error;
  }
  if (!window) return null;
  try {
    process.kill(window.pid, 0);
  } catch (error) {
    if (error.code === "ESRCH") return null;
    throw error;
  }
  return true;
}
async function discardSelection(dataRoot, selection) {
  if (!selection) return;
  const { directory, latest } = explanationFiles(dataRoot, selection);
  const files = await readdir(directory);
  for (const file of files) {
    if (file === path2.basename(latest) || file.startsWith("result-" + selection.openId + "-") || file === "questions-" + selection.openId + ".json" || file === "questions-" + selection.openId + "-control.json") await rm(path2.join(directory, file), { force: true });
  }
}
async function selectChat(dataRoot, threadId, title) {
  threadDirectory(dataRoot, threadId);
  const file = path2.join(dataRoot, "floating", "selection.json");
  const previous = await readJson(file);
  if (previous?.threadId === threadId && await isWindowOpen(dataRoot)) return previous;
  const selection = { threadId, title, openId: randomUUID(), initialStatus: "idle" };
  await writeJson(file, selection);
  await discardSelection(dataRoot, previous);
  return selection;
}

// src/worker-client.mjs
function workerFiles(dataRoot) {
  const directory = path3.join(path3.resolve(dataRoot), "backend");
  return { directory, state: path3.join(directory, "state.json"), pending: path3.join(directory, "request.json") };
}
async function liveWorker(dataRoot) {
  const state = await readJson(workerFiles(dataRoot).state);
  if (!state) return null;
  try {
    process.kill(state.pid, 0);
    return state;
  } catch (error) {
    if (error.code === "ESRCH") return null;
    throw error;
  }
}
async function ensureWorker({ root: root2, dataRoot, sourceHome }) {
  if (await liveWorker(dataRoot)) return;
  const settings2 = await loadSettings(root2);
  const diagnostics = openSync(path3.join(dataRoot, "worker-error.log"), "w");
  let child;
  try {
    child = spawn(process.execPath, [path3.join(root2, "dist/worker.mjs"), dataRoot, sourceHome, settings2.cliPath], {
      cwd: root2,
      env: process.env,
      windowsHide: true,
      detached: true,
      stdio: ["ignore", "ignore", diagnostics]
    });
  } finally {
    closeSync(diagnostics);
  }
  await new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
  child.unref();
  const deadline = Date.now() + 1e4;
  while (Date.now() < deadline) {
    const state = await liveWorker(dataRoot);
    if (state?.status === "ready") return;
    if (child.exitCode !== null) throw new Error("\u89E3\u91CA\u540E\u53F0\u542F\u52A8\u5931\u8D25\u3002");
    await delay2(50);
  }
  throw new Error("\u89E3\u91CA\u540E\u53F0\u542F\u52A8\u8D85\u65F6\u3002");
}

// src/floating.mjs
import { DatabaseSync } from "node:sqlite";
import { spawn as spawn2 } from "node:child_process";
import { mkdir as mkdir2 } from "node:fs/promises";
import path4 from "node:path";
import { setTimeout as delay3 } from "node:timers/promises";
async function openFloatingWindow({ root: root2, dataRoot, sourceHome, threadId, title }) {
  const directory = path4.join(dataRoot, "floating");
  const temporary = path4.join(directory, "tmp");
  await mkdir2(temporary, { recursive: true });
  if (threadId) await selectChat(dataRoot, threadId, title);
  if (await isWindowOpen(dataRoot)) {
    await ensureWorker({ root: root2, dataRoot, sourceHome });
    return;
  }
  const child = spawn2(path4.join(root2, "dist", "floating.exe"), [dataRoot, sourceHome, process.execPath], {
    cwd: root2,
    env: { ...process.env, TMP: temporary, TEMP: temporary },
    windowsHide: false,
    detached: true,
    stdio: "ignore"
  });
  await new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
  child.unref();
  const deadline = Date.now() + 1e4;
  while (!await isWindowOpen(dataRoot)) {
    if (child.exitCode !== null) throw new Error("\u60AC\u6D6E\u7A97\u542F\u52A8\u5931\u8D25\uFF1A" + child.exitCode);
    if (Date.now() >= deadline) throw new Error("\u60AC\u6D6E\u7A97\u542F\u52A8\u8D85\u65F6\u3002");
    await delay3(50);
  }
  await ensureWorker({ root: root2, dataRoot, sourceHome });
}

// src/start.mjs
var root = path5.resolve(path5.dirname(fileURLToPath(import.meta.url)), "..");
var settings = await loadSettings(root);
await openFloatingWindow({
  root,
  dataRoot: settings.dataDirectory,
  sourceHome: process.env.REPLY_EXPLAINER_SOURCE_HOME || process.env.CODEX_HOME || path5.join(os2.homedir(), ".codex")
});
