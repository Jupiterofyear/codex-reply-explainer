import { rm } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { latestReplyEvent } from "./latest.mjs";
import { saveSnapshot, copyRuntimeInputs } from "./explain.mjs";
import { questionWithHistory } from "./context.mjs";
import { readPrompts, questionInstructions } from "./prompts.mjs";
import { readJson, writeJson, threadDirectory, activeSelection, isCurrentSelection, isRetainedSelection } from "./state.mjs";

export function questionFiles(dataRoot, selection) {
  threadDirectory(dataRoot, selection.openId);
  const prefix = path.join(dataRoot, "floating", "questions-" + selection.openId);
  return { control: prefix + "-control.json", result: prefix + ".json" };
}

// A new revision cancels the previous branch; ordinary questions keep its revision.
export async function submitQuestion(dataRoot, openId, action, text = "") {
  const selection = await activeSelection(dataRoot);
  if (selection?.openId !== openId) throw new Error("已切换或关闭聊天，请重新提问。");
  if (!["ask", "reset", "stop"].includes(action)) throw new Error("提问操作无效。");
  if (action === "ask" && (!text.trim() || text.length > 32000)) throw new Error("请输入 1 至 32000 字的问题。");
  const files = questionFiles(dataRoot, selection);
  const previous = await readJson(files.control);
  const savedResult = await readJson(files.result);
  const result = savedResult?.revision === previous?.revision ? savedResult : null;
  if (action === "ask" && previous?.requestId && result?.requestId !== previous.requestId) throw new Error("请等待上一条回答完成。");
  if (action === "ask" && ["queued", "generating"].includes(result?.status)) throw new Error("请等待上一条回答完成。");
  if (action === "ask" && result?.status === "error") throw new Error("请点“重新开始”后继续提问。");
  if (action === "stop") {
    if (!previous?.requestId || result?.requestId === previous.requestId && ["ready", "error", "stopped"].includes(result.status)) return;
    await writeJson(files.control, { ...previous, stopRequested: true });
    return;
  }
  await writeJson(files.control, { revision: action === "reset" || !previous ? randomUUID() : previous.revision,
    requestId: action === "ask" ? randomUUID() : null, submittedAt: action === "ask" ? new Date().toISOString() : null, text: action === "ask" ? text.trim() : "" });
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
  async releaseBranch() {
    if (this.branch) await this.backend.discard(this.branch);
    this.branch = null;
  }
  async discard() {
    await this.releaseBranch();
    this.messages = []; this.requestId = null;
  }
  async sync(selection) {
    const control = selection ? await readJson(questionFiles(this.dataRoot, selection).control) : null;
    if (this.selection?.openId !== selection?.openId || this.revision !== control?.revision) {
      await this.discard();
      this.selection = selection; this.revision = control?.revision;
      if (control) {
        const files = questionFiles(this.dataRoot, selection);
        await writeJson(files.result, { revision: control.revision, status: "idle", messages: [] });
        if (!await isRetainedSelection(this.dataRoot, selection)) {
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
    const state = { revision: control.revision, requestId: control.requestId, status: "generating", phase: "preparing", startedAt: control.submittedAt, workerPid: process.pid };
    const history = [...this.messages];
    const question = { role: "user", text: control.text };
    this.messages.push(question);
    const cancel = new AbortController();
    let finished = false, userStopped = false, partial = "", saved, monitorError, finalState, displayed = "";
    const thinking = [];
    const endThinking = () => {
      const stage = thinking.at(-1);
      if (stage && stage.elapsedMs === undefined) stage.elapsedMs = Date.now() - Date.parse(stage.startedAt);
    };
    const phase = value => {
      state.phase = value;
      if (value === "thinking") {
        if (!thinking.length || thinking.at(-1).elapsedMs !== undefined) thinking.push({ offset: partial.length, startedAt: new Date().toISOString() });
      } else endThinking();
    };
    const checkStop = async () => {
      if ((await readJson(files.control))?.stopRequested) { userStopped = true; cancel.abort(new Error("已停止生成。")); }
    };
    const current = async () => await isRetainedSelection(this.dataRoot, selection)
      && (await readJson(files.control))?.revision === control.revision;
    const publish = async extra => {
      if (await current()) await writeJson(files.result, { ...state, messages: this.messages, thinking, ...extra });
    };
    const monitor = (async () => {
      while (!finished) {
        await delay(100);
        if (finished) return;
        if (!await current()) { cancel.abort(new Error("已重新开始或关闭提问。")); return; }
        await checkStop();
        if (cancel.signal.aborted) return;
        const content = JSON.stringify({ partial, thinking, phase: state.phase });
        if (content !== displayed) { displayed = content; await publish({ partial }); }
      }
    })().catch(error => { monitorError = error; cancel.abort(error); });
    try {
      await publish({});
      await checkStop(); cancel.signal.throwIfAborted();
      const event = await latestReplyEvent(this.sourceHome, selection.threadId);
      if (!event) throw new Error("暂时没有找到这段聊天已保存的完整回复。");
      const instructions = (await readPrompts(this.dataRoot)).question;
      const newBranch = !this.branch || this.sourceTurnId !== event.turn_id || this.questionPrompt !== instructions;
      if (newBranch) {
        const snapshot = await saveSnapshot(event, this.sourceHome, this.backend);
        saved = snapshot.saved;
        await copyRuntimeInputs(this.sourceHome, this.backend.home);
        cancel.signal.throwIfAborted();
        if (this.branch) await this.backend.discard(this.branch);
        this.branch = null;
        this.branch = await this.backend.fork({ threadId: snapshot.snapshotId, path: saved, context: snapshot.context, metadata: snapshot.metadata, questions: true, developerInstructions: questionInstructions(instructions) });
        this.sourceTurnId = event.turn_id;
        this.questionPrompt = instructions;
      }
      question.sourceTurnId = this.sourceTurnId;
      const prompt = newBranch ? questionWithHistory(control.text, history) : control.text;
      await checkStop(); cancel.signal.throwIfAborted();
      phase("thinking");
      await publish({});
      const result = await this.backend.answer({ branch: this.branch, prompt, signal: cancel.signal, onPhase: phase, onText: text => { partial = text; } });
      endThinking();
      this.messages.push({ role: "assistant", text: result.text, thinking, sourceTurnId: this.sourceTurnId, elapsedMs: Date.now() - Date.parse(state.startedAt) });
      finalState = { status: "ready", messages: [...this.messages], branchId: this.branch.id, sourceTurnId: this.sourceTurnId, usage: result.usage, timings: result.timings };
    } catch (error) {
      endThinking();
      if (userStopped && !monitorError) {
        this.messages.push({ role: "assistant", text: partial, thinking, stopped: true, sourceTurnId: this.sourceTurnId, elapsedMs: Date.now() - Date.parse(state.startedAt) });
        finalState = { status: "stopped", messages: [...this.messages], sourceTurnId: this.sourceTurnId };
        // Resume from the visible history, without an interrupted turn in the fork.
        await this.releaseBranch();
      } else {
        if (!cancel.signal.aborted || monitorError) finalState = { status: "error", messages: [...this.messages], partial, error: (monitorError || error).message };
        await this.discard();
      }
      this.requestId = control.requestId;
    } finally {
      finished = true; await monitor;
      if (saved) await rm(saved, { force: true });
      await rm(path.join(this.backend.home, "auth.json"), { force: true });
      if (monitorError) finalState = { status: "error", messages: [...this.messages], partial, error: monitorError.message };
      if (finalState) await publish({ ...finalState, thinking: [], completedAt: new Date().toISOString(), elapsedMs: Date.now() - Date.parse(state.startedAt) });
      if (!await current()) {
        await this.discard();
        if (!await isRetainedSelection(this.dataRoot, selection)) {
          await rm(files.result, { force: true }); await rm(files.control, { force: true });
        }
      }
    }
    return true;
  }
}
