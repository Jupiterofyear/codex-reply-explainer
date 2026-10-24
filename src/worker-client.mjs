import { loadSettings } from "./settings.mjs";
import { spawn } from "node:child_process";
import { openSync, closeSync } from "node:fs";
import { rm } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { readJson, writeJson, activeSelection, explanationFiles, readExplanation, threadDirectory } from "./state.mjs";
import { readPrompts, promptId } from "./prompts.mjs";
export function workerFiles(dataRoot) {
  const directory = path.join(path.resolve(dataRoot), "backend");
  return { directory, state: path.join(directory, "state.json"), pending: path.join(directory, "request.json") };
}
export async function liveWorker(dataRoot) {
  const state = await readJson(workerFiles(dataRoot).state);
  if (!state) return null;
  try { process.kill(state.pid, 0); return state; }
  catch (error) { if (error.code === "ESRCH") return null; throw error; }
}
export async function ensureWorker({ root, dataRoot, sourceHome }) {
  if (await liveWorker(dataRoot)) return;
  const settings = await loadSettings(root);
  const diagnostics = openSync(path.join(dataRoot, "worker-error.log"), "w");
  let child;
  try { child = spawn(process.execPath, [path.join(root, "dist/worker.mjs"), dataRoot, sourceHome, settings.cliPath], {
    cwd: root, env: process.env, windowsHide: true, detached: true, stdio: ["ignore", "ignore", diagnostics]
  }); } finally { closeSync(diagnostics); }
  await new Promise((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
  child.unref();
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const state = await liveWorker(dataRoot);
    if (state?.status === "ready") return;
    if (child.exitCode !== null) throw new Error("解释后台启动失败。");
    await delay(50);
  }
  throw new Error("解释后台启动超时。");
}
export async function enqueueStop(event, { dataRoot }) {
  threadDirectory(dataRoot, event.session_id);
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(event.turn_id)) throw new Error("回复标识无效。");
  if (!event.last_assistant_message?.trim() || !event.transcript_path) return;
  const selection = await activeSelection(dataRoot);
  if (selection?.threadId !== event.session_id) return;
  const prompt = (await readPrompts(dataRoot)).explanation;
  const settingsId = promptId(prompt);
  const previous = await readExplanation(dataRoot, event.session_id);
  if (previous.turnId === event.turn_id && previous.promptId === settingsId && previous.status !== "error") return;
  const files = explanationFiles(dataRoot, selection, event.turn_id);
  const worker = await liveWorker(dataRoot);
  await writeJson(files.result, { threadId: event.session_id, turnId: event.turn_id, promptId: settingsId, status: worker ? "queued" : "error", workerPid: worker?.pid,
    ...worker ? {} : { error: "解释后台已结束，请重新打开小窗。" }, startedAt: new Date().toISOString() });
  await writeJson(files.latest, { turnId: event.turn_id });
  if (previous.turnId && previous.turnId !== event.turn_id) await rm(explanationFiles(dataRoot, selection, previous.turnId).result, { force: true });
  if (!worker) return;
  await writeJson(workerFiles(dataRoot).pending, { openId: selection.openId, event, prompt });
}
