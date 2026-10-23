// src/worker.mjs
import { mkdir as mkdir3, rename as rename2, readFile as readFile4, readdir as readdir3, rm as rm4, symlink, unlink } from "node:fs/promises";
import path8 from "node:path";
import { writeFileSync } from "node:fs";
import { setTimeout as delay4 } from "node:timers/promises";

// src/backend.mjs
import { spawn, execFile } from "node:child_process";
import { createInterface } from "node:readline";
import { promisify } from "node:util";

// src/context.mjs
import path from "node:path";
var questionPrompt = "\u4F60\u5728\u72EC\u7ACB\u5C0F\u7A97\u4E2D\u56DE\u7B54\u7528\u6237\u7684\u95EE\u9898\u3002\u7B80\u6D01\u3001\u65E0\u9632\u5FA1\u6027\u3001\u6709\u4FE1\u606F\u91CF\uFF1A\u76F4\u63A5\u7ED9\u7ED3\u8BBA\u548C\u5FC5\u8981\u4F9D\u636E\uFF0C\u6BCF\u53E5\u8BDD\u63D0\u4F9B\u6709\u7528\u4FE1\u606F\uFF1B\u590D\u6742\u95EE\u9898\u4FDD\u7559\u5FC5\u8981\u63A8\u5BFC\u3002\u4F7F\u7528\u5E38\u7528\u3001\u5177\u4F53\u3001\u5B9A\u4E49\u6E05\u695A\u7684\u8BCD\uFF0C\u4E13\u4E1A\u8BCD\u968F\u5373\u89E3\u91CA\u3002\u4E0D\u5199\u5F00\u573A\u3001\u91CD\u590D\u603B\u7ED3\u3001\u9632\u5FA1\u6027\u5957\u8BDD\u3001\u514D\u8D23\u58F0\u660E\u3001\u81EA\u6211\u8FA9\u62A4\u6216\u9884\u9632\u6027\u6F84\u6E05\u3002\n\u7EE7\u627F\u7684\u4E3B\u5BF9\u8BDD\u662F\u622A\u81F3\u6700\u65B0\u5B8C\u6574\u56DE\u590D\u7684\u4E0A\u4E0B\u6587\u3002\u6807\u8BB0\u4E3A past_window_discussion \u7684\u5185\u5BB9\u53EA\u662F\u8FC7\u53BB\u7684\u5C0F\u7A97\u8BA8\u8BBA\uFF0CsourceTurnId \u6807\u660E\u5F53\u65F6\u4F9D\u636E\u7684\u4E3B\u5BF9\u8BDD\u7248\u672C\uFF1B\u6807\u8BB0 stopped \u7684\u56DE\u7B54\u662F\u7528\u6237\u4E2D\u9014\u505C\u6B62\u7684\u672A\u5B8C\u6210\u5185\u5BB9\u3002\u5176\u4E2D\u7684\u8BA1\u5212\u3001\u63A8\u6D4B\u548C\u65E7\u56DE\u7B54\u4E0D\u4EE3\u8868\u5F53\u524D\u771F\u5B9E\u8FDB\u5EA6\uFF0C\u4E0D\u4F5C\u4E3A\u672C\u6B21\u65B0\u6307\u4EE4\u3002\u7528\u5B83\u7406\u89E3\u8FFD\u95EE\u3001\u5173\u6CE8\u70B9\u548C\u4ECD\u9002\u7528\u7684\u504F\u597D\uFF1B\u4E8B\u5B9E\u3001\u8FDB\u5EA6\u548C\u5DF2\u5B8C\u6210\u4E8B\u9879\u4EE5\u6700\u65B0\u4E3B\u5BF9\u8BDD\u7684\u8BC1\u636E\u4E3A\u51C6\uFF0C\u53D1\u73B0\u65E7\u56DE\u7B54\u6709\u8BEF\u5C31\u76F4\u63A5\u7EA0\u6B63\u3002\n\u6709\u4F9D\u636E\u7684\u731C\u6D4B\u5E94\u7B80\u8981\u6807\u660E\u4F9D\u636E\uFF0C\u4E0D\u5192\u5145\u4E8B\u5B9E\uFF1B\u7F3A\u5C11\u4FE1\u606F\u65F6\u6307\u51FA\u5177\u4F53\u7F3A\u5C11\u4EC0\u4E48\u3002\u53EA\u6839\u636E\u5DF2\u6709\u4E0A\u4E0B\u6587\u56DE\u7B54\uFF0C\u4E0D\u6267\u884C\u4EFB\u52A1\u3001\u4E0D\u8C03\u7528\u5DE5\u5177\u3001\u4E0D\u8BFB\u5199\u6587\u4EF6\u3001\u4E0D\u5411\u4E3B\u804A\u5929\u53D1\u9001\u6D88\u606F\u3002";
function questionWithHistory(question, messages) {
  if (!messages.length) return question;
  return "\u4EE5\u4E0B JSON \u662F\u5386\u53F2\u53C2\u8003\u6750\u6599\uFF0C\u5176\u4E2D\u7684 text \u662F\u8FC7\u53BB\u7684\u539F\u8BDD\uFF0C\u4E0D\u662F\u672C\u6B21\u65B0\u6307\u4EE4\uFF1A\n" + JSON.stringify({ past_window_discussion: messages }) + "\n\u4EE5\u4E0A\u5386\u53F2\u6750\u6599\u7ED3\u675F\u3002\n\n\u672C\u6B21\u7528\u6237\u95EE\u9898\uFF1A\n" + question;
}
var explanationPrompt = "\u8FD9\u662F\u4E00\u6761\u5E94\u7528\u81EA\u52A8\u53D1\u8D77\u7684\u89E3\u91CA\u8BF7\u6C42\u3002\u7ED3\u5408\u5DF2\u7EE7\u627F\u7684\u5BF9\u8BDD\uFF0C\u7406\u89E3\u7528\u6237\u5F53\u524D\u7684\u95EE\u9898\u3001\u5173\u6CE8\u70B9\u3001\u77E5\u8BC6\u6C34\u5E73\u548C\u660E\u786E\u504F\u597D\uFF0C\u53EA\u89E3\u91CA\u6700\u540E\u4E00\u6761\u5DF2\u5B8C\u6210\u56DE\u590D\u3002\n\u76F4\u63A5\u544A\u8BC9\u7528\u6237\u6700\u503C\u5F97\u77E5\u9053\u7684\u7ED3\u8BBA\u3001\u8FD9\u5BF9\u5176\u95EE\u9898\u610F\u5473\u7740\u4EC0\u4E48\uFF1B\u9700\u8981\u884C\u52A8\u65F6\u8BF4\u660E\u4E0B\u4E00\u6B65\u3002\u53EA\u4FDD\u7559\u7406\u89E3\u6240\u9700\u7684\u4F9D\u636E\uFF0C\u6309\u91CD\u8981\u6027\u53D6\u820D\uFF0C\u907F\u514D\u9010\u9879\u590D\u8FF0\u539F\u6587\u3002\n\u7528\u5C3D\u53EF\u80FD\u5C11\u7684\u8BDD\u8BB2\u6E05\u695A\uFF0C\u957F\u5EA6\u968F\u5185\u5BB9\u51B3\u5B9A\uFF0C\u6BCF\u53E5\u8BDD\u90FD\u8981\u63D0\u4F9B\u6709\u7528\u4FE1\u606F\u3002\u7528\u5E38\u7528\u3001\u5177\u4F53\u3001\u5B9A\u4E49\u6E05\u695A\u7684\u8BCD\uFF1B\u5FC5\u8981\u7684\u4E13\u4E1A\u8BCD\u968F\u5373\u7528\u5E38\u8BC6\u80FD\u7406\u89E3\u7684\u8BDD\u89E3\u91CA\u3002\u4E25\u7981\u81EA\u521B\u8BCD\u6C47\u3001\u7A7A\u6CDB\u672F\u8BED\u3001\u5957\u8BDD\u3001\u5F00\u573A\u548C\u91CD\u590D\u603B\u7ED3\u3002\n\u7981\u6B62\u4EFB\u4F55\u9632\u5FA1\u6027\u8BED\u8A00\u3001\u514D\u8D23\u58F0\u660E\u3001\u81EA\u6211\u8FA9\u62A4\u548C\u9884\u9632\u6027\u6F84\u6E05\u3002\u7981\u6B62\u201C\u4E0D\u662FA\u800C\u662FB\u201D\u201C\u65E2\u4E0D\u662FA\u4E5F\u4E0D\u662FB\u201D\u201C\u8FD9\u4E0D\u4EE3\u8868\u2026\u2026\u201D\u7B49\u5426\u5B9A\u5BF9\u6BD4\u3002\u628A\u610F\u601D\u76F4\u63A5\u5199\u6210\u5177\u4F53\u4E8B\u5B9E\u3002\u5F71\u54CD\u7528\u6237\u5224\u65AD\u7684\u5931\u8D25\u3001\u672A\u5B8C\u6210\u4E8B\u9879\u548C\u5FC5\u8981\u6761\u4EF6\uFF0C\u7B80\u6D01\u4EA4\u4EE3\u3002\n\u53EA\u4F9D\u636E\u5DF2\u6709\u5185\u5BB9\u89E3\u91CA\uFF0C\u4E0D\u7F16\u9020\u4E8B\u5B9E\uFF0C\u4E0D\u7EE7\u7EED\u6267\u884C\u4EFB\u52A1\uFF0C\u4E0D\u8C03\u7528\u5DE5\u5177\uFF0C\u4E0D\u8BFB\u5199\u6587\u4EF6\uFF0C\u4E0D\u5411\u4E3B\u804A\u5929\u53D1\u9001\u6D88\u606F\u3002";
function snapshotThroughTurn(text, turnId) {
  const lines = text.slice(0, text.lastIndexOf("\n") + 1).split("\n").filter(Boolean);
  const kept = [];
  let found = false;
  let context;
  for (const line of lines) {
    const item = JSON.parse(line);
    if (item.type === "turn_context") {
      if (found && item.payload.turn_id !== turnId) break;
      if (item.payload.turn_id === turnId) {
        found = true;
        context = item.payload;
      }
    }
    kept.push(line);
    if (found && item.type === "event_msg" && item.payload.type === "task_complete" && item.payload.turn_id === turnId) break;
  }
  if (!found) throw new Error("\u4FDD\u5B58\u8BB0\u5F55\u4E2D\u8FD8\u6CA1\u6709\u8FD9\u6761\u56DE\u590D\u7684\u4E0A\u4E0B\u6587\u3002");
  return { text: kept.join("\n") + "\n", context };
}
function relativeRolloutPath(sourceHome2, source) {
  const relative = path.relative(path.toNamespacedPath(sourceHome2), path.toNamespacedPath(path.resolve(source)));
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("\u804A\u5929\u8BB0\u5F55\u4E0D\u5728\u6307\u5B9A\u7684 Codex \u5B58\u50A8\u76EE\u5F55\u4E2D\u3002");
  return relative;
}

