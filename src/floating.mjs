import { ensureWorker } from "./worker-client.mjs";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { threadDirectory, selectChat, isWindowOpen } from "./state.mjs";

export async function readThreadName(sourceHome, threadId) {
  const { DatabaseSync } = await import("node:sqlite");
  threadDirectory(sourceHome, threadId);
  const database = new DatabaseSync(path.join(sourceHome, "state_5.sqlite"), { readOnly: true });
  try {
    const thread = database.prepare("SELECT name, title FROM threads WHERE id = ?").get(threadId);
    if (!thread) throw new Error("没有找到这段聊天的名称。");
    return thread.name || thread.title || "新聊天";
  } finally {
    database.close();
  }
}

export async function readThreadIdByName(sourceHome, title) {
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(path.join(sourceHome, "state_5.sqlite"), { readOnly: true });
  try {
    const rows = database.prepare("SELECT id FROM threads WHERE COALESCE(NULLIF(name, ''), title) = ?").all(title);
    if (rows.length > 1) throw new Error("有多段同名聊天，无法自动确定当前对话。请给当前聊天改一个不同的名称。");
    if (rows.length === 0) throw new Error("当前聊天没有本地记录，暂不支持在小窗中提问。");
    return rows[0].id;
  } finally { database.close(); }
}

export async function openFloatingWindow({ root, dataRoot, sourceHome, threadId, title }) {
  const directory = path.join(dataRoot, "floating");
  const temporary = path.join(directory, "tmp");
  await mkdir(temporary, { recursive: true });
  if (threadId) await selectChat(dataRoot, threadId, title);
  if (await isWindowOpen(dataRoot)) { await ensureWorker({ root, dataRoot, sourceHome }); return; }
  const child = spawn(path.join(root, "dist", "floating.exe"), [dataRoot, sourceHome, process.execPath], {
    cwd: root, env: { ...process.env, TMP: temporary, TEMP: temporary },
    windowsHide: false, detached: true, stdio: "ignore"
  });
  await new Promise((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
  child.unref();
  const deadline = Date.now() + 10000;
  while (!await isWindowOpen(dataRoot)) {
    if (child.exitCode !== null) throw new Error("悬浮窗启动失败：" + child.exitCode);
    if (Date.now() >= deadline) throw new Error("悬浮窗启动超时。");
    await delay(50);
  }
  await ensureWorker({ root, dataRoot, sourceHome });
}
