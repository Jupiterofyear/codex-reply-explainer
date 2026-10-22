import { rm } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { latestReplyEvent } from "./latest.mjs";
import { saveSnapshot, copyRuntimeInputs } from "./explain.mjs";
import { questionPrompt } from "./context.mjs";
import { readJson, writeJson, threadDirectory, activeSelection, isCurrentSelection } from "./state.mjs";

export function questionFiles(dataRoot, selection) {
  threadDirectory(dataRoot, selection.openId);
  const prefix = path.join(dataRoot, "floating", "questions-" + selection.openId);
  return { control: prefix + "-control.json", result: prefix + ".json" };
}

// A new revision cancels the previous branch; ordinary questions keep its revision.
export async function submitQuestion(dataRoot, openId, action, text = "") {
  const selection = await activeSelection(dataRoot);
  if (selection?.openId !== openId) throw new Error("已切换或关闭聊天，请重新提问。");
  if (!["ask", "reset"].includes(action)) throw new Error("提问操作无效。");
  if (action === "ask" && (!text.trim() || text.length > 32000)) throw new Error("请输入 1 至 32000 字的问题。");
  const files = questionFiles(dataRoot, selection);
  const previous = await readJson(files.control);
  const savedResult = await readJson(files.result);
  const result = savedResult?.revision === previous?.revision ? savedResult : null;
  if (action === "ask" && previous?.requestId && result?.requestId !== previous.requestId) throw new Error("请等待上一条回答完成。");
  if (action === "ask" && ["queued", "generating"].includes(result?.status)) throw new Error("请等待上一条回答完成。");
  if (action === "ask" && result?.status === "error") throw new Error("请点“重新开始”后继续提问。");
  await writeJson(files.control, { revision: action === "reset" || !previous ? randomUUID() : previous.revision,
    requestId: action === "ask" ? randomUUID() : null, text: action === "ask" ? text.trim() : "" });
  if (!await isCurrentSelection(dataRoot, selection)) {
    await rm(files.control, { force: true }); await rm(files.result, { force: true });
    throw new Error("已切换或关闭聊天，请重新提问。");
  }
}

export class QuestionsSession {
  constructor({ dataRoot, sourceHome, backend }) {
    this.dataRoot = dataRoot; this.sourceHome = sourceHome; this.backend = backend;
    this.messages = [];
  }
  async discard() {
    if (this.branch) await this.backend.discard(this.branch);
    this.branch = null; this.messages = []; this.requestId = null;
  }
  async sync(selection) {
    const control = selection ? await readJson(questionFiles(this.dataRoot, selection).control) : null;
    if (this.selection?.openId !== selection?.openId || this.revision !== control?.revision) {
      await this.discard();
      this.selection = selection; this.revision = control?.revision;
      if (control) {
        const files = questionFiles(this.dataRoot, selection);
        await writeJson(files.result, { revision: control.revision, status: "idle", messages: [] });
        if (!await isCurrentSelection(this.dataRoot, selection)) {
          await rm(files.result, { force: true }); await rm(files.control, { force: true });
        }
      }
    }
    return control;
  }
  async process(selection) {
    const control = await this.sync(selection);
    if (!control?.requestId || this.requestId === control.requestId) return false;
    this.requestId = control.requestId;
    const files = questionFiles(this.dataRoot, selection);
    const state = { revision: control.revision, requestId: control.requestId, status: "generating", workerPid: process.pid };
    this.messages.push({ role: "user", text: control.text });
    const cancel = new AbortController();
    let finished = false, partial = "", displayed = "", saved, monitorError, finalState;
    const current = async () => await isCurrentSelection(this.dataRoot, selection)
      && (await readJson(files.control))?.revision === control.revision;
    const publish = async extra => {
      if (await current()) await writeJson(files.result, { ...state, messages: this.messages, ...extra });
    };
    const monitor = (async () => {
      while (!finished) {
        await delay(100);
        if (finished) return;
        if (!await current()) { cancel.abort(new Error("已重新开始、切换或关闭提问。")); return; }
        if (partial !== displayed) { displayed = partial; await publish({ partial }); }
      }
    })().catch(error => { monitorError = error; cancel.abort(error); });
    try {
      await publish({});
      if (!this.branch) {
        const event = await latestReplyEvent(this.sourceHome, selection.threadId);
        if (!event) throw new Error("暂时没有找到这段聊天已保存的完整回复。");
        const snapshot = await saveSnapshot(event, this.sourceHome, this.backend);
        saved = snapshot.saved;
        await copyRuntimeInputs(this.sourceHome, this.backend.home);
        cancel.signal.throwIfAborted();
        this.branch = await this.backend.fork({ threadId: snapshot.snapshotId, path: saved, context: snapshot.context, metadata: snapshot.metadata, questions: true });
        this.sourceTurnId = event.turn_id;
      }
      const prompt = this.messages.length === 1 ? questionPrompt + "\n\n用户的问题：\n" + control.text : control.text;
      const result = await this.backend.answer({ branch: this.branch, prompt, signal: cancel.signal, onText: text => { partial = text; } });
      this.messages.push({ role: "assistant", text: result.text });
      finalState = { status: "ready", messages: [...this.messages], branchId: this.branch.id, sourceTurnId: this.sourceTurnId, usage: result.usage, timings: result.timings };
    } catch (error) {
      if (!cancel.signal.aborted || monitorError) finalState = { status: "error", messages: [...this.messages], partial, error: (monitorError || error).message };
      // A failed/interrupted turn may leave tool calls or partial input in its history.
      // Require an explicit restart instead of silently continuing that history.
      await this.discard();
      this.requestId = control.requestId;
    } finally {
      finished = true; await monitor;
      if (saved) await rm(saved, { force: true });
      await rm(path.join(this.backend.home, "auth.json"), { force: true });
      if (monitorError) finalState = { status: "error", messages: [...this.messages], partial, error: monitorError.message };
      if (finalState) await publish(finalState);
      if (!await current()) {
        await this.discard();
        if (!await isCurrentSelection(this.dataRoot, selection)) {
          await rm(files.result, { force: true }); await rm(files.control, { force: true });
        }
      }
    }
    return true;
  }
}
