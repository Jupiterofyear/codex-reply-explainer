import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import assert from "node:assert/strict";
import { loadSettings } from "../src/settings.mjs";
import { selectChat, writeJson, readExplanation } from "../src/state.mjs";

const root = process.cwd(), cli = process.argv[2];
if (!cli) throw new Error("Pass the absolute path to codex.exe.");
const base = await fs.mkdtemp(path.join(root, ".local/install-test-"));
const repo = path.join(base, "marketplace"), tmp = path.join(base, "tmp");
await fs.mkdir(tmp, { recursive: true });
const environment = { ...process.env, TEMP: tmp, TMP: tmp, PATH: path.dirname(process.execPath) + path.delimiter + process.env.PATH,
  GIT_AUTHOR_NAME: "Example", GIT_AUTHOR_EMAIL: "example@example.invalid", GIT_COMMITTER_NAME: "Example", GIT_COMMITTER_EMAIL: "example@example.invalid" };
delete environment.CODEX_CLI_PATH; delete environment.REPLY_EXPLAINER_DATA_DIR; delete environment.REPLY_EXPLAINER_SOURCE_HOME;
async function run(exe, args, home, cwd = base, input) {
  return await new Promise((resolve, reject) => {
    const child = spawn(exe, args, { cwd, env: { ...environment, CODEX_HOME: home }, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", chunk => out += chunk); child.stderr.on("data", chunk => err += chunk);
    child.once("error", reject); child.once("exit", code => code === 0 ? resolve(out) : reject(new Error(exe + ": " + out + err)));
    child.stdin.end(input);
  });
}
async function json(file, value) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(value, null, 2)); }
async function until(check) {
  const end = Date.now() + 45000;
  while (Date.now() < end) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error("Installation validation timed out.");
}
const git = args => run("git", args, path.join(base, "git-home"), repo);
await fs.mkdir(repo); await fs.cp(path.join(root, "plugin"), path.join(repo, "plugin"), { recursive: true });
await fs.cp(path.join(root, ".agents"), path.join(repo, ".agents"), { recursive: true });
await git(["init", "-b", "main"]); await git(["add", "."]); await git(["commit", "-m", "Initial fixture"]); await git(["update-server-info"]);
const server = http.createServer(async (req, res) => {
  try {
    const file = path.resolve(repo, ".git", "." + decodeURIComponent(req.url.split("?")[0]));
    if (!file.startsWith(path.join(repo, ".git") + path.sep)) { res.writeHead(403); res.end(); return; }
    const data = await fs.readFile(file); res.writeHead(200); res.end(data);
  } catch (error) { res.writeHead(error.code === "ENOENT" ? 404 : 500); res.end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const source = "http://127.0.0.1:" + server.address().port;
const installDir = path.join(base, "new install 中文");
await fs.mkdir(path.join(installDir, "dist"), { recursive: true });
await fs.copyFile(path.join(root, "dist/open-installed.mjs"), path.join(installDir, "dist/open-installed.mjs"));
await fs.writeFile(path.join(installDir, "install.ps1"), (await fs.readFile(path.join(root, "install.ps1"), "utf8")).replace("https://github.com/Jupiterofyear/codex-reply-explainer.git", source));
const install = (directory, home, data) => run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(directory, "install.ps1"),
  "-CodexHome", home, "-CodexPath", cli, ...data ? ["-DataDirectory", data] : []], home);
const installedRoot = (home, version) => path.join(home, "plugins/cache/reply-explainer-preview/reply-explainer", version);
let backend, worker, stderr = "";
async function startBackend(home) {
  backend = spawn(cli, ["app-server", "--listen", "stdio://", "-c", "features.plugins=true", "-c", "features.hooks=true"],
    { cwd: base, env: { ...environment, CODEX_HOME: home }, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  backend.stderr.on("data", chunk => stderr += chunk);
  const pending = new Map(); let next = 0;
  const lines = createInterface({ input: backend.stdout });
  lines.on("line", line => {
    const msg = JSON.parse(line), entry = pending.get(msg.id);
    if (entry) { pending.delete(msg.id); clearTimeout(entry.timer); msg.error ? entry.reject(new Error(JSON.stringify(msg.error))) : entry.resolve(msg.result); }
  });
  const rpc = (method, params) => new Promise((resolve, reject) => {
    const id = ++next, timer = setTimeout(() => reject(new Error("RPC timed out: " + method)), 15000);
    pending.set(id, { resolve, reject, timer }); backend.stdin.write(JSON.stringify({ id, method, params }) + "\n");
  });
  await rpc("initialize", { clientInfo: { name: "installation-test", version: "1" }, capabilities: { experimentalApi: true } });
  backend.stdin.write(JSON.stringify({ method: "initialized", params: {} }) + "\n");
  return rpc;
}
async function stopBackend() {
  if (backend) { const child = backend; backend = null; await new Promise(resolve => { child.once("exit", resolve); child.kill(); }); }
}
try {
  const cleanHome = path.join(base, "clean home"), cleanData = path.join(base, "clean data");
  await install(installDir, cleanHome, cleanData);
  assert.equal(JSON.parse(await fs.readFile(path.join(cleanHome, "plugins/reply-explainer-settings.json"))).dataDirectory, cleanData);
  console.log("PASS fresh Git installation");

  const old = path.join(root, ".local/releases/codex-reply-explainer-0.5.0-beta.2-plugin-windows-x64");
  const migrationHome = path.join(base, "migration home"), data = path.join(base, "saved data 中文");
  // The prior public package is supplied locally for the migration test.
  await install(old, migrationHome, data);
  const geometry = '{"left":111,"top":222,"width":530,"height":820}';
  await fs.mkdir(data, { recursive: true });
  await fs.writeFile(path.join(data, "window-layout.json"), geometry);
  await install(installDir, migrationHome);
  const saved = await fs.readFile(path.join(migrationHome, "plugins/reply-explainer-settings.json"), "utf8");
  assert.equal(JSON.parse(saved).dataDirectory, data);
  assert.equal(await fs.readFile(path.join(data, "window-layout.json"), "utf8"), geometry);
  await install(installDir, migrationHome);
  console.log("PASS migration and reinstall retain selected data and geometry");

  let rpc = await startBackend(migrationHome);
  const before = (await rpc("hooks/list", { cwds: [base] })).data[0].hooks.find(x => x.pluginId === "reply-explainer@reply-explainer-preview");
  assert.ok(before);
  await stopBackend();
  await fs.appendFile(path.join(migrationHome, "config.toml"), '\n[hooks.state."' + before.key + '"]\ntrusted_hash = "' + before.currentHash + '"\n');
  const manifestPath = path.join(repo, "plugin/.codex-plugin/plugin.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath)); manifest.version = "0.5.0-beta.6";
  await json(manifestPath, manifest); await fs.writeFile(path.join(repo, "plugin/dist/update-marker.txt"), "NEW_FIXTURE");
  await git(["add", "."]); await git(["commit", "-m", "Next fixture version"]); await git(["update-server-info"]);
  rpc = await startBackend(migrationHome);
  const updated = installedRoot(migrationHome, manifest.version);
  await until(async () => {
    try { return await fs.readFile(path.join(updated, "dist/update-marker.txt"), "utf8") === "NEW_FIXTURE"; }
    catch (error) { if (error.code === "ENOENT") return false; throw error; }
  });
  const after = (await rpc("hooks/list", { cwds: [base] })).data[0].hooks.find(x => x.pluginId === before.pluginId);
  assert.equal(after.currentHash, before.currentHash); assert.equal(after.trustStatus, "trusted");
  assert.equal(await fs.readFile(path.join(migrationHome, "plugins/reply-explainer-settings.json"), "utf8"), saved);
  assert.equal(await fs.readFile(path.join(data, "window-layout.json"), "utf8"), geometry);
  await stopBackend();
  console.log("PASS backend startup automatically updates code and retains hook trust/settings");

  const oldEnv = { home: process.env.CODEX_HOME, source: process.env.REPLY_EXPLAINER_SOURCE_HOME, data: process.env.REPLY_EXPLAINER_DATA_DIR, cli: process.env.CODEX_CLI_PATH };
  process.env.CODEX_HOME = migrationHome;
  delete process.env.REPLY_EXPLAINER_SOURCE_HOME; delete process.env.REPLY_EXPLAINER_DATA_DIR; delete process.env.CODEX_CLI_PATH;
  try { assert.equal((await loadSettings(updated)).dataDirectory, data); }
  finally {
    for (const [key, value] of Object.entries({ CODEX_HOME: oldEnv.home, REPLY_EXPLAINER_SOURCE_HOME: oldEnv.source, REPLY_EXPLAINER_DATA_DIR: oldEnv.data, CODEX_CLI_PATH: oldEnv.cli }))
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  const startFile = path.join(updated, "dist/start.mjs");
  const originalStart = await fs.readFile(startFile);
  try {
    await fs.writeFile(startFile, 'console.log("UPDATED_ENTRY");');
    assert.match(await run(process.execPath, [path.join(root, "dist/open-installed.mjs")], migrationHome), /UPDATED_ENTRY/);
  } finally { await fs.writeFile(startFile, originalStart); }
  console.log("PASS shortcut resolves the updated installed version");
  await fs.writeFile(path.join(migrationHome, "auth.json"), "FAKE_AUTH");
  const fakeCli = path.join(base, "fake.exe");
  await run(path.join(process.env.WINDIR, "Microsoft.NET/Framework64/v4.0.30319/csc.exe"), ["/nologo", "/target:exe", "/out:" + fakeCli,
    "/reference:" + path.join(process.env.WINDIR, "Microsoft.NET/Framework64/v4.0.30319/System.Web.Extensions.dll"), path.join(root, "test/fake-app-server.cs")], migrationHome);
  const id = "00000000-0000-4000-8000-000000000001";
  const transcript = path.join(migrationHome, "sessions/rollout-" + id + ".jsonl");
  await fs.mkdir(path.dirname(transcript), { recursive: true });
  await fs.writeFile(transcript, [
    { type: "session_meta", payload: { id, model_provider: "openai", base_instructions: "original context" } },
    { type: "turn_context", payload: { turn_id: "done", model: "source-model", cwd: base, effort: "high" } },
    { type: "response_item", payload: { role: "assistant", content: [{ text: "finished reply" }] } },
    { type: "event_msg", payload: { type: "task_complete", turn_id: "done" } }
  ].map(JSON.stringify).join("\n") + "\n");
  await writeJson(path.join(data, "floating/window.json"), { pid: process.pid }); await selectChat(data, id, "Example");
  worker = spawn(process.execPath, [path.join(updated, "dist/worker.mjs"), data, migrationHome, fakeCli],
    { cwd: base, env: { ...environment, CODEX_HOME: migrationHome }, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  let workerError = ""; worker.stderr.on("data", chunk => workerError += chunk);
  await until(async () => { if (worker.exitCode !== null) throw new Error(workerError); try { return JSON.parse(await fs.readFile(path.join(data, "backend/state.json"))).status === "ready"; } catch (error) { if (error.code === "ENOENT") return false; throw error; } });
  await run(process.execPath, [path.join(updated, "dist/stop.mjs")], migrationHome, base,
    JSON.stringify({ hook_event_name: "Stop", session_id: id, turn_id: "done", transcript_path: transcript, last_assistant_message: "finished reply" }));
  await until(async () => { const value = await readExplanation(data, id); if (value.status === "error") throw new Error(value.error); return value.status === "ready"; });
  const explanation = await readExplanation(data, id); assert.equal(explanation.text, "FAKE_EXPLANATION");
  await fs.rm(path.join(data, "floating/window.json")); await until(() => worker.exitCode !== null);
  assert.equal(worker.exitCode, 0, workerError);
  console.log("PASS installed updated Stop script reaches the worker and produces explanation");
  await json(path.join(base, "result.json"), { freshInstall: true, migration: true, reinstall: true, automaticUpdate: true, settingsPreserved: true, hookTrustPreserved: true, stopGeneration: true });
  console.log("Results: " + base);
} finally {
  if (worker?.exitCode === null) worker.kill();
  await stopBackend(); await new Promise(resolve => server.close(resolve));
}
