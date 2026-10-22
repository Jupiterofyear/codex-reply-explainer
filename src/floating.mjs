import { ensureWorker } from "./worker-client.mjs";
import { DatabaseSync } from "node:sqlite";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { threadDirectory, selectChat, isWindowOpen } from "./state.mjs";

export function readThreadName(sourceHome, threadId) {
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
