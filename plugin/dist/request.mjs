// src/request.mjs
import { rm as rm3 } from "node:fs/promises";
import path8 from "node:path";
import { fileURLToPath } from "node:url";

// src/settings.mjs
import { readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
async function loadSettings(root) {
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

// src/worker-client.mjs
import { spawn } from "node:child_process";
import { openSync, closeSync } from "node:fs";
import { rm as rm2 } from "node:fs/promises";
import { setTimeout as delay2 } from "node:timers/promises";
import path3 from "node:path";

// src/state.mjs
import { readFile as readFile2, writeFile, rename, mkdir, readdir, rm, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path2 from "node:path";
import { setTimeout as delay } from "node:timers/promises";
function threadDirectory(dataRoot2, threadId2) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(threadId2)) throw new Error("\u5F53\u524D\u804A\u5929\u6807\u8BC6\u65E0\u6548\u3002");
  return path2.join(dataRoot2, "threads", threadId2);
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
function explanationFiles(dataRoot2, selection, turnId) {
  threadDirectory(dataRoot2, selection.openId);
  if (turnId !== void 0 && !/^[a-zA-Z0-9_-]{1,100}$/.test(turnId)) throw new Error("\u56DE\u590D\u6807\u8BC6\u65E0\u6548\u3002");
  const directory = path2.join(path2.resolve(dataRoot2), "floating");
  return {
    directory,
    latest: path2.join(directory, "latest-" + selection.openId + ".json"),
    result: turnId === void 0 ? null : path2.join(directory, "result-" + selection.openId + "-" + turnId + ".json")
  };
}
async function isWindowOpen(dataRoot2) {
  const directory = path2.join(dataRoot2, "floating");
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
async function activeSelection(dataRoot2) {
  if (!await isWindowOpen(dataRoot2)) return null;
  return await readJson(path2.join(dataRoot2, "floating", "selection.json"));
}
async function isCurrentSelection(dataRoot2, selection) {
  return (await activeSelection(dataRoot2))?.openId === selection.openId;
}
async function discardSelection(dataRoot2, selection) {
  if (!selection) return;
  const { directory, latest } = explanationFiles(dataRoot2, selection);
  const files = await readdir(directory);
  for (const file of files) {
    if (file === path2.basename(latest) || file.startsWith("result-" + selection.openId + "-") || file === "questions-" + selection.openId + ".json" || file === "questions-" + selection.openId + "-control.json") await rm(path2.join(directory, file), { force: true });
  }
}
async function selectChat(dataRoot2, threadId2, title) {
  threadDirectory(dataRoot2, threadId2);
  const file = path2.join(dataRoot2, "floating", "selection.json");
  const previous = await readJson(file);
  if (previous?.threadId === threadId2 && await isWindowOpen(dataRoot2)) return previous;
  const selection = { threadId: threadId2, title, openId: randomUUID(), initialStatus: "idle" };
  await writeJson(file, selection);
  await discardSelection(dataRoot2, previous);
  return selection;
}
async function readExplanation(dataRoot2, threadId2) {
  threadDirectory(dataRoot2, threadId2);
  const selection = await readJson(path2.join(dataRoot2, "floating", "selection.json"));
  if (selection?.threadId !== threadId2) return { threadId: threadId2, status: "idle" };
  const latest = await readJson(explanationFiles(dataRoot2, selection).latest);
  if (!latest) return { threadId: threadId2, status: selection.initialStatus || "idle" };
  const state = await readJson(explanationFiles(dataRoot2, selection, latest.turnId).result) || { threadId: threadId2, status: "idle" };
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
function workerFiles(dataRoot2) {
  const directory = path3.join(path3.resolve(dataRoot2), "backend");
  return { directory, state: path3.join(directory, "state.json"), pending: path3.join(directory, "request.json") };
}
async function liveWorker(dataRoot2) {
  const state = await readJson(workerFiles(dataRoot2).state);
  if (!state) return null;
  try {
    process.kill(state.pid, 0);
    return state;
  } catch (error) {
    if (error.code === "ESRCH") return null;
    throw error;
  }
}
async function ensureWorker({ root, dataRoot: dataRoot2, sourceHome: sourceHome2 }) {
  if (await liveWorker(dataRoot2)) return;
  const settings = await loadSettings(root);
  const diagnostics = openSync(path3.join(dataRoot2, "worker-error.log"), "w");
  let child;
  try {
    child = spawn(process.execPath, [path3.join(root, "dist/worker.mjs"), dataRoot2, sourceHome2, settings.cliPath], {
      cwd: root,
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
    const state = await liveWorker(dataRoot2);
    if (state?.status === "ready") return;
    if (child.exitCode !== null) throw new Error("\u89E3\u91CA\u540E\u53F0\u542F\u52A8\u5931\u8D25\u3002");
    await delay2(50);
  }
  throw new Error("\u89E3\u91CA\u540E\u53F0\u542F\u52A8\u8D85\u65F6\u3002");
}
async function enqueueStop(event, { dataRoot: dataRoot2 }) {
  threadDirectory(dataRoot2, event.session_id);
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(event.turn_id)) throw new Error("\u56DE\u590D\u6807\u8BC6\u65E0\u6548\u3002");
  if (!event.last_assistant_message?.trim() || !event.transcript_path) return;
  const selection = await activeSelection(dataRoot2);
  if (selection?.threadId !== event.session_id) return;
  const previous = await readExplanation(dataRoot2, event.session_id);
  if (previous.turnId === event.turn_id && previous.status !== "error") return;
  const files = explanationFiles(dataRoot2, selection, event.turn_id);
  const worker = await liveWorker(dataRoot2);
  await writeJson(files.result, {
    threadId: event.session_id,
    turnId: event.turn_id,
    status: worker ? "queued" : "error",
    workerPid: worker?.pid,
    ...worker ? {} : { error: "\u89E3\u91CA\u540E\u53F0\u5DF2\u7ED3\u675F\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u5C0F\u7A97\u3002" },
    startedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  await writeJson(files.latest, { turnId: event.turn_id });
  if (previous.turnId && previous.turnId !== event.turn_id) await rm2(explanationFiles(dataRoot2, selection, previous.turnId).result, { force: true });
  if (!worker) return;
  await writeJson(workerFiles(dataRoot2).pending, { openId: selection.openId, event });
}

// src/floating.mjs
import { DatabaseSync } from "node:sqlite";
import path4 from "node:path";
function readThreadName(sourceHome2, threadId2) {
  threadDirectory(sourceHome2, threadId2);
  const database = new DatabaseSync(path4.join(sourceHome2, "state_5.sqlite"), { readOnly: true });
  try {
    const thread = database.prepare("SELECT name, title FROM threads WHERE id = ?").get(threadId2);
    if (!thread) throw new Error("\u6CA1\u6709\u627E\u5230\u8FD9\u6BB5\u804A\u5929\u7684\u540D\u79F0\u3002");
    return thread.name || thread.title || "\u65B0\u804A\u5929";
  } finally {
    database.close();
  }
}

// src/latest.mjs
import { DatabaseSync as DatabaseSync2 } from "node:sqlite";
import path7 from "node:path";

// src/history.mjs
import { readFile as readFile3, readdir as readdir2 } from "node:fs/promises";
import path6 from "node:path";

// src/context.mjs
import path5 from "node:path";
function snapshotThroughTurn(text, turnId) {
  const lines = text.slice(0, text.lastIndexOf("\n") + 1).split("\n").filter(Boolean);
  const kept = [];
  let found = false;
  let context;
  for (const line of lines) {
    const item = JSON.parse(line);
    if (item.type === "turn_context") {
      if (found && item.payload.turn_id !== turnId) break;
      if (item.payload.turn_id === turnId) {
        found = true;
        context = item.payload;
      }
    }
    kept.push(line);
    if (found && item.type === "event_msg" && item.payload.type === "task_complete" && item.payload.turn_id === turnId) break;
  }
  if (!found) throw new Error("\u4FDD\u5B58\u8BB0\u5F55\u4E2D\u8FD8\u6CA1\u6709\u8FD9\u6761\u56DE\u590D\u7684\u4E0A\u4E0B\u6587\u3002");
  return { text: kept.join("\n") + "\n", context };
}
function relativeRolloutPath(sourceHome2, source) {
  const relative = path5.relative(path5.toNamespacedPath(sourceHome2), path5.toNamespacedPath(path5.resolve(source)));
  if (relative.startsWith("..") || path5.isAbsolute(relative)) throw new Error("\u804A\u5929\u8BB0\u5F55\u4E0D\u5728\u6307\u5B9A\u7684 Codex \u5B58\u50A8\u76EE\u5F55\u4E2D\u3002");
  return relative;
}

// src/history.mjs
async function readRolloutHistory(sourceHome2, source) {
  async function readSegment(file, end) {
    relativeRolloutPath(sourceHome2, file);
    const bytes = await readFile3(file);
    const text = bytes.subarray(0, end ?? bytes.lastIndexOf(10) + 1).toString("utf8");
    const headerEnd = text.indexOf("\n");
    const metadata = JSON.parse(text.slice(0, headerEnd)).payload;
    const base = metadata.history_base;
    if (!base) return text;
    let parent;
    for (const folder of ["sessions", "archived_sessions"]) {
      let entries;
      try {
        entries = await readdir2(path6.join(sourceHome2, folder), { recursive: true, withFileTypes: true });
      } catch (error) {
        if (error.code === "ENOENT") continue;
        throw error;
      }
      const entry = entries.find((item) => item.isFile() && (item.name.endsWith("-" + base.thread_id + ".jsonl") || item.name.endsWith("_" + base.thread_id + ".jsonl")));
      if (entry) {
        parent = path6.join(entry.parentPath, entry.name);
        break;
      }
    }
    if (!parent) throw new Error("\u6CA1\u6709\u627E\u5230\u8FD9\u6BB5\u804A\u5929\u5F15\u7528\u7684\u524D\u4E00\u4EFD\u8BB0\u5F55\u3002");
    const inherited = await readSegment(parent, base.end_byte_offset);
    return text.slice(0, headerEnd + 1) + inherited.slice(inherited.indexOf("\n") + 1) + text.slice(headerEnd + 1);
  }
  return await readSegment(source);
}

// src/latest.mjs
async function latestReplyEvent(sourceHome2, threadId2) {
  threadDirectory(sourceHome2, threadId2);
  const database = new DatabaseSync2(path7.join(sourceHome2, "state_5.sqlite"), { readOnly: true });
  let transcript;
  try {
    const thread = database.prepare("SELECT rollout_path FROM threads WHERE id = ?").get(threadId2);
    if (!thread) return null;
    transcript = thread.rollout_path;
  } finally {
    database.close();
  }
  relativeRolloutPath(sourceHome2, transcript);
  const text = await readRolloutHistory(sourceHome2, transcript);
  const rows = text.slice(0, text.lastIndexOf("\n") + 1).split("\n").filter(Boolean).map((line) => JSON.parse(line));
  if (rows[0].payload.id !== threadId2) throw new Error("\u804A\u5929\u8BB0\u5F55\u4E0E\u5F53\u524D\u804A\u5929\u4E0D\u4E00\u81F4\u3002");
  const completed = rows.findLast((item) => item.type === "event_msg" && item.payload.type === "task_complete");
  if (!completed) return null;
  const turnId = completed.payload.turn_id;
  const snapshot = snapshotThroughTurn(text, turnId);
  const savedRows = snapshot.text.trimEnd().split("\n").map((line) => JSON.parse(line));
  const message = savedRows.findLast((item) => item.type === "response_item" && item.payload.type === "message" && item.payload.role === "assistant");
  const answer = completed.payload.last_agent_message || completed.payload.last_assistant_message || message?.payload.content.map((item) => item.text || "").join("\n");
  if (!answer?.trim()) return null;
  return {
    hook_event_name: "Stop",
    session_id: threadId2,
    turn_id: turnId,
    transcript_path: transcript,
    cwd: snapshot.context.cwd,
    model: snapshot.context.model,
    last_assistant_message: answer
  };
}

// src/request.mjs
var [dataRoot, sourceHome, threadId] = process.argv.slice(2);
if (await isWindowOpen(dataRoot)) {
  await ensureWorker({ root: path8.resolve(path8.dirname(fileURLToPath(import.meta.url)), ".."), dataRoot, sourceHome });
  const title = readThreadName(sourceHome, threadId);
  const selection = await selectChat(dataRoot, threadId, title);
  try {
    if (selection?.threadId === threadId && await isCurrentSelection(dataRoot, selection)) {
      const event = await latestReplyEvent(sourceHome, threadId);
      if (event) await enqueueStop(event, { dataRoot });
      else if (await isCurrentSelection(dataRoot, selection)) await writeJson(path8.join(dataRoot, "floating", "selection.json"), { ...selection, initialStatus: "unavailable" });
    }
  } finally {
    if (selection && !await isCurrentSelection(dataRoot, selection)) {
      await discardSelection(dataRoot, selection);
      const file = path8.join(dataRoot, "floating", "selection.json");
      if ((await readJson(file))?.openId === selection.openId) await rm3(file, { force: true });
    }
  }
}
