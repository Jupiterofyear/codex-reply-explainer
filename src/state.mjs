import { readFile, writeFile, rename, mkdir, readdir, rm, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export function threadDirectory(dataRoot, threadId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(threadId)) throw new Error("当前聊天标识无效。");
  return path.join(dataRoot, "threads", threadId);
}
export async function readJson(file) {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
export async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = file + "." + process.pid + ".tmp";
  await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", "utf8");
  // Windows may briefly keep the displayed file open without allowing replacement.
  const deadline = Date.now() + 5000;
  try {
    while (true) {
      try { await rename(temporary, file); return; }
      catch (error) {
        if (process.platform !== "win32" || error.code !== "EPERM" || Date.now() >= deadline) throw error;
        await delay(25);
      }
    }
  } finally { await rm(temporary, { force: true }); }
}
export function explanationFiles(dataRoot, selection, turnId) {
  threadDirectory(dataRoot, selection.openId);
  if (turnId !== undefined && !/^[a-zA-Z0-9_-]{1,100}$/.test(turnId)) throw new Error("回复标识无效。");
  const directory = path.join(path.resolve(dataRoot), "floating");
  return { directory, latest: path.join(directory, "latest-" + selection.openId + ".json"),
    result: turnId === undefined ? null : path.join(directory, "result-" + selection.openId + "-" + turnId + ".json") };
}
export async function isWindowOpen(dataRoot) {
  const directory = path.join(dataRoot, "floating");
  const file = path.join(directory, "window.json");
  let window;
  try { window = await readJson(file); }
  catch (error) {
    // Deleting the window marker can briefly make Windows deny a concurrent open.
    // Only treat it as closed after confirming that this exact marker is gone.
    if (process.platform === "win32" && error.code === "EPERM") {
      try { await stat(file); }
      catch (checkError) { if (checkError.code === "ENOENT") return null; }
    }
    throw error;
  }
  if (!window) return null;
  try { process.kill(window.pid, 0); }
  catch (error) { if (error.code === "ESRCH") return null; throw error; }
  return true;
}
export async function activeSelection(dataRoot) {
  if (!await isWindowOpen(dataRoot)) return null;
  return await readJson(path.join(dataRoot, "floating", "selection.json"));
}
export async function isCurrentSelection(dataRoot, selection) {
  return (await activeSelection(dataRoot))?.openId === selection.openId;
}
export async function discardSelection(dataRoot, selection) {
  if (!selection) return;
  const { directory, latest } = explanationFiles(dataRoot, selection);
  const files = await readdir(directory);
  for (const file of files) {
    if (file === path.basename(latest) || file.startsWith("result-" + selection.openId + "-") || file === "questions-" + selection.openId + ".json" || file === "questions-" + selection.openId + "-control.json") await rm(path.join(directory, file), { force: true });
  }
}
export async function retainedSelections(dataRoot) {
  return (await readJson(path.join(dataRoot, "floating", "chats.json")))?.selections || [];
}
export async function isRetainedSelection(dataRoot, selection) {
  return await isWindowOpen(dataRoot) && (await retainedSelections(dataRoot)).some(item => item.openId === selection.openId);
}
export async function selectChat(dataRoot, threadId, title) {
  threadDirectory(dataRoot, threadId);
  const directory = path.join(dataRoot, "floating");
  const selections = await isWindowOpen(dataRoot) ? await retainedSelections(dataRoot) : [];
  let selection = selections.find(item => item.threadId === threadId);
  if (!selection) {
    selection = { threadId, title, openId: randomUUID(), initialStatus: "idle" };
    selections.push(selection);
  } else selection.title = title;
  await writeJson(path.join(directory, "chats.json"), { selections });
  await writeJson(path.join(directory, "selection.json"), selection);
  return selection;
}

export async function readExplanation(dataRoot, threadId) {
  threadDirectory(dataRoot, threadId);
  const selection = (await retainedSelections(dataRoot)).find(item => item.threadId === threadId);
  if (!selection) return { threadId, status: "idle" };
  const latest = await readJson(explanationFiles(dataRoot, selection).latest);
  if (!latest) return { threadId, status: selection.initialStatus || "idle" };
  const state = await readJson(explanationFiles(dataRoot, selection, latest.turnId).result) || { threadId, status: "idle" };
  if (state.workerPid && ["queued", "generating"].includes(state.status) && !isProcessRunning(state.workerPid)) {
    return { ...state, status: "error", error: "解释后台已退出。点击“解释当前对话”可重新生成。" };
  }
  return state;
}

export function isProcessRunning(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === "ESRCH") return false; throw error; }
}
