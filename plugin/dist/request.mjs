// src/request.mjs
import { rm as rm3 } from "node:fs/promises";
import path9 from "node:path";
import { fileURLToPath } from "node:url";

// src/settings.mjs
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
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
async function loadSettings(root) {
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

// src/worker-client.mjs
import { spawn } from "node:child_process";
import { openSync, closeSync } from "node:fs";
import { rm as rm2 } from "node:fs/promises";
import { setTimeout as delay2 } from "node:timers/promises";
import path5 from "node:path";

// src/state.mjs
import { readFile as readFile2, writeFile, rename, mkdir, readdir as readdir2, rm, stat as stat2 } from "node:fs/promises";
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
        await stat2(file);
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
  const files = await readdir2(directory);
  for (const file of files) {
    if (file === path2.basename(latest) || file.startsWith("result-" + selection.openId + "-") || file === "questions-" + selection.openId + ".json" || file === "questions-" + selection.openId + "-control.json") await rm(path2.join(directory, file), { force: true });
  }
}
async function retainedSelections(dataRoot2) {
  return (await readJson(path2.join(dataRoot2, "floating", "chats.json")))?.selections || [];
}
async function isRetainedSelection(dataRoot2, selection) {
  return await isWindowOpen(dataRoot2) && (await retainedSelections(dataRoot2)).some((item) => item.openId === selection.openId);
}
async function selectChat(dataRoot2, threadId2, title) {
  threadDirectory(dataRoot2, threadId2);
  const directory = path2.join(dataRoot2, "floating");
  const selections = await isWindowOpen(dataRoot2) ? await retainedSelections(dataRoot2) : [];
  let selection = selections.find((item) => item.threadId === threadId2);
  if (!selection) {
    selection = { threadId: threadId2, title, openId: randomUUID(), initialStatus: "idle" };
    selections.push(selection);
  } else selection.title = title;
  await writeJson(path2.join(directory, "chats.json"), { selections });
  await writeJson(path2.join(directory, "selection.json"), selection);
  return selection;
}
async function readExplanation(dataRoot2, threadId2) {
  threadDirectory(dataRoot2, threadId2);
  const selection = (await retainedSelections(dataRoot2)).find((item) => item.threadId === threadId2);
  if (!selection) return { threadId: threadId2, status: "idle" };
  const latest = await readJson(explanationFiles(dataRoot2, selection).latest);
  if (!latest) return { threadId: threadId2, status: selection.initialStatus || "idle" };
  const state = await readJson(explanationFiles(dataRoot2, selection, latest.turnId).result) || { threadId: threadId2, status: "idle" };
  if (state.workerPid && ["queued", "generating"].includes(state.status) && !isProcessRunning(state.workerPid)) {
    return { ...state, status: "error", error: "\u89E3\u91CA\u540E\u53F0\u5DF2\u9000\u51FA\u3002\u70B9\u51FB\u201C\u89E3\u91CA\u5F53\u524D\u5BF9\u8BDD\u201D\u53EF\u91CD\u65B0\u751F\u6210\u3002" };
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

// src/prompts.mjs
import path4 from "node:path";
import { createHash } from "node:crypto";

// src/context.mjs
import path3 from "node:path";
var questionPrompt = "\u4F60\u5728\u72EC\u7ACB\u5C0F\u7A97\u4E2D\u56DE\u7B54\u7528\u6237\u7684\u95EE\u9898\u3002\u7B80\u6D01\u3001\u65E0\u9632\u5FA1\u6027\u3001\u6709\u4FE1\u606F\u91CF\uFF1A\u76F4\u63A5\u7ED9\u7ED3\u8BBA\u548C\u5FC5\u8981\u4F9D\u636E\uFF0C\u6BCF\u53E5\u8BDD\u63D0\u4F9B\u6709\u7528\u4FE1\u606F\uFF1B\u590D\u6742\u95EE\u9898\u4FDD\u7559\u5FC5\u8981\u63A8\u5BFC\u3002\u4F7F\u7528\u5E38\u7528\u3001\u5177\u4F53\u3001\u5B9A\u4E49\u6E05\u695A\u7684\u8BCD\uFF0C\u4E13\u4E1A\u8BCD\u968F\u5373\u89E3\u91CA\u3002\u4E0D\u5199\u5F00\u573A\u3001\u91CD\u590D\u603B\u7ED3\u3001\u9632\u5FA1\u6027\u5957\u8BDD\u3001\u514D\u8D23\u58F0\u660E\u3001\u81EA\u6211\u8FA9\u62A4\u6216\u9884\u9632\u6027\u6F84\u6E05\u3002\n\u6709\u4F9D\u636E\u7684\u731C\u6D4B\u5E94\u7B80\u8981\u6807\u660E\u4F9D\u636E\uFF0C\u4E0D\u5192\u5145\u4E8B\u5B9E\uFF1B\u7F3A\u5C11\u4FE1\u606F\u65F6\u6307\u51FA\u5177\u4F53\u7F3A\u5C11\u4EC0\u4E48\u3002\u53EA\u6839\u636E\u5DF2\u6709\u4E0A\u4E0B\u6587\u56DE\u7B54\uFF0C\u4E0D\u6267\u884C\u4EFB\u52A1\u3001\u4E0D\u8C03\u7528\u5DE5\u5177\u3001\u4E0D\u8BFB\u5199\u6587\u4EF6\u3001\u4E0D\u5411\u4E3B\u804A\u5929\u53D1\u9001\u6D88\u606F\u3002";
var explanationPrompt = "\u8FD9\u662F\u4E00\u6761\u5E94\u7528\u81EA\u52A8\u53D1\u8D77\u7684\u89E3\u91CA\u8BF7\u6C42\u3002\u7ED3\u5408\u5DF2\u7EE7\u627F\u7684\u5BF9\u8BDD\uFF0C\u7406\u89E3\u7528\u6237\u5F53\u524D\u7684\u95EE\u9898\u3001\u5173\u6CE8\u70B9\u3001\u77E5\u8BC6\u6C34\u5E73\u548C\u660E\u786E\u504F\u597D\uFF0C\u53EA\u89E3\u91CA\u6700\u540E\u4E00\u6761\u5DF2\u5B8C\u6210\u56DE\u590D\u3002\n\u76F4\u63A5\u544A\u8BC9\u7528\u6237\u6700\u503C\u5F97\u77E5\u9053\u7684\u7ED3\u8BBA\u3001\u8FD9\u5BF9\u5176\u95EE\u9898\u610F\u5473\u7740\u4EC0\u4E48\uFF1B\u9700\u8981\u884C\u52A8\u65F6\u8BF4\u660E\u4E0B\u4E00\u6B65\u3002\u53EA\u4FDD\u7559\u7406\u89E3\u6240\u9700\u7684\u4F9D\u636E\uFF0C\u6309\u91CD\u8981\u6027\u53D6\u820D\uFF0C\u907F\u514D\u9010\u9879\u590D\u8FF0\u539F\u6587\u3002\n\u7528\u5C3D\u53EF\u80FD\u5C11\u7684\u8BDD\u8BB2\u6E05\u695A\uFF0C\u957F\u5EA6\u968F\u5185\u5BB9\u51B3\u5B9A\uFF0C\u6BCF\u53E5\u8BDD\u90FD\u8981\u63D0\u4F9B\u6709\u7528\u4FE1\u606F\u3002\u7528\u5E38\u7528\u3001\u5177\u4F53\u3001\u5B9A\u4E49\u6E05\u695A\u7684\u8BCD\uFF1B\u5FC5\u8981\u7684\u4E13\u4E1A\u8BCD\u968F\u5373\u7528\u5E38\u8BC6\u80FD\u7406\u89E3\u7684\u8BDD\u89E3\u91CA\u3002\u4E25\u7981\u81EA\u521B\u8BCD\u6C47\u3001\u7A7A\u6CDB\u672F\u8BED\u3001\u5957\u8BDD\u3001\u5F00\u573A\u548C\u91CD\u590D\u603B\u7ED3\u3002\n\u7981\u6B62\u4EFB\u4F55\u9632\u5FA1\u6027\u8BED\u8A00\u3001\u514D\u8D23\u58F0\u660E\u3001\u81EA\u6211\u8FA9\u62A4\u548C\u9884\u9632\u6027\u6F84\u6E05\u3002\u7981\u6B62\u201C\u4E0D\u662FA\u800C\u662FB\u201D\u201C\u65E2\u4E0D\u662FA\u4E5F\u4E0D\u662FB\u201D\u201C\u8FD9\u4E0D\u4EE3\u8868\u2026\u2026\u201D\u7B49\u5426\u5B9A\u5BF9\u6BD4\u3002\u628A\u610F\u601D\u76F4\u63A5\u5199\u6210\u5177\u4F53\u4E8B\u5B9E\u3002\u5F71\u54CD\u7528\u6237\u5224\u65AD\u7684\u5931\u8D25\u3001\u672A\u5B8C\u6210\u4E8B\u9879\u548C\u5FC5\u8981\u6761\u4EF6\uFF0C\u7B80\u6D01\u4EA4\u4EE3\u3002\n\u53EA\u4F9D\u636E\u5DF2\u6709\u5185\u5BB9\u89E3\u91CA\uFF0C\u4E0D\u7F16\u9020\u4E8B\u5B9E\uFF0C\u4E0D\u7EE7\u7EED\u6267\u884C\u4EFB\u52A1\uFF0C\u4E0D\u8C03\u7528\u5DE5\u5177\uFF0C\u4E0D\u8BFB\u5199\u6587\u4EF6\uFF0C\u4E0D\u5411\u4E3B\u804A\u5929\u53D1\u9001\u6D88\u606F\u3002";
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
  const relative = path3.relative(path3.toNamespacedPath(sourceHome2), path3.toNamespacedPath(path3.resolve(source)));
  if (relative.startsWith("..") || path3.isAbsolute(relative)) throw new Error("\u804A\u5929\u8BB0\u5F55\u4E0D\u5728\u6307\u5B9A\u7684 Codex \u5B58\u50A8\u76EE\u5F55\u4E2D\u3002");
  return relative;
}

// src/prompts.mjs
var defaultPrompts = Object.freeze({ explanation: explanationPrompt, question: questionPrompt });
function promptId(prompt) {
  return createHash("sha256").update(prompt).digest("hex");
}
function validate(prompts) {
  for (const key of ["explanation", "question"])
    if (typeof prompts?.[key] !== "string" || prompts[key].length > 32e3) throw new Error("\u6BCF\u9879\u63D0\u793A\u8BCD\u987B\u4E3A\u6587\u5B57\uFF0C\u6700\u591A 32000 \u5B57\u3002");
  return { explanation: prompts.explanation, question: prompts.question };
}
async function readPrompts(dataRoot2) {
  const saved = await readJson(path4.join(dataRoot2, "prompt-settings.json"));
  return saved === null ? { ...defaultPrompts } : validate(saved);
}

// src/worker-client.mjs
function workerFiles(dataRoot2) {
  const directory = path5.join(path5.resolve(dataRoot2), "backend");
  return { directory, state: path5.join(directory, "state.json"), pending: path5.join(directory, "request.json") };
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
  const diagnostics = openSync(path5.join(dataRoot2, "worker-error.log"), "w");
  let child;
  try {
    child = spawn(process.execPath, [path5.join(root, "dist/worker.mjs"), dataRoot2, sourceHome2, settings.cliPath], {
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
    if (child.exitCode !== null) {
      const failure = await readJson(path5.join(dataRoot2, "worker-exit.json"));
      throw new Error("\u89E3\u91CA\u540E\u53F0\u542F\u52A8\u5931\u8D25\u3002" + (failure?.pid === child.pid && failure.error ? "\n" + failure.error : ""));
    }
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
  const prompt = (await readPrompts(dataRoot2)).explanation;
  const settingsId = promptId(prompt);
  const previous = await readExplanation(dataRoot2, event.session_id);
  if (previous.turnId === event.turn_id && previous.promptId === settingsId && previous.status !== "error") return;
  const files = explanationFiles(dataRoot2, selection, event.turn_id);
  const worker = await liveWorker(dataRoot2);
  await writeJson(files.result, {
    threadId: event.session_id,
    turnId: event.turn_id,
    promptId: settingsId,
    status: worker ? "queued" : "error",
    workerPid: worker?.pid,
    ...worker ? {} : { error: "\u89E3\u91CA\u540E\u53F0\u5DF2\u7ED3\u675F\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u5C0F\u7A97\u3002" },
    startedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  await writeJson(files.latest, { turnId: event.turn_id });
  if (previous.turnId && previous.turnId !== event.turn_id) await rm2(explanationFiles(dataRoot2, selection, previous.turnId).result, { force: true });
  if (!worker) return;
  await writeJson(workerFiles(dataRoot2).pending, { openId: selection.openId, event, prompt });
}

// src/floating.mjs
import path6 from "node:path";
async function readThreadName(sourceHome2, threadId2) {
  const { DatabaseSync: DatabaseSync2 } = await import("node:sqlite");
  threadDirectory(sourceHome2, threadId2);
  const database = new DatabaseSync2(path6.join(sourceHome2, "state_5.sqlite"), { readOnly: true });
  try {
    const thread = database.prepare("SELECT name, title FROM threads WHERE id = ?").get(threadId2);
    if (!thread) throw new Error("\u6CA1\u6709\u627E\u5230\u8FD9\u6BB5\u804A\u5929\u7684\u540D\u79F0\u3002");
    return thread.name || thread.title || "\u65B0\u804A\u5929";
  } finally {
    database.close();
  }
}

// src/latest.mjs
import { DatabaseSync } from "node:sqlite";
import path8 from "node:path";

// src/history.mjs
import { readFile as readFile3, readdir as readdir3 } from "node:fs/promises";
import path7 from "node:path";
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
        entries = await readdir3(path7.join(sourceHome2, folder), { recursive: true, withFileTypes: true });
      } catch (error) {
        if (error.code === "ENOENT") continue;
        throw error;
      }
      const entry = entries.find((item) => item.isFile() && (item.name.endsWith("-" + base.thread_id + ".jsonl") || item.name.endsWith("_" + base.thread_id + ".jsonl")));
      if (entry) {
        parent = path7.join(entry.parentPath, entry.name);
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
  const database = new DatabaseSync(path8.join(sourceHome2, "state_5.sqlite"), { readOnly: true });
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
var [dataRoot, sourceHome, threadId, action = "explain"] = process.argv.slice(2);
try {
  if (await isWindowOpen(dataRoot)) {
    if (action !== "follow") await ensureWorker({ root: path9.resolve(path9.dirname(fileURLToPath(import.meta.url)), ".."), dataRoot, sourceHome });
    const title = await readThreadName(sourceHome, threadId);
    const selection = await selectChat(dataRoot, threadId, title);
    try {
      if (action === "explain" && selection?.threadId === threadId && await isCurrentSelection(dataRoot, selection)) {
        const event = await latestReplyEvent(sourceHome, threadId);
        if (event) await enqueueStop(event, { dataRoot });
        else if (await isCurrentSelection(dataRoot, selection)) await writeJson(path9.join(dataRoot, "floating", "selection.json"), { ...selection, initialStatus: "unavailable" });
      }
    } finally {
      if (selection && !await isRetainedSelection(dataRoot, selection)) {
        await discardSelection(dataRoot, selection);
        const file = path9.join(dataRoot, "floating", "selection.json");
        if ((await readJson(file))?.openId === selection.openId) await rm3(file, { force: true });
      }
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
