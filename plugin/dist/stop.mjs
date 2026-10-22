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

// src/stop.mjs
import path4 from "node:path";
import { fileURLToPath } from "node:url";

// src/worker-client.mjs
import { rm as rm2 } from "node:fs/promises";
import path3 from "node:path";

// src/state.mjs
import { readFile as readFile2, writeFile, rename, mkdir, readdir, rm, stat } from "node:fs/promises";
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
async function activeSelection(dataRoot) {
  if (!await isWindowOpen(dataRoot)) return null;
  return await readJson(path2.join(dataRoot, "floating", "selection.json"));
}
async function readExplanation(dataRoot, threadId) {
  threadDirectory(dataRoot, threadId);
  const selection = await readJson(path2.join(dataRoot, "floating", "selection.json"));
  if (selection?.threadId !== threadId) return { threadId, status: "idle" };
  const latest = await readJson(explanationFiles(dataRoot, selection).latest);
  if (!latest) return { threadId, status: selection.initialStatus || "idle" };
  const state = await readJson(explanationFiles(dataRoot, selection, latest.turnId).result) || { threadId, status: "idle" };
  if (state.workerPid && ["queued", "generating"].includes(state.status) && !isProcessRunning(state.workerPid)) {
    return { ...state, status: "error", error: "\u89E3\u91CA\u540E\u53F0\u5DF2\u9000\u51FA\u3002\u70B9\u51FB\u201C\u89E3\u91CA\u5F53\u524D\u804A\u5929\u201D\u53EF\u91CD\u65B0\u751F\u6210\u3002" };
  }
  return state;
}
function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
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
async function enqueueStop(event2, { dataRoot }) {
  threadDirectory(dataRoot, event2.session_id);
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(event2.turn_id)) throw new Error("\u56DE\u590D\u6807\u8BC6\u65E0\u6548\u3002");
  if (!event2.last_assistant_message?.trim() || !event2.transcript_path) return;
  const selection = await activeSelection(dataRoot);
  if (selection?.threadId !== event2.session_id) return;
  const previous = await readExplanation(dataRoot, event2.session_id);
  if (previous.turnId === event2.turn_id && previous.status !== "error") return;
  const files = explanationFiles(dataRoot, selection, event2.turn_id);
  const worker = await liveWorker(dataRoot);
  await writeJson(files.result, {
    threadId: event2.session_id,
    turnId: event2.turn_id,
    status: worker ? "queued" : "error",
    workerPid: worker?.pid,
    ...worker ? {} : { error: "\u89E3\u91CA\u540E\u53F0\u5DF2\u7ED3\u675F\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u5C0F\u7A97\u3002" },
    startedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  await writeJson(files.latest, { turnId: event2.turn_id });
  if (previous.turnId && previous.turnId !== event2.turn_id) await rm2(explanationFiles(dataRoot, selection, previous.turnId).result, { force: true });
  if (!worker) return;
  await writeJson(workerFiles(dataRoot).pending, { openId: selection.openId, event: event2 });
}

// src/stop.mjs
var root = path4.resolve(path4.dirname(fileURLToPath(import.meta.url)), "..");
var settings = await loadSettings(root);
var input = "";
for await (const chunk of process.stdin) input += chunk;
var event = JSON.parse(input);
if (event.hook_event_name !== "Stop") throw new Error("Only Stop events are accepted.");
await enqueueStop(event, { dataRoot: settings.dataDirectory });
