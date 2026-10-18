import { spawn, execFile } from "node:child_process";
import { createInterface } from "node:readline";
import { promisify } from "node:util";

export class AppServerBackend {
  constructor({ cliPath, home, directory, cwd }) {
    this.cliPath = cliPath; this.home = home; this.directory = directory; this.cwd = cwd;
    this.pending = new Map(); this.nextId = 0; this.active = null;
  }
  async start() {
    const args = ["app-server", "--listen", "stdio://",
      "-c", "features.hooks=false", "-c", "notify=[]",
      "-c", "features.code_mode_host=true", "-c", "features.prefer_mxc=true",
      "-c", "plugins.codex-app-tools@openai-bundled.mcp_servers.codex_app.enabled=true",
      "-c", "plugins.code-review@openai-bundled.mcp_servers.code-review.enabled=true",
      "-c", "log_dir=" + JSON.stringify(this.directory + "/logs"),
      "-c", "sqlite_home=" + JSON.stringify(this.directory + "/sqlite")];
    const env = { ...process.env, CODEX_HOME: this.home, TEMP: this.directory + "/tmp", TMP: this.directory + "/tmp", RUST_LOG: "error,codex_otel.trace_safe=info" };
    for (const name of ["CODEX_THREAD_ID", "CODEX_SESSION_ID", "CODEX_TOOL_CALL_ID", "TRACEPARENT", "TRACESTATE"]) delete env[name];
    this.child = spawn(this.cliPath, args, { cwd: this.cwd, env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    this.exited = new Promise(resolve => this.child.once("exit", resolve));
    const failed = error => {
      for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(error); }
      this.pending.clear(); this.active?.reject(error);
    };
    this.child.once("error", failed);
    this.child.once("exit", code => failed(new Error("解释后台已退出：" + code + "\n" + (this.stderr || ""))));
    createInterface({ input: this.child.stdout }).on("line", line => {
      const message = JSON.parse(line);
      if (message.method) {
        if (message.id !== undefined) {
          this.write({ id: message.id, error: { code: -32601, message: "Explanation cannot perform interactive actions." } });
        } else {
          this.onNotification(message);
        }
      } else {
        const entry = this.pending.get(message.id);
        if (!entry) return;
        this.pending.delete(message.id); clearTimeout(entry.timer);
        message.error ? entry.reject(new Error(message.error.message)) : entry.resolve(message.result);
      }
    });
    this.stderr = "";
    this.child.stderr.on("data", chunk => { this.stderr = (this.stderr + chunk).slice(-8192); });
    await this.request("initialize", { clientInfo: { name: "codex_exec", title: "Codex Reply Explainer", version: "0.5.0-beta.1" }, capabilities: { experimentalApi: true } });
    this.write({ method: "initialized", params: {} });
    return this;
  }
  write(message) { this.child.stdin.write(JSON.stringify(message) + "\n"); }
  request(method, params) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("后台请求超时：" + method)); }, 30000);
      this.pending.set(id, { resolve, reject, timer });
      this.write({ id, method, params });
    });
  }
  onNotification({ method, params }) {
    const active = this.active;
    if (!active || params?.threadId !== active.threadId) return;
    if (method === "item/agentMessage/delta") {
      active.firstTextAt ??= Date.now();
      active.text += params.delta;
      active.onText?.(active.text);
    }
    if (method === "item/completed" && params.item.type === "agentMessage") active.text = params.item.text;
    if (method === "thread/tokenUsage/updated") { active.lastTokenUsage = params.tokenUsage.last; active.usageTurnId = params.turnId; }
    if (method === "item/started" && ["commandExecution", "fileChange", "mcpToolCall", "webSearch"].includes(params.item.type)) active.toolCalls++;
    if (method === "turn/completed") {
      if (params.turn.status === "completed") active.resolve();
      else active.reject(new Error(params.turn.error?.message || "解释生成结束：" + params.turn.status));
    }
  }
  async generate({ threadId, path, context, metadata, prompt, signal, onText }) {
    if (this.active) throw new Error("解释后台正在处理另一条回复。");
    const startedAt = Date.now();
    const fork = await this.request("thread/fork", { threadId, path, ephemeral: true, excludeTurns: true,
      model: context.model, modelProvider: metadata.model_provider, cwd: context.cwd,
      config: { model_reasoning_effort: context.effort } });
    const forkedAt = Date.now();
    const branchId = fork.thread.id;
    let resolve, reject;
    const completed = new Promise((yes, no) => { resolve = yes; reject = no; });
    const active = { threadId: branchId, text: "", resolve, reject, toolCalls: 0, onText };
    this.active = active;
    const timeout = setTimeout(() => reject(new Error("解释生成超时。")), 240000);
    let turnId, interrupt;
    const abort = () => {
      if (!turnId) return;
      interrupt = this.request("turn/interrupt", { threadId: branchId, turnId }).then(
        () => reject(signal.reason || new Error("已取消解释。")), error => reject(error));
    };
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const starting = this.request("turn/start", { threadId: branchId, turnTrigger: "exec", cwd: context.cwd,
        effort: context.effort, input: [{ type: "text", text: prompt, text_elements: [] }] }).then(turn => {
          turnId = turn.turn.id; active.turnStartedAt = Date.now();
          if (signal?.aborted) abort();
          return turn;
        });
      await Promise.all([starting, completed]);
      if (!active.text.trim()) throw new Error("没有收到解释内容。");
      if (!active.lastTokenUsage || active.usageTurnId !== turnId) throw new Error("后台没有返回本次请求的缓存计数。");
      const last = active.lastTokenUsage;
      return { text: active.text.trim(), usage: [{ input_token_count: last.inputTokens, cached_token_count: last.cachedInputTokens, output_token_count: last.outputTokens }], branchId, toolCalls: active.toolCalls,
        lastTokenUsage: active.lastTokenUsage, timings: { totalMs: Date.now() - startedAt, forkMs: forkedAt - startedAt, turnStartMs: active.turnStartedAt - startedAt, firstTextMs: active.firstTextAt ? active.firstTextAt - startedAt : null },
        fork: { forkedFromId: fork.thread.forkedFromId, path: fork.thread.path, model: fork.model, modelProvider: fork.modelProvider, reasoningEffort: fork.reasoningEffort } };
    } finally {
      clearTimeout(timeout); signal?.removeEventListener("abort", abort);
      if (interrupt) await interrupt;
      try { if (this.child.exitCode === null && !this.closing) await this.request("thread/unsubscribe", { threadId: branchId }); }
      finally { this.active = null; }
    }
  }
  close() {
    if (this.closing) return this.closing;
    this.closing = (async () => {
      if (this.child.pid && this.child.exitCode === null) {
        try { await promisify(execFile)("taskkill.exe", ["/PID", String(this.child.pid), "/T", "/F"], { windowsHide: true }); }
        catch (error) { if (this.child.exitCode === null) throw error; }
      }
      await this.exited;
      this.child.stdout.destroy(); this.child.stderr.destroy(); this.child.stdin.destroy();
    })();
    return this.closing;
  }
}