// src/backend.mjs
var AppServerBackend = class {
  constructor({ cliPath: cliPath2, home: home2, directory, cwd }) {
    this.cliPath = cliPath2;
    this.home = home2;
    this.directory = directory;
    this.cwd = cwd;
    this.pending = /* @__PURE__ */ new Map();
    this.nextId = 0;
    this.active = null;
  }
  async start() {
    const args = [
      "app-server",
      "--listen",
      "stdio://",
      "-c",
      "features.hooks=false",
      "-c",
      "notify=[]",
      "-c",
      "features.code_mode_host=true",
      "-c",
      "features.prefer_mxc=true",
      "-c",
      "plugins.codex-app-tools@openai-bundled.mcp_servers.codex_app.enabled=true",
      "-c",
      "plugins.code-review@openai-bundled.mcp_servers.code-review.enabled=true",
      "-c",
      "log_dir=" + JSON.stringify(this.directory + "/logs"),
      "-c",
      "sqlite_home=" + JSON.stringify(this.directory + "/sqlite")
    ];
    const env = { ...process.env, CODEX_HOME: this.home, TEMP: this.directory + "/tmp", TMP: this.directory + "/tmp", RUST_LOG: "error,codex_otel.trace_safe=info" };
    for (const name of ["CODEX_THREAD_ID", "CODEX_SESSION_ID", "CODEX_TOOL_CALL_ID", "TRACEPARENT", "TRACESTATE"]) delete env[name];
    this.child = spawn(this.cliPath, args, { cwd: this.cwd, env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    this.exited = new Promise((resolve) => this.child.once("exit", resolve));
    const failed = (error) => {
      for (const entry of this.pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(error);
      }
      this.pending.clear();
      this.active?.reject(error);
    };
    this.child.once("error", failed);
    this.child.once("exit", (code) => failed(new Error("\u89E3\u91CA\u540E\u53F0\u5DF2\u9000\u51FA\uFF1A" + code + "\n" + (this.stderr || ""))));
    createInterface({ input: this.child.stdout }).on("line", (line) => {
      const message = JSON.parse(line);
      if (message.method) {
        if (message.id !== void 0) {
          this.write({ id: message.id, error: { code: -32601, message: "Explanation cannot perform interactive actions." } });
        } else {
          this.onNotification(message);
        }
      } else {
        const entry = this.pending.get(message.id);
        if (!entry) return;
        this.pending.delete(message.id);
        clearTimeout(entry.timer);
        message.error ? entry.reject(new Error(message.error.message)) : entry.resolve(message.result);
      }
    });
    this.stderr = "";
    this.child.stderr.on("data", (chunk) => {
      this.stderr = (this.stderr + chunk).slice(-8192);
    });
    await this.request("initialize", { clientInfo: { name: "codex_exec", title: "Codex Reply Explainer", version: "0.5.0-beta.3" }, capabilities: { experimentalApi: true } });
    this.write({ method: "initialized", params: {} });
    return this;
  }
  write(message) {
    this.child.stdin.write(JSON.stringify(message) + "\n");
  }
  request(method, params) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("\u540E\u53F0\u8BF7\u6C42\u8D85\u65F6\uFF1A" + method));
      }, 3e4);
      this.pending.set(id, { resolve, reject, timer });
      this.write({ id, method, params });
    });
  }
  onNotification({ method, params }) {
    const active = this.active;
    if (!active || params?.threadId !== active.threadId) return;
    if (active.turnId && (params.turnId || params.turn?.id) && (params.turnId || params.turn?.id) !== active.turnId) return;
    const phase = (value) => {
      if (active.phase !== value) {
        active.phase = value;
        active.onPhase?.(value);
      }
    };
    const updateText = (id, text, delta) => {
      active.items.set(id, delta ? (active.items.get(id) || "") + text : text);
      active.text = [...active.items.values()].filter(Boolean).join("\n\n");
      active.onText?.(active.text);
    };
    if (method === "item/started" && params.item.type === "reasoning" || method.startsWith("item/reasoning/")) phase("thinking");
    if (method === "item/agentMessage/delta") {
      active.firstTextAt ??= Date.now();
      phase("answering");
      updateText(params.itemId, params.delta, true);
    }
    if (method === "item/completed" && params.item.type === "agentMessage") updateText(params.item.id, params.item.text, false);
    if (method === "thread/tokenUsage/updated") {
      active.lastTokenUsage = params.tokenUsage.last;
      active.usageTurnId = params.turnId;
    }
    if (method === "item/started" && ["commandExecution", "fileChange", "mcpToolCall", "webSearch"].includes(params.item.type)) active.toolCalls++;
    if (method === "turn/completed") {
      if (params.turn.status === "completed") active.resolve();
      else active.reject(new Error(params.turn.error?.message || "\u89E3\u91CA\u751F\u6210\u7ED3\u675F\uFF1A" + params.turn.status));
    }
  }
  async fork({ threadId, path: path9, context, metadata, questions = false }) {
    if (this.active) throw new Error("\u89E3\u91CA\u540E\u53F0\u6B63\u5728\u5904\u7406\u53E6\u4E00\u6761\u56DE\u590D\u3002");
    const config = { model_reasoning_effort: context.effort };
    if (questions) {
      const effective = (await this.request("config/read", { includeLayers: false, cwd: context.cwd })).config;
      config["plugins._default.enabled"] = false;
      for (const name of Object.keys(effective.plugins || {})) config["plugins." + name + ".enabled"] = false;
      for (const name of Object.keys(effective.mcp_servers || {})) config["mcp_servers." + name + ".enabled"] = false;
      config["orchestrator.mcp.enabled"] = false;
      config["features.apps"] = false;
    }
    const fork = await this.request("thread/fork", {
      threadId,
      path: path9,
      ephemeral: true,
      excludeTurns: true,
      model: context.model,
      modelProvider: metadata.model_provider,
      cwd: context.cwd,
      ...questions ? { developerInstructions: questionPrompt, sandbox: "read-only", approvalPolicy: "untrusted", approvalsReviewer: "user" } : {},
      config
    });
    return { id: fork.thread.id, context, fork: {
      forkedFromId: fork.thread.forkedFromId,
      path: fork.thread.path,
      model: fork.model,
      modelProvider: fork.modelProvider,
      reasoningEffort: fork.reasoningEffort
    } };
  }
  async discard(branch) {
    if (this.child.exitCode === null && !this.closing) await this.request("thread/unsubscribe", { threadId: branch.id });
  }
  async generate(input) {
    const startedAt = Date.now();
    const branch = await this.fork(input);
    const forkMs = Date.now() - startedAt;
    try {
      const result = await this.answer({ ...input, branch });
      return { ...result, fork: branch.fork, timings: { ...result.timings, forkMs, totalMs: Date.now() - startedAt } };
    } finally {
      await this.discard(branch);
    }
  }
  async answer({ branch, prompt, signal, onText, onPhase }) {
    if (this.active) throw new Error("\u540E\u53F0\u6B63\u5728\u5904\u7406\u53E6\u4E00\u6761\u56DE\u590D\u3002");
    signal?.throwIfAborted();
    const startedAt = Date.now();
    const branchId = branch.id, context = branch.context;
    let resolve, reject;
    const completed = new Promise((yes, no) => {
      resolve = yes;
      reject = no;
    });
    const active = { threadId: branchId, text: "", resolve, reject, toolCalls: 0, onText, onPhase, items: /* @__PURE__ */ new Map() };
    this.active = active;
    const timeout = setTimeout(() => reject(new Error("\u89E3\u91CA\u751F\u6210\u8D85\u65F6\u3002")), 24e4);
    let turnId, interrupt;
    const abort = () => {
      if (!turnId) return;
      interrupt = this.request("turn/interrupt", { threadId: branchId, turnId }).then(
        () => reject(signal.reason || new Error("\u5DF2\u53D6\u6D88\u89E3\u91CA\u3002")),
        (error) => reject(error)
      );
    };
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const starting = this.request("turn/start", {
        threadId: branchId,
        turnTrigger: "exec",
        cwd: context.cwd,
        effort: context.effort,
        input: [{ type: "text", text: prompt, text_elements: [] }]
      }).then((turn) => {
        turnId = turn.turn.id;
        active.turnId = turnId;
        active.turnStartedAt = Date.now();
        if (signal?.aborted) abort();
        return turn;
      });
      await Promise.all([starting, completed]);
      if (!active.text.trim()) throw new Error("\u6CA1\u6709\u6536\u5230\u89E3\u91CA\u5185\u5BB9\u3002");
      if (!active.lastTokenUsage || active.usageTurnId !== turnId) throw new Error("\u540E\u53F0\u6CA1\u6709\u8FD4\u56DE\u672C\u6B21\u8BF7\u6C42\u7684\u7F13\u5B58\u8BA1\u6570\u3002");
      const last = active.lastTokenUsage;
      return {
        text: active.text,
        usage: [{ input_token_count: last.inputTokens, cached_token_count: last.cachedInputTokens, output_token_count: last.outputTokens }],
        branchId,
        toolCalls: active.toolCalls,
        lastTokenUsage: active.lastTokenUsage,
        timings: { totalMs: Date.now() - startedAt, turnStartMs: active.turnStartedAt - startedAt, firstTextMs: active.firstTextAt ? active.firstTextAt - startedAt : null }
      };
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      if (interrupt) await interrupt;
      this.active = null;
    }
  }
  close() {
    if (this.closing) return this.closing;
    this.closing = (async () => {
      if (this.child.pid && this.child.exitCode === null) {
        try {
          await promisify(execFile)("taskkill.exe", ["/PID", String(this.child.pid), "/T", "/F"], { windowsHide: true });
        } catch (error) {
          if (this.child.exitCode === null) throw error;
        }
      }
      await this.exited;
      this.child.stdout.destroy();
      this.child.stderr.destroy();
      this.child.stdin.destroy();
    })();
    return this.closing;
  }
};

