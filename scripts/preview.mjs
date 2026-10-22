// Runs only the local fake model. It does not open or change the desktop app.
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { selectChat, isWindowOpen } from "../src/state.mjs";
import { enqueueStop, liveWorker } from "../src/worker-client.mjs";

const root = path.resolve(".");
await mkdir(path.join(root, ".local"), { recursive: true });
const directory = await mkdtemp(path.join(root, ".local/questions-preview-"));
const sourceHome = path.join(directory, "source"), dataRoot = path.join(directory, "data");
await mkdir(path.join(sourceHome, "sessions"), { recursive: true });
await mkdir(path.join(sourceHome, "plugins/cache"), { recursive: true });
await mkdir(path.join(directory, "tmp"));
const env = { ...process.env, TMP: path.join(directory, "tmp"), TEMP: path.join(directory, "tmp"),
  FAKE_RECORD: path.join(directory, "requests.jsonl"),
  FAKE_ANSWER: "这是一条本地模拟回答，用于检查窗口显示。\n\n- **解释**会自动更新。\n- **提问**可以继续追问，切页保留输入。\n\n公式示例：$E=mc^2$。\n\n点击“重新开始”清空这个临时讨论。" };
await writeFile(path.join(sourceHome, "auth.json"), "FAKE_AUTH");
await writeFile(path.join(sourceHome, "config.toml"), "# Local fake preview only\n");
const threadId = "00000000-0000-4000-8000-000000000001";
const transcript = path.join(sourceHome, "sessions", "rollout-" + threadId + ".jsonl");
const rows = [
  { type: "session_meta", payload: { id: threadId, model_provider: "openai" } },
  { type: "turn_context", payload: { turn_id: "preview", cwd: directory, model: "fake-model", effort: "high" } },
  { type: "response_item", payload: { type: "message", role: "assistant", content: [{ text: "虚构预览回复" }] } },
  { type: "event_msg", payload: { type: "task_complete", turn_id: "preview", last_agent_message: "虚构预览回复" } }
];
await writeFile(transcript, rows.map(JSON.stringify).join("\n") + "\n");
const database = new DatabaseSync(path.join(sourceHome, "state_5.sqlite"));
database.exec("CREATE TABLE threads (id TEXT PRIMARY KEY, name TEXT, title TEXT, rollout_path TEXT NOT NULL)");
database.prepare("INSERT INTO threads VALUES (?, ?, ?, ?)").run(threadId, "本地预览 · 模拟问答", "preview", transcript);
database.close();
const framework = path.join(process.env.WINDIR, "Microsoft.NET/Framework64/v4.0.30319");
const cli = path.join(directory, "fake-app-server.exe");
execFileSync(path.join(framework, "csc.exe"), ["/nologo", "/target:exe", "/codepage:65001", "/out:" + cli,
  "/reference:" + path.join(framework, "System.Web.Extensions.dll"), path.join(root, "test/fake-app-server.cs")], { env, windowsHide: true });
await selectChat(dataRoot, threadId, "本地预览 · 模拟问答");
const window = spawn(path.join(root, "dist/floating.exe"), [dataRoot, sourceHome, process.execPath], { env, cwd: root, stdio: "inherit" });
const windowExited = new Promise(resolve => window.once("exit", resolve));
while (!await isWindowOpen(dataRoot)) {
  if (window.exitCode !== null) throw new Error("Preview window exited: " + window.exitCode);
  await delay(50);
}
const worker = spawn(process.execPath, ["dist/worker.mjs", dataRoot, sourceHome, cli], { env, cwd: root, windowsHide: true, stdio: "inherit" });
const workerExited = new Promise(resolve => worker.once("exit", resolve));
while ((await liveWorker(dataRoot))?.status !== "ready") {
  if (worker.exitCode !== null) throw new Error("Preview worker exited: " + worker.exitCode);
  await delay(50);
}
await enqueueStop({ session_id: threadId, turn_id: "preview", transcript_path: transcript, last_assistant_message: "虚构预览回复" }, { dataRoot });
console.log(JSON.stringify({ directory, dataRoot, sourceHome, windowPid: window.pid, workerPid: worker.pid }));
await windowExited;
await workerExited;
