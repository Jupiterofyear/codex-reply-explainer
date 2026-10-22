import { randomUUID } from "node:crypto";
import { readRolloutHistory } from "./history.mjs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { threadDirectory, writeJson, readJson, activeSelection, isCurrentSelection, explanationFiles, discardSelection, readExplanation } from "./state.mjs";
import { explanationPrompt, snapshotThroughTurn, relativeRolloutPath } from "./context.mjs";
export { explanationPrompt, snapshotThroughTurn, relativeRolloutPath, requestUsage } from "./context.mjs";

export async function copyRuntimeInputs(sourceHome, home) {
  for (const name of ["config.toml", "AGENTS.md", "models_cache.json", "installation_id"]) {
    try { await copyFile(path.join(sourceHome, name), path.join(home, name)); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  await copyFile(path.join(sourceHome, "auth.json"), path.join(home, "auth.json"));
}

export async function explainStop(event, { dataRoot, sourceHome, backend }) {
  threadDirectory(dataRoot, event.session_id);
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(event.turn_id)) throw new Error("回复标识无效。");
  if (!event.last_assistant_message?.trim() || !event.transcript_path) return;
  const selection = await activeSelection(dataRoot);
  if (selection?.threadId !== event.session_id) return;
  const previous = await readExplanation(dataRoot, event.session_id);
  if (previous.turnId === event.turn_id && previous.status !== "queued") return;
  const files = explanationFiles(dataRoot, selection, event.turn_id);
  const runs = path.join(path.resolve(dataRoot), "runs");
  const run = path.join(runs, selection.openId + "-" + event.turn_id);
  await mkdir(runs, { recursive: true });
  try { await mkdir(run); }
  catch (error) { if (error.code === "EEXIST") return; throw error; }
  const state = { threadId: event.session_id, turnId: event.turn_id, status: "generating", workerPid: process.pid, startedAt: new Date().toISOString() };
  const cancel = new AbortController();
  let finished = false, monitor, monitorError, finalState, saved, partial = "", displayed = "";
  try {
    await writeJson(files.result, state);
    await writeJson(files.latest, { turnId: event.turn_id });
    if (previous.turnId && previous.turnId !== event.turn_id) await rm(explanationFiles(dataRoot, selection, previous.turnId).result, { force: true });
    const { saved: snapshot, snapshotId, context, metadata } = await saveSnapshot(event, sourceHome, backend);
    saved = snapshot;
    await copyRuntimeInputs(sourceHome, backend.home);
    monitor = (async () => {
      while (!finished) {
        await delay(250);
        if (finished) return;
        if (!await isCurrentSelection(dataRoot, selection) || (await readJson(files.latest))?.turnId !== event.turn_id) {
          cancel.abort(new Error("已切换或关闭解释。")); return;
        }
        if (partial !== displayed) {
          displayed = partial;
          await writeJson(files.result, { ...state, text: displayed });
        }
      }
    })().catch(error => { monitorError = error; cancel.abort(error); });
    const result = await backend.generate({ threadId: snapshotId, path: saved, context, metadata,
      prompt: explanationPrompt, signal: cancel.signal, onText: text => { partial = text; } });
    finalState = { ...state, status: "ready", text: result.text, completedAt: new Date().toISOString(),
      usage: result.usage, backendPid: backend.child.pid, branchId: result.branchId, timings: result.timings };
  } catch (error) {
    if (monitorError || !cancel.signal.aborted) finalState = { ...state, status: "error", text: partial, error: (monitorError || error).message, completedAt: new Date().toISOString() };
  } finally {
    finished = true;
    if (monitor) await monitor;
    if (monitorError) finalState = { ...state, status: "error", text: partial, error: monitorError.message, completedAt: new Date().toISOString() };
    if (path.dirname(run) !== runs) throw new Error("临时目录超出运行文件夹。");
    if (saved) await rm(saved, { force: true });
    await rm(run, { recursive: true, force: true });
    await rm(path.join(backend.home, "auth.json"), { force: true });
    const current = await isCurrentSelection(dataRoot, selection);
    const latest = current ? await readJson(files.latest) : null;
    if (!current) await discardSelection(dataRoot, selection);
    else if (latest?.turnId !== event.turn_id) await rm(files.result, { force: true });
    else if (finalState) await writeJson(files.result, finalState);
    else await rm(files.result, { force: true });
  }
}

export async function saveSnapshot(event, sourceHome, backend) {
    const source = path.resolve(event.transcript_path);
    relativeRolloutPath(sourceHome, source);
    const { text, context } = snapshotThroughTurn(await readRolloutHistory(sourceHome, source), event.turn_id);
    const metadata = JSON.parse(text.split("\n")[0]).payload;
    if (metadata.id !== event.session_id) throw new Error("聊天记录与当前聊天不一致。");
    // Give each snapshot its own identity so the warm backend cannot reuse an older import.
    const snapshotId = randomUUID();
    const records = text.trimEnd().split("\n").map(JSON.parse);
    records[0].payload = { ...metadata, id: snapshotId, session_id: metadata.session_id ?? metadata.id, history_mode: "legacy" };
    delete records[0].payload.history_base;
    for (const record of records) delete record.ordinal;
    const saved = path.join(backend.home, "sessions", "rollout-" + snapshotId + ".jsonl");
    await mkdir(path.dirname(saved), { recursive: true });
    await writeFile(saved, records.map(JSON.stringify).join("\n") + "\n", "utf8");
    return { saved, snapshotId, context, metadata };
}