// src/explain.mjs
import { randomUUID } from "node:crypto";

// src/history.mjs
import { readFile, readdir } from "node:fs/promises";
import path2 from "node:path";
async function readRolloutHistory(sourceHome2, source) {
  async function readSegment(file, end) {
    relativeRolloutPath(sourceHome2, file);
    const bytes = await readFile(file);
    const text = bytes.subarray(0, end ?? bytes.lastIndexOf(10) + 1).toString("utf8");
    const headerEnd = text.indexOf("\n");
    const metadata = JSON.parse(text.slice(0, headerEnd)).payload;
    const base = metadata.history_base;
    if (!base) return text;
    let parent;
    for (const folder of ["sessions", "archived_sessions"]) {
      let entries;
      try {
        entries = await readdir(path2.join(sourceHome2, folder), { recursive: true, withFileTypes: true });
      } catch (error) {
        if (error.code === "ENOENT") continue;
        throw error;
      }
      const entry = entries.find((item) => item.isFile() && (item.name.endsWith("-" + base.thread_id + ".jsonl") || item.name.endsWith("_" + base.thread_id + ".jsonl")));
      if (entry) {
        parent = path2.join(entry.parentPath, entry.name);
        break;
      }
    }
    if (!parent) throw new Error("\u6CA1\u6709\u627E\u5230\u8FD9\u6BB5\u804A\u5929\u5F15\u7528\u7684\u524D\u4E00\u4EFD\u8BB0\u5F55\u3002");
    const inherited = await readSegment(parent, base.end_byte_offset);
    return text.slice(0, headerEnd + 1) + inherited.slice(inherited.indexOf("\n") + 1) + text.slice(headerEnd + 1);
  }
  return await readSegment(source);
}

