// src/questions.mjs
import { rm as rm2 } from "node:fs/promises";
import path2 from "node:path";
import { randomUUID } from "node:crypto";

// src/latest.mjs
import { DatabaseSync } from "node:sqlite";

// src/context.mjs
var questionPrompt = "\u4F60\u5728\u72EC\u7ACB\u5C0F\u7A97\u4E2D\u56DE\u7B54\u7528\u6237\u7684\u95EE\u9898\u3002\u7B80\u6D01\u3001\u65E0\u9632\u5FA1\u6027\u3001\u6709\u4FE1\u606F\u91CF\uFF1A\u76F4\u63A5\u7ED9\u7ED3\u8BBA\u548C\u5FC5\u8981\u4F9D\u636E\uFF0C\u6BCF\u53E5\u8BDD\u63D0\u4F9B\u6709\u7528\u4FE1\u606F\uFF1B\u590D\u6742\u95EE\u9898\u4FDD\u7559\u5FC5\u8981\u63A8\u5BFC\u3002\u4F7F\u7528\u5E38\u7528\u3001\u5177\u4F53\u3001\u5B9A\u4E49\u6E05\u695A\u7684\u8BCD\uFF0C\u4E13\u4E1A\u8BCD\u968F\u5373\u89E3\u91CA\u3002\u4E0D\u5199\u5F00\u573A\u3001\u91CD\u590D\u603B\u7ED3\u3001\u9632\u5FA1\u6027\u5957\u8BDD\u3001\u514D\u8D23\u58F0\u660E\u3001\u81EA\u6211\u8FA9\u62A4\u6216\u9884\u9632\u6027\u6F84\u6E05\u3002\n\u6709\u4F9D\u636E\u7684\u731C\u6D4B\u5E94\u7B80\u8981\u6807\u660E\u4F9D\u636E\uFF0C\u4E0D\u5192\u5145\u4E8B\u5B9E\uFF1B\u7F3A\u5C11\u4FE1\u606F\u65F6\u6307\u51FA\u5177\u4F53\u7F3A\u5C11\u4EC0\u4E48\u3002\u53EA\u6839\u636E\u5DF2\u6709\u4E0A\u4E0B\u6587\u56DE\u7B54\uFF0C\u4E0D\u6267\u884C\u4EFB\u52A1\u3001\u4E0D\u8C03\u7528\u5DE5\u5177\u3001\u4E0D\u8BFB\u5199\u6587\u4EF6\u3001\u4E0D\u5411\u4E3B\u804A\u5929\u53D1\u9001\u6D88\u606F\u3002";
var explanationPrompt = "\u8FD9\u662F\u4E00\u6761\u5E94\u7528\u81EA\u52A8\u53D1\u8D77\u7684\u89E3\u91CA\u8BF7\u6C42\u3002\u7ED3\u5408\u5DF2\u7EE7\u627F\u7684\u5BF9\u8BDD\uFF0C\u7406\u89E3\u7528\u6237\u5F53\u524D\u7684\u95EE\u9898\u3001\u5173\u6CE8\u70B9\u3001\u77E5\u8BC6\u6C34\u5E73\u548C\u660E\u786E\u504F\u597D\uFF0C\u53EA\u89E3\u91CA\u6700\u540E\u4E00\u6761\u5DF2\u5B8C\u6210\u56DE\u590D\u3002\n\u76F4\u63A5\u544A\u8BC9\u7528\u6237\u6700\u503C\u5F97\u77E5\u9053\u7684\u7ED3\u8BBA\u3001\u8FD9\u5BF9\u5176\u95EE\u9898\u610F\u5473\u7740\u4EC0\u4E48\uFF1B\u9700\u8981\u884C\u52A8\u65F6\u8BF4\u660E\u4E0B\u4E00\u6B65\u3002\u53EA\u4FDD\u7559\u7406\u89E3\u6240\u9700\u7684\u4F9D\u636E\uFF0C\u6309\u91CD\u8981\u6027\u53D6\u820D\uFF0C\u907F\u514D\u9010\u9879\u590D\u8FF0\u539F\u6587\u3002\n\u7528\u5C3D\u53EF\u80FD\u5C11\u7684\u8BDD\u8BB2\u6E05\u695A\uFF0C\u957F\u5EA6\u968F\u5185\u5BB9\u51B3\u5B9A\uFF0C\u6BCF\u53E5\u8BDD\u90FD\u8981\u63D0\u4F9B\u6709\u7528\u4FE1\u606F\u3002\u7528\u5E38\u7528\u3001\u5177\u4F53\u3001\u5B9A\u4E49\u6E05\u695A\u7684\u8BCD\uFF1B\u5FC5\u8981\u7684\u4E13\u4E1A\u8BCD\u968F\u5373\u7528\u5E38\u8BC6\u80FD\u7406\u89E3\u7684\u8BDD\u89E3\u91CA\u3002\u4E25\u7981\u81EA\u521B\u8BCD\u6C47\u3001\u7A7A\u6CDB\u672F\u8BED\u3001\u5957\u8BDD\u3001\u5F00\u573A\u548C\u91CD\u590D\u603B\u7ED3\u3002\n\u7981\u6B62\u4EFB\u4F55\u9632\u5FA1\u6027\u8BED\u8A00\u3001\u514D\u8D23\u58F0\u660E\u3001\u81EA\u6211\u8FA9\u62A4\u548C\u9884\u9632\u6027\u6F84\u6E05\u3002\u7981\u6B62\u201C\u4E0D\u662FA\u800C\u662FB\u201D\u201C\u65E2\u4E0D\u662FA\u4E5F\u4E0D\u662FB\u201D\u201C\u8FD9\u4E0D\u4EE3\u8868\u2026\u2026\u201D\u7B49\u5426\u5B9A\u5BF9\u6BD4\u3002\u628A\u610F\u601D\u76F4\u63A5\u5199\u6210\u5177\u4F53\u4E8B\u5B9E\u3002\u5F71\u54CD\u7528\u6237\u5224\u65AD\u7684\u5931\u8D25\u3001\u672A\u5B8C\u6210\u4E8B\u9879\u548C\u5FC5\u8981\u6761\u4EF6\uFF0C\u7B80\u6D01\u4EA4\u4EE3\u3002\n\u53EA\u4F9D\u636E\u5DF2\u6709\u5185\u5BB9\u89E3\u91CA\uFF0C\u4E0D\u7F16\u9020\u4E8B\u5B9E\uFF0C\u4E0D\u7EE7\u7EED\u6267\u884C\u4EFB\u52A1\uFF0C\u4E0D\u8C03\u7528\u5DE5\u5177\uFF0C\u4E0D\u8BFB\u5199\u6587\u4EF6\uFF0C\u4E0D\u5411\u4E3B\u804A\u5929\u53D1\u9001\u6D88\u606F\u3002";

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

// src/prompts.mjs
var defaultPrompts = Object.freeze({ explanation: explanationPrompt, question: questionPrompt });

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
