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
async function retainedSelections(dataRoot) {
  return (await readJson(path2.join(dataRoot, "floating", "chats.json")))?.selections || [];
}
async function selectChat(dataRoot, threadId, title) {
  threadDirectory(dataRoot, threadId);
  const directory = path2.join(dataRoot, "floating");
  const selections = await isWindowOpen(dataRoot) ? await retainedSelections(dataRoot) : [];
  let selection = selections.find((item) => item.threadId === threadId);
  if (!selection) {
    selection = { threadId, title, openId: randomUUID(), initialStatus: "idle" };
    selections.push(selection);
  } else selection.title = title;
  await writeJson(path2.join(directory, "chats.json"), { selections });
  await writeJson(path2.join(directory, "selection.json"), selection);
  return selection;
}

// src/context.mjs
var questionPrompt = "\u4F60\u5728\u72EC\u7ACB\u5C0F\u7A97\u4E2D\u56DE\u7B54\u7528\u6237\u7684\u95EE\u9898\u3002\u7B80\u6D01\u3001\u65E0\u9632\u5FA1\u6027\u3001\u6709\u4FE1\u606F\u91CF\uFF1A\u76F4\u63A5\u7ED9\u7ED3\u8BBA\u548C\u5FC5\u8981\u4F9D\u636E\uFF0C\u6BCF\u53E5\u8BDD\u63D0\u4F9B\u6709\u7528\u4FE1\u606F\uFF1B\u590D\u6742\u95EE\u9898\u4FDD\u7559\u5FC5\u8981\u63A8\u5BFC\u3002\u4F7F\u7528\u5E38\u7528\u3001\u5177\u4F53\u3001\u5B9A\u4E49\u6E05\u695A\u7684\u8BCD\uFF0C\u4E13\u4E1A\u8BCD\u968F\u5373\u89E3\u91CA\u3002\u4E0D\u5199\u5F00\u573A\u3001\u91CD\u590D\u603B\u7ED3\u3001\u9632\u5FA1\u6027\u5957\u8BDD\u3001\u514D\u8D23\u58F0\u660E\u3001\u81EA\u6211\u8FA9\u62A4\u6216\u9884\u9632\u6027\u6F84\u6E05\u3002\n\u6709\u4F9D\u636E\u7684\u731C\u6D4B\u5E94\u7B80\u8981\u6807\u660E\u4F9D\u636E\uFF0C\u4E0D\u5192\u5145\u4E8B\u5B9E\uFF1B\u7F3A\u5C11\u4FE1\u606F\u65F6\u6307\u51FA\u5177\u4F53\u7F3A\u5C11\u4EC0\u4E48\u3002\u53EA\u6839\u636E\u5DF2\u6709\u4E0A\u4E0B\u6587\u56DE\u7B54\uFF0C\u4E0D\u6267\u884C\u4EFB\u52A1\u3001\u4E0D\u8C03\u7528\u5DE5\u5177\u3001\u4E0D\u8BFB\u5199\u6587\u4EF6\u3001\u4E0D\u5411\u4E3B\u804A\u5929\u53D1\u9001\u6D88\u606F\u3002";
var explanationPrompt = "\u8FD9\u662F\u4E00\u6761\u5E94\u7528\u81EA\u52A8\u53D1\u8D77\u7684\u89E3\u91CA\u8BF7\u6C42\u3002\u7ED3\u5408\u5DF2\u7EE7\u627F\u7684\u5BF9\u8BDD\uFF0C\u7406\u89E3\u7528\u6237\u5F53\u524D\u7684\u95EE\u9898\u3001\u5173\u6CE8\u70B9\u3001\u77E5\u8BC6\u6C34\u5E73\u548C\u660E\u786E\u504F\u597D\uFF0C\u53EA\u89E3\u91CA\u6700\u540E\u4E00\u6761\u5DF2\u5B8C\u6210\u56DE\u590D\u3002\n\u76F4\u63A5\u544A\u8BC9\u7528\u6237\u6700\u503C\u5F97\u77E5\u9053\u7684\u7ED3\u8BBA\u3001\u8FD9\u5BF9\u5176\u95EE\u9898\u610F\u5473\u7740\u4EC0\u4E48\uFF1B\u9700\u8981\u884C\u52A8\u65F6\u8BF4\u660E\u4E0B\u4E00\u6B65\u3002\u53EA\u4FDD\u7559\u7406\u89E3\u6240\u9700\u7684\u4F9D\u636E\uFF0C\u6309\u91CD\u8981\u6027\u53D6\u820D\uFF0C\u907F\u514D\u9010\u9879\u590D\u8FF0\u539F\u6587\u3002\n\u7528\u5C3D\u53EF\u80FD\u5C11\u7684\u8BDD\u8BB2\u6E05\u695A\uFF0C\u957F\u5EA6\u968F\u5185\u5BB9\u51B3\u5B9A\uFF0C\u6BCF\u53E5\u8BDD\u90FD\u8981\u63D0\u4F9B\u6709\u7528\u4FE1\u606F\u3002\u7528\u5E38\u7528\u3001\u5177\u4F53\u3001\u5B9A\u4E49\u6E05\u695A\u7684\u8BCD\uFF1B\u5FC5\u8981\u7684\u4E13\u4E1A\u8BCD\u968F\u5373\u7528\u5E38\u8BC6\u80FD\u7406\u89E3\u7684\u8BDD\u89E3\u91CA\u3002\u4E25\u7981\u81EA\u521B\u8BCD\u6C47\u3001\u7A7A\u6CDB\u672F\u8BED\u3001\u5957\u8BDD\u3001\u5F00\u573A\u548C\u91CD\u590D\u603B\u7ED3\u3002\n\u7981\u6B62\u4EFB\u4F55\u9632\u5FA1\u6027\u8BED\u8A00\u3001\u514D\u8D23\u58F0\u660E\u3001\u81EA\u6211\u8FA9\u62A4\u548C\u9884\u9632\u6027\u6F84\u6E05\u3002\u7981\u6B62\u201C\u4E0D\u662FA\u800C\u662FB\u201D\u201C\u65E2\u4E0D\u662FA\u4E5F\u4E0D\u662FB\u201D\u201C\u8FD9\u4E0D\u4EE3\u8868\u2026\u2026\u201D\u7B49\u5426\u5B9A\u5BF9\u6BD4\u3002\u628A\u610F\u601D\u76F4\u63A5\u5199\u6210\u5177\u4F53\u4E8B\u5B9E\u3002\u5F71\u54CD\u7528\u6237\u5224\u65AD\u7684\u5931\u8D25\u3001\u672A\u5B8C\u6210\u4E8B\u9879\u548C\u5FC5\u8981\u6761\u4EF6\uFF0C\u7B80\u6D01\u4EA4\u4EE3\u3002\n\u53EA\u4F9D\u636E\u5DF2\u6709\u5185\u5BB9\u89E3\u91CA\uFF0C\u4E0D\u7F16\u9020\u4E8B\u5B9E\uFF0C\u4E0D\u7EE7\u7EED\u6267\u884C\u4EFB\u52A1\uFF0C\u4E0D\u8C03\u7528\u5DE5\u5177\uFF0C\u4E0D\u8BFB\u5199\u6587\u4EF6\uFF0C\u4E0D\u5411\u4E3B\u804A\u5929\u53D1\u9001\u6D88\u606F\u3002";

// src/prompts.mjs
var defaultPrompts = Object.freeze({ explanation: explanationPrompt, question: questionPrompt });

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
    await writeJson(path4.join(directory, "activate.json"), {});
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