// src/explain.mjs
import { copyFile, mkdir as mkdir2, readFile as readFile3, rm as rm2, writeFile as writeFile2 } from "node:fs/promises";
import { setTimeout as delay2 } from "node:timers/promises";
import path4 from "node:path";

// src/state.mjs
import { readFile as readFile2, writeFile, rename, mkdir, readdir as readdir2, rm, stat } from "node:fs/promises";
import path3 from "node:path";
import { setTimeout as delay } from "node:timers/promises";
function threadDirectory(dataRoot2, threadId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(threadId)) throw new Error("\u5F53\u524D\u804A\u5929\u6807\u8BC6\u65E0\u6548\u3002");
  return path3.join(dataRoot2, "threads", threadId);
}
async function readJson(file) {
  try {
    return JSON.parse(await readFile2(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
async function writeJson(file, value) {
  await mkdir(path3.dirname(file), { recursive: true });
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
function explanationFiles(dataRoot2, selection, turnId) {
  threadDirectory(dataRoot2, selection.openId);
  if (turnId !== void 0 && !/^[a-zA-Z0-9_-]{1,100}$/.test(turnId)) throw new Error("\u56DE\u590D\u6807\u8BC6\u65E0\u6548\u3002");
  const directory = path3.join(path3.resolve(dataRoot2), "floating");
  return {
    directory,
    latest: path3.join(directory, "latest-" + selection.openId + ".json"),
    result: turnId === void 0 ? null : path3.join(directory, "result-" + selection.openId + "-" + turnId + ".json")
  };
}
async function isWindowOpen(dataRoot2) {
  const directory = path3.join(dataRoot2, "floating");
  const file = path3.join(directory, "window.json");
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
  return await readJson(path3.join(dataRoot2, "floating", "selection.json"));
}
async function discardSelection(dataRoot2, selection) {
  if (!selection) return;
  const { directory, latest } = explanationFiles(dataRoot2, selection);
  const files2 = await readdir2(directory);
  for (const file of files2) {
    if (file === path3.basename(latest) || file.startsWith("result-" + selection.openId + "-") || file === "questions-" + selection.openId + ".json" || file === "questions-" + selection.openId + "-control.json") await rm(path3.join(directory, file), { force: true });
  }
}
async function retainedSelections(dataRoot2) {
  return (await readJson(path3.join(dataRoot2, "floating", "chats.json")))?.selections || [];
}
async function isRetainedSelection(dataRoot2, selection) {
  return await isWindowOpen(dataRoot2) && (await retainedSelections(dataRoot2)).some((item) => item.openId === selection.openId);
}
async function readExplanation(dataRoot2, threadId) {
  threadDirectory(dataRoot2, threadId);
  const selection = (await retainedSelections(dataRoot2)).find((item) => item.threadId === threadId);
  if (!selection) return { threadId, status: "idle" };
  const latest = await readJson(explanationFiles(dataRoot2, selection).latest);
  if (!latest) return { threadId, status: selection.initialStatus || "idle" };
  const state = await readJson(explanationFiles(dataRoot2, selection, latest.turnId).result) || { threadId, status: "idle" };
  if (state.workerPid && ["queued", "generating"].includes(state.status) && !isProcessRunning(state.workerPid)) {
    return { ...state, status: "error", error: "\u89E3\u91CA\u540E\u53F0\u5DF2\u9000\u51FA\u3002\u70B9\u51FB\u201C\u89E3\u91CA\u5F53\u524D\u5BF9\u8BDD\u201D\u53EF\u91CD\u65B0\u751F\u6210\u3002" };
  }
  return state;
}
function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
}

// src/explain.mjs
async function copyRuntimeInputs(sourceHome2, home2) {
  for (const name of ["config.toml", "AGENTS.md", "models_cache.json", "installation_id"]) {
    try {
      await copyFile(path4.join(sourceHome2, name), path4.join(home2, name));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  await copyFile(path4.join(sourceHome2, "auth.json"), path4.join(home2, "auth.json"));
}
async function explainStop(event, { dataRoot: dataRoot2, sourceHome: sourceHome2, backend: backend2, selection: requestedSelection }) {
  threadDirectory(dataRoot2, event.session_id);
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(event.turn_id)) throw new Error("\u56DE\u590D\u6807\u8BC6\u65E0\u6548\u3002");
  if (!event.last_assistant_message?.trim() || !event.transcript_path) return;
  const selection = requestedSelection || await activeSelection(dataRoot2);
  if (selection?.threadId !== event.session_id) return;
  const previous = await readExplanation(dataRoot2, event.session_id);
  if (previous.turnId === event.turn_id && previous.status !== "queued") return;
  const files2 = explanationFiles(dataRoot2, selection, event.turn_id);
  const runs = path4.join(path4.resolve(dataRoot2), "runs");
  const run = path4.join(runs, selection.openId + "-" + event.turn_id);
  await mkdir2(runs, { recursive: true });
  try {
    await mkdir2(run);
  } catch (error) {
    if (error.code === "EEXIST") return;
    throw error;
  }
  const state = { threadId: event.session_id, turnId: event.turn_id, status: "generating", workerPid: process.pid, startedAt: (/* @__PURE__ */ new Date()).toISOString() };
  const cancel = new AbortController();
  let finished2 = false, monitor2, monitorError, finalState, saved, partial = "", displayed = "";
  try {
    await writeJson(files2.result, state);
    await writeJson(files2.latest, { turnId: event.turn_id });
    if (previous.turnId && previous.turnId !== event.turn_id) await rm2(explanationFiles(dataRoot2, selection, previous.turnId).result, { force: true });
    const { saved: snapshot, snapshotId, context, metadata } = await saveSnapshot(event, sourceHome2, backend2);
    saved = snapshot;
    await copyRuntimeInputs(sourceHome2, backend2.home);
    monitor2 = (async () => {
      while (!finished2) {
        await delay2(250);
        if (finished2) return;
        if (!await isRetainedSelection(dataRoot2, selection) || (await readJson(files2.latest))?.turnId !== event.turn_id) {
          cancel.abort(new Error("\u5DF2\u5207\u6362\u6216\u5173\u95ED\u89E3\u91CA\u3002"));
          return;
        }
        if (partial !== displayed) {
          displayed = partial;
          await writeJson(files2.result, { ...state, text: displayed });
        }
      }
    })().catch((error) => {
      monitorError = error;
      cancel.abort(error);
    });
    const result = await backend2.generate({
      threadId: snapshotId,
      path: saved,
      context,
      metadata,
      prompt: explanationPrompt,
      signal: cancel.signal,
      onText: (text) => {
        partial = text;
      }
    });
    finalState = {
      ...state,
      status: "ready",
      text: result.text,
      completedAt: (/* @__PURE__ */ new Date()).toISOString(),
      usage: result.usage,
      backendPid: backend2.child.pid,
      branchId: result.branchId,
      timings: result.timings
    };
  } catch (error) {
    if (monitorError || !cancel.signal.aborted) finalState = { ...state, status: "error", text: partial, error: (monitorError || error).message, completedAt: (/* @__PURE__ */ new Date()).toISOString() };
  } finally {
    finished2 = true;
    if (monitor2) await monitor2;
    if (monitorError) finalState = { ...state, status: "error", text: partial, error: monitorError.message, completedAt: (/* @__PURE__ */ new Date()).toISOString() };
    if (path4.dirname(run) !== runs) throw new Error("\u4E34\u65F6\u76EE\u5F55\u8D85\u51FA\u8FD0\u884C\u6587\u4EF6\u5939\u3002");
    if (saved) await rm2(saved, { force: true });
    await rm2(run, { recursive: true, force: true });
    await rm2(path4.join(backend2.home, "auth.json"), { force: true });
    const current = await isRetainedSelection(dataRoot2, selection);
    const latest = current ? await readJson(files2.latest) : null;
    if (!current) await discardSelection(dataRoot2, selection);
    else if (latest?.turnId !== event.turn_id) await rm2(files2.result, { force: true });
    else if (finalState) await writeJson(files2.result, finalState);
    else await rm2(files2.result, { force: true });
  }
}
async function saveSnapshot(event, sourceHome2, backend2) {
  const source = path4.resolve(event.transcript_path);
  relativeRolloutPath(sourceHome2, source);
  const { text, context } = snapshotThroughTurn(await readRolloutHistory(sourceHome2, source), event.turn_id);
  const metadata = JSON.parse(text.split("\n")[0]).payload;
  if (metadata.id !== event.session_id) throw new Error("\u804A\u5929\u8BB0\u5F55\u4E0E\u5F53\u524D\u804A\u5929\u4E0D\u4E00\u81F4\u3002");
  const snapshotId = randomUUID();
  const records = text.trimEnd().split("\n").map(JSON.parse);
  records[0].payload = { ...metadata, id: snapshotId, session_id: metadata.session_id ?? metadata.id, history_mode: "legacy" };
  delete records[0].payload.history_base;
  for (const record of records) delete record.ordinal;
  const saved = path4.join(backend2.home, "sessions", "rollout-" + snapshotId + ".jsonl");
  await mkdir2(path4.dirname(saved), { recursive: true });
  await writeFile2(saved, records.map(JSON.stringify).join("\n") + "\n", "utf8");
  return { saved, snapshotId, context, metadata };
}

// src/worker-client.mjs
import path5 from "node:path";
function workerFiles(dataRoot2) {
  const directory = path5.join(path5.resolve(dataRoot2), "backend");
  return { directory, state: path5.join(directory, "state.json"), pending: path5.join(directory, "request.json") };
}

// src/questions.mjs
import { rm as rm3 } from "node:fs/promises";
import path7 from "node:path";
import { setTimeout as delay3 } from "node:timers/promises";

// src/latest.mjs
import { DatabaseSync } from "node:sqlite";
import path6 from "node:path";
async function latestReplyEvent(sourceHome2, threadId) {
  threadDirectory(sourceHome2, threadId);
  const database = new DatabaseSync(path6.join(sourceHome2, "state_5.sqlite"), { readOnly: true });
  let transcript;
  try {
    const thread = database.prepare("SELECT rollout_path FROM threads WHERE id = ?").get(threadId);
    if (!thread) return null;
    transcript = thread.rollout_path;
  } finally {
    database.close();
  }
  relativeRolloutPath(sourceHome2, transcript);
  const text = await readRolloutHistory(sourceHome2, transcript);
  const rows = text.slice(0, text.lastIndexOf("\n") + 1).split("\n").filter(Boolean).map((line) => JSON.parse(line));
  if (rows[0].payload.id !== threadId) throw new Error("\u804A\u5929\u8BB0\u5F55\u4E0E\u5F53\u524D\u804A\u5929\u4E0D\u4E00\u81F4\u3002");
  const completed = rows.findLast((item) => item.type === "event_msg" && item.payload.type === "task_complete");
  if (!completed) return null;
  const turnId = completed.payload.turn_id;
  const snapshot = snapshotThroughTurn(text, turnId);
  const savedRows = snapshot.text.trimEnd().split("\n").map((line) => JSON.parse(line));
  const message = savedRows.findLast((item) => item.type === "response_item" && item.payload.type === "message" && item.payload.role === "assistant");
  const answer = completed.payload.last_agent_message || completed.payload.last_assistant_message || message?.payload.content.map((item) => item.text || "").join("\n");
  if (!answer?.trim()) return null;
  return {
    hook_event_name: "Stop",
    session_id: threadId,
    turn_id: turnId,
    transcript_path: transcript,
    cwd: snapshot.context.cwd,
    model: snapshot.context.model,
    last_assistant_message: answer
  };
}

// src/questions.mjs
function questionFiles(dataRoot2, selection) {
  threadDirectory(dataRoot2, selection.openId);
  const prefix = path7.join(dataRoot2, "floating", "questions-" + selection.openId);
  return { control: prefix + "-control.json", result: prefix + ".json" };
}
var QuestionsSession = class {
  constructor({ dataRoot: dataRoot2, sourceHome: sourceHome2, backend: backend2 }) {
    this.dataRoot = dataRoot2;
    this.sourceHome = sourceHome2;
    this.backend = backend2;
    this.messages = [];
  }
  async releaseBranch() {
    if (this.branch) await this.backend.discard(this.branch);
    this.branch = null;
  }
  async discard() {
    await this.releaseBranch();
    this.messages = [];
    this.requestId = null;
  }
  async sync(selection) {
    const control = selection ? await readJson(questionFiles(this.dataRoot, selection).control) : null;
    if (this.selection?.openId !== selection?.openId || this.revision !== control?.revision) {
      await this.discard();
      this.selection = selection;
      this.revision = control?.revision;
      if (control) {
        const files2 = questionFiles(this.dataRoot, selection);
        await writeJson(files2.result, { revision: control.revision, status: "idle", messages: [] });
        if (!await isRetainedSelection(this.dataRoot, selection)) {
          await rm3(files2.result, { force: true });
          await rm3(files2.control, { force: true });
        }
      }
    }
    return control;
  }
  async process(selection) {
    const control = await this.sync(selection);
    if (!control?.requestId || this.requestId === control.requestId) return false;
    this.requestId = control.requestId;
    const files2 = questionFiles(this.dataRoot, selection);
    const state = { revision: control.revision, requestId: control.requestId, status: "generating", phase: "preparing", startedAt: control.submittedAt, workerPid: process.pid };
    const history = [...this.messages];
    const question = { role: "user", text: control.text };
    this.messages.push(question);
    const cancel = new AbortController();
    let finished2 = false, userStopped = false, partial = "", saved, monitorError, finalState, displayed = "";
    const thinking = [];
    const endThinking = () => {
      const stage = thinking.at(-1);
      if (stage && stage.elapsedMs === void 0) stage.elapsedMs = Date.now() - Date.parse(stage.startedAt);
    };
    const phase = (value) => {
      state.phase = value;
      if (value === "thinking") {
        if (!thinking.length || thinking.at(-1).elapsedMs !== void 0) thinking.push({ offset: partial.length, startedAt: (/* @__PURE__ */ new Date()).toISOString() });
      } else endThinking();
    };
    const checkStop = async () => {
      if ((await readJson(files2.control))?.stopRequested) {
        userStopped = true;
        cancel.abort(new Error("\u5DF2\u505C\u6B62\u751F\u6210\u3002"));
      }
    };
    const current = async () => await isRetainedSelection(this.dataRoot, selection) && (await readJson(files2.control))?.revision === control.revision;
    const publish = async (extra) => {
      if (await current()) await writeJson(files2.result, { ...state, messages: this.messages, thinking, ...extra });
    };
    const monitor2 = (async () => {
      while (!finished2) {
        await delay3(100);
        if (finished2) return;
        if (!await current()) {
          cancel.abort(new Error("\u5DF2\u91CD\u65B0\u5F00\u59CB\u6216\u5173\u95ED\u63D0\u95EE\u3002"));
          return;
        }
        await checkStop();
        if (cancel.signal.aborted) return;
        const content = JSON.stringify({ partial, thinking, phase: state.phase });
        if (content !== displayed) {
          displayed = content;
          await publish({ partial });
        }
      }
    })().catch((error) => {
      monitorError = error;
      cancel.abort(error);
    });
    try {
      await publish({});
      await checkStop();
      cancel.signal.throwIfAborted();
      const event = await latestReplyEvent(this.sourceHome, selection.threadId);
      if (!event) throw new Error("\u6682\u65F6\u6CA1\u6709\u627E\u5230\u8FD9\u6BB5\u804A\u5929\u5DF2\u4FDD\u5B58\u7684\u5B8C\u6574\u56DE\u590D\u3002");
      const newBranch = !this.branch || this.sourceTurnId !== event.turn_id;
      if (newBranch) {
        const snapshot = await saveSnapshot(event, this.sourceHome, this.backend);
        saved = snapshot.saved;
        await copyRuntimeInputs(this.sourceHome, this.backend.home);
        cancel.signal.throwIfAborted();
        if (this.branch) await this.backend.discard(this.branch);
        this.branch = null;
        this.branch = await this.backend.fork({ threadId: snapshot.snapshotId, path: saved, context: snapshot.context, metadata: snapshot.metadata, questions: true });
        this.sourceTurnId = event.turn_id;
      }
      question.sourceTurnId = this.sourceTurnId;
      const prompt = newBranch ? questionWithHistory(control.text, history) : control.text;
      await checkStop();
      cancel.signal.throwIfAborted();
      phase("thinking");
      await publish({});
      const result = await this.backend.answer({ branch: this.branch, prompt, signal: cancel.signal, onPhase: phase, onText: (text) => {
        partial = text;
      } });
      endThinking();
      this.messages.push({ role: "assistant", text: result.text, thinking, sourceTurnId: this.sourceTurnId, elapsedMs: Date.now() - Date.parse(state.startedAt) });
      finalState = { status: "ready", messages: [...this.messages], branchId: this.branch.id, sourceTurnId: this.sourceTurnId, usage: result.usage, timings: result.timings };
    } catch (error) {
      endThinking();
      if (userStopped && !monitorError) {
        this.messages.push({ role: "assistant", text: partial, thinking, stopped: true, sourceTurnId: this.sourceTurnId, elapsedMs: Date.now() - Date.parse(state.startedAt) });
        finalState = { status: "stopped", messages: [...this.messages], sourceTurnId: this.sourceTurnId };
        await this.releaseBranch();
      } else {
        if (!cancel.signal.aborted || monitorError) finalState = { status: "error", messages: [...this.messages], partial, error: (monitorError || error).message };
        await this.discard();
      }
      this.requestId = control.requestId;
    } finally {
      finished2 = true;
      await monitor2;
      if (saved) await rm3(saved, { force: true });
      await rm3(path7.join(this.backend.home, "auth.json"), { force: true });
      if (monitorError) finalState = { status: "error", messages: [...this.messages], partial, error: monitorError.message };
      if (finalState) await publish({ ...finalState, thinking: [], completedAt: (/* @__PURE__ */ new Date()).toISOString(), elapsedMs: Date.now() - Date.parse(state.startedAt) });
      if (!await current()) {
        await this.discard();
        if (!await isRetainedSelection(this.dataRoot, selection)) {
          await rm3(files2.result, { force: true });
          await rm3(files2.control, { force: true });
        }
      }
    }
    return true;
  }
};

// src/worker.mjs
var [dataRoot, sourceHome, cliPath] = process.argv.slice(2);
var files = workerFiles(dataRoot);
process.on("exit", (code) => writeFileSync(path8.join(dataRoot, "worker-exit.json"), JSON.stringify({ pid: process.pid, code, at: (/* @__PURE__ */ new Date()).toISOString() }) + "\n"));
var home = path8.join(files.directory, "home");
var cache = path8.join(home, "plugins/cache");
var questionDirectory = path8.join(files.directory, "questions");
var questionHome = path8.join(questionDirectory, "home");
var questionCache = path8.join(questionHome, "plugins/cache");
var processing = path8.join(files.directory, "processing.json");
var backend;
var questionBackend;
var monitor;
var finished = false;
var questionSessions = /* @__PURE__ */ new Map();
var closeBackends = () => Promise.all([backend?.close(), questionBackend?.close()]);
async function detachCache(link) {
  try {
    await unlink(link);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
async function clearQuestions() {
  for (const file of await readdir3(path8.join(dataRoot, "floating"))) {
    if (file.startsWith("questions-") && file.endsWith(".json")) await rm4(path8.join(dataRoot, "floating", file), { force: true });
  }
}
try {
  await detachCache(cache);
  await detachCache(questionCache);
  await rm4(files.directory, { recursive: true, force: true });
  await rm4(path8.join(dataRoot, "runs"), { recursive: true, force: true });
  await clearQuestions();
  await writeJson(files.state, { pid: process.pid, status: "starting" });
  for (const [privateHome, directory, link] of [[home, files.directory, cache], [questionHome, questionDirectory, questionCache]]) {
    await mkdir3(path8.join(privateHome, "plugins"), { recursive: true });
    await mkdir3(path8.join(directory, "tmp"), { recursive: true });
    await copyRuntimeInputs(sourceHome, privateHome);
    await symlink(path8.join(sourceHome, "plugins/cache"), link, "junction");
  }
  backend = new AppServerBackend({ cliPath, home, directory: files.directory, cwd: sourceHome });
  questionBackend = new AppServerBackend({ cliPath, home: questionHome, directory: questionDirectory, cwd: sourceHome });
  await Promise.all([backend.start(), questionBackend.start()]);
  await Promise.all([home, questionHome].map((privateHome) => rm4(path8.join(privateHome, "auth.json"), { force: true })));
  await writeJson(files.state, { pid: process.pid, backendPid: backend.child.pid, questionBackendPid: questionBackend.child.pid, status: "ready" });
  monitor = (async () => {
    while (!finished) {
      await delay4(250);
      if (!finished && !await isWindowOpen(dataRoot)) {
        await closeBackends();
        return;
      }
    }
  })();
  const running = async () => !finished && await isWindowOpen(dataRoot) && backend.child.exitCode === null && questionBackend.child.exitCode === null;
  await Promise.all([
    (async () => {
      while (await running()) {
        try {
          await rename2(files.pending, processing);
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
          await delay4(50);
          continue;
        }
        const request = await readJson(processing);
        const selection = (await retainedSelections(dataRoot)).find((item) => item.openId === request.openId);
        if (selection) await explainStop(request.event, { dataRoot, sourceHome, backend, selection });
        await rm4(processing, { force: true });
      }
    })(),
    (async () => {
      while (await running()) {
        const active = await activeSelection(dataRoot);
        const selections = await retainedSelections(dataRoot);
        if (active) selections.sort((a, b) => Number(b.openId === active.openId) - Number(a.openId === active.openId));
        for (const selection of selections) {
          if (!await running()) break;
          if (!questionSessions.has(selection.openId)) questionSessions.set(selection.openId, new QuestionsSession({ dataRoot, sourceHome, backend: questionBackend }));
          await questionSessions.get(selection.openId).process(selection);
        }
        await delay4(50);
      }
    })()
  ]);
} finally {
  finished = true;
  await closeBackends();
  for (const questions of questionSessions.values()) await questions.discard();
  await clearQuestions();
  if (monitor) await monitor;
  await detachCache(cache);
  await detachCache(questionCache);
  await rm4(files.directory, { recursive: true, force: true });
}
