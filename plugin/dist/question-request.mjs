// src/questions.mjs
import { rm as rm2 } from "node:fs/promises";
import path2 from "node:path";
import { randomUUID } from "node:crypto";

// src/latest.mjs
import { DatabaseSync } from "node:sqlite";

// src/state.mjs
import { readFile, writeFile, rename, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
function threadDirectory(dataRoot2, threadId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(threadId)) throw new Error("\u5F53\u524D\u804A\u5929\u6807\u8BC6\u65E0\u6548\u3002");
  return path.join(dataRoot2, "threads", threadId);
}
async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
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
async function isWindowOpen(dataRoot2) {
  const directory = path.join(dataRoot2, "floating");
  const file = path.join(directory, "window.json");
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
  return await readJson(path.join(dataRoot2, "floating", "selection.json"));
}
async function isCurrentSelection(dataRoot2, selection) {
  return (await activeSelection(dataRoot2))?.openId === selection.openId;
}

// src/questions.mjs
function questionFiles(dataRoot2, selection) {
  threadDirectory(dataRoot2, selection.openId);
  const prefix = path2.join(dataRoot2, "floating", "questions-" + selection.openId);
  return { control: prefix + "-control.json", result: prefix + ".json" };
}
async function submitQuestion(dataRoot2, openId2, action2, text2 = "") {
  const selection = await activeSelection(dataRoot2);
  if (selection?.openId !== openId2) throw new Error("\u5DF2\u5207\u6362\u6216\u5173\u95ED\u804A\u5929\uFF0C\u8BF7\u91CD\u65B0\u63D0\u95EE\u3002");
  if (!["ask", "reset", "stop"].includes(action2)) throw new Error("\u63D0\u95EE\u64CD\u4F5C\u65E0\u6548\u3002");
  if (action2 === "ask" && (!text2.trim() || text2.length > 32e3)) throw new Error("\u8BF7\u8F93\u5165 1 \u81F3 32000 \u5B57\u7684\u95EE\u9898\u3002");
  const files = questionFiles(dataRoot2, selection);
  const previous = await readJson(files.control);
  const savedResult = await readJson(files.result);
  const result = savedResult?.revision === previous?.revision ? savedResult : null;
  if (action2 === "ask" && previous?.requestId && result?.requestId !== previous.requestId) throw new Error("\u8BF7\u7B49\u5F85\u4E0A\u4E00\u6761\u56DE\u7B54\u5B8C\u6210\u3002");
  if (action2 === "ask" && ["queued", "generating"].includes(result?.status)) throw new Error("\u8BF7\u7B49\u5F85\u4E0A\u4E00\u6761\u56DE\u7B54\u5B8C\u6210\u3002");
  if (action2 === "ask" && result?.status === "error") throw new Error("\u8BF7\u70B9\u201C\u91CD\u65B0\u5F00\u59CB\u201D\u540E\u7EE7\u7EED\u63D0\u95EE\u3002");
  if (action2 === "stop") {
    if (!previous?.requestId || result?.requestId === previous.requestId && ["ready", "error", "stopped"].includes(result.status)) return;
    await writeJson(files.control, { ...previous, stopRequested: true });
    return;
  }
  await writeJson(files.control, {
    revision: action2 === "reset" || !previous ? randomUUID() : previous.revision,
    requestId: action2 === "ask" ? randomUUID() : null,
    submittedAt: action2 === "ask" ? (/* @__PURE__ */ new Date()).toISOString() : null,
    text: action2 === "ask" ? text2.trim() : ""
  });
  if (!await isCurrentSelection(dataRoot2, selection)) {
    await rm2(files.control, { force: true });
    await rm2(files.result, { force: true });
    throw new Error("\u5DF2\u5207\u6362\u6216\u5173\u95ED\u804A\u5929\uFF0C\u8BF7\u91CD\u65B0\u63D0\u95EE\u3002");
  }
}

// src/question-request.mjs
var [dataRoot, openId, action] = process.argv.slice(2);
var text = "";
for await (const chunk of process.stdin) text += chunk;
await submitQuestion(dataRoot, openId, action, text);
