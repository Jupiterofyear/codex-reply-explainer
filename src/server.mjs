import { loadSettings } from "./settings.mjs";
import { openFloatingWindow, readThreadName } from "./floating.mjs";
import { spawn } from "node:child_process";
import os from "node:os";
import { latestReplyEvent } from "./latest.mjs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readExplanation, activeSelection } from "./state.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const settings = await loadSettings(root);
const dataRoot = settings.dataDirectory;
const resource = "ui://reply-explainer/panel.html";
const server = new McpServer({ name: "reply-explainer", version: "0.5.0-beta.3" });
server.registerResource("reply-explainer-panel", resource, { mimeType: "text/html;profile=mcp-app" }, async () => ({
  contents: [{
    uri: resource,
    mimeType: "text/html;profile=mcp-app",
    text: await readFile(path.join(root, "dist", "panel.html"), "utf8"),
    _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] } } }
  }]
}));
server.registerTool("reply_explainer.open", {
  title: "Codex 回复解释",
  description: "查看当前聊天最新回复的简短解释。",
  inputSchema: {},
  annotations: { readOnlyHint: true, openWorldHint: false },
  _meta: { ui: { resourceUri: resource, visibility: ["app"] }, "openai/ui": { entrypoints: [] } }
}, async (_input, extra) => {
  const threadId = extra._meta?.threadId;
  if (typeof threadId !== "string") throw new Error("请从当前聊天的面板入口打开 Codex 回复解释。");
  return { content: [], _meta: { replyExplainer: await readExplanation(dataRoot, threadId) } };
});
server.registerTool("reply_explainer.explain_latest", {
  title: "解释最后一条回复",
  description: "打开面板时，为当前聊天最后一条已完成回复生成解释。",
  inputSchema: {},
  annotations: { readOnlyHint: true, openWorldHint: false },
  _meta: { ui: { visibility: ["app"] } }
}, async (_input, extra) => {
  const threadId = extra._meta?.threadId;
  if (typeof threadId !== "string") throw new Error("请从当前聊天打开 Codex 回复解释。");
  return { content: [], _meta: { replyExplainer: await ensureLatest(threadId) } };
});

async function ensureLatest(threadId) {
  const state = await readExplanation(dataRoot, threadId);
  if ((await activeSelection(dataRoot))?.threadId !== threadId) return state;
  if (state.status === "generating") return state;
  const sourceHome = process.env.REPLY_EXPLAINER_SOURCE_HOME || process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  const event = await latestReplyEvent(sourceHome, threadId);
  if (!event) return { threadId, status: "unavailable" };
  if (event.turn_id === state.turnId) return state;
  const child = spawn(process.execPath, [path.join(root, "dist", "stop.mjs")], {
    cwd: root, env: process.env, windowsHide: true, detached: true, stdio: ["pipe", "ignore", "ignore"]
  });
  child.stdin.end(JSON.stringify(event));
  child.unref();
  return { threadId, turnId: event.turn_id, status: "generating", startedAt: new Date().toISOString() };
}

server.registerTool("reply_explainer.open_floating", {
  title: "Codex 回复解释（悬浮窗）",
  description: "为这段聊天打开或切换同一个悬浮小窗。",
  inputSchema: {},
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  _meta: { ui: { resourceUri: resource, visibility: ["app"] }, "openai/ui": { entrypoints: [{ type: "thread" }] } }
}, async (_input, extra) => {
  const threadId = extra._meta?.threadId;
  if (typeof threadId !== "string") throw new Error("请从当前聊天打开 Codex 回复解释。");
  const sourceHome = process.env.REPLY_EXPLAINER_SOURCE_HOME || process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  const title = readThreadName(sourceHome, threadId);
  await openFloatingWindow({ root, dataRoot, sourceHome, threadId, title });
  const state = await ensureLatest(threadId);
  return { content: [], _meta: { replyExplainer: state, floatingWindow: { requested: true, title } } };
});

await server.connect(new StdioServerTransport());
