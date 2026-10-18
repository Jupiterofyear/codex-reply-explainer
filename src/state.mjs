import { readFile, writeFile, rename, mkdir, readdir, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

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
  await rename(temporary, file);
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
  const window = await readJson(path.join(directory, "window.json"));
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
    if (file === path.basename(latest) || file.startsWith("result-" + selection.openId + "-")) await rm(path.join(directory, file), { force: true });
  }
}
export async function selectChat(dataRoot, threadId, title) {
  threadDirectory(dataRoot, threadId);
  const file = path.join(dataRoot, "floating", "selection.json");
  const previous = await readJson(file);
  const selection = { threadId, title, openId: randomUUID(), initialStatus: "idle" };
  await writeJson(file, selection);
  await discardSelection(dataRoot, previous);
  return selection;
}
export async function readExplanation(dataRoot, threadId) {
  threadDirectory(dataRoot, threadId);
  const selection = await readJson(path.join(dataRoot, "floating", "selection.json"));
  if (selection?.threadId !== threadId) return { threadId, status: "idle" };
  const latest = await readJson(explanationFiles(dataRoot, selection).latest);
  if (!latest) return { threadId, status: selection.initialStatus || "idle" };
  return await readJson(explanationFiles(dataRoot, selection, latest.turnId).result) || { threadId, status: "idle" };
}
