import test, { after, mock } from "node:test";
import fsPromises from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { latestReplyEvent } from "../src/latest.mjs";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, access, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { snapshotThroughTurn, relativeRolloutPath, requestUsage, explainStop } from "../src/explain.mjs";
import { readExplanation, threadDirectory, writeJson, selectChat, explanationFiles, readJson, isWindowOpen } from "../src/state.mjs";

import { enqueueStop, liveWorker } from "../src/worker-client.mjs";
import { submitQuestion, questionFiles } from "../src/questions.mjs";
const workers=[];
const root = path.resolve(".");
const testRoot = await mkdtemp(path.join(root, ".local/test-"));
const first = "00000000-0000-4000-8000-000000000001";
const second = "00000000-0000-4000-8000-000000000002";

test("relative default data lives under the plugin root", async () => {
  const { loadSettings } = await import("../src/settings.mjs");
  const folder = path.join(testRoot, "settings-root");
  await mkdir(folder);
  await writeFile(path.join(folder, "settings.json"), JSON.stringify({ dataDirectory: ".local/data", cliPath: "codex.exe" }));
  const settings = await loadSettings(folder);
  assert.equal(settings.dataDirectory, path.join(folder, ".local/data"));
  assert.equal(settings.cliPath, process.env.CODEX_CLI_PATH || "codex.exe");
});

test("snapshot preserves earlier context and ends before a later turn", () => {
  const lines = [
    { type: "session_meta", payload: { id: first, base_instructions: "original" } },
    { type: "response_item", payload: { text: "earlier constraint" } },
    { type: "turn_context", payload: { turn_id: "a", model: "gpt-6.1-sol" } },
    { type: "response_item", payload: { text: "completed answer" } },
    { type: "turn_context", payload: { turn_id: "b" } },
    { type: "response_item", payload: { text: "later private message" } }
  ].map(JSON.stringify).join("\n") + "\n{\"incomplete\":";
  const snapshot = snapshotThroughTurn(lines, "a");
  assert.match(snapshot.text, /original/);
  assert.match(snapshot.text, /earlier constraint/);
  assert.match(snapshot.text, /completed answer/);
  assert.doesNotMatch(snapshot.text, /later private message/);
  assert.equal(snapshot.context.model, "gpt-6.1-sol");
  assert.throws(() => snapshotThroughTurn(lines, "missing"), /没有这条回复/);
});

test("request usage excludes zero-output prewarm and inherited aggregate counts", () => {
  const log = 'event.kind=response.completed input_token_count=2 output_token_count=0 cached_token_count=0\n'
    + 'turn.completed input_tokens=999999 cached_input_tokens=999998\n'
    + 'event.kind=response.completed input_token_count=1000 output_token_count=50 cached_token_count=900\n';
  assert.deepEqual(requestUsage(log), [{ input_token_count: 1000, cached_token_count: 900, output_token_count: 50 }]);
});

async function seedWindow(data, id) {
  await writeJson(path.join(data, "floating/window.json"), { pid: process.pid });
  return await selectChat(data, id, "测试聊天");
}
async function seedResult(data, selection, turn, value) {
  const files = explanationFiles(data, selection, turn);
  await writeJson(files.result, { threadId: selection.threadId, turnId: turn, ...value });
  await writeJson(files.latest, { turnId: turn });
}
test("latest pointer prevents an older explanation replacing a newer one", async () => {
  const selection = await seedWindow(testRoot, first);
  await seedResult(testRoot, selection, "new", { status: "generating" });
  await writeJson(explanationFiles(testRoot, selection, "old").result, { status: "ready", text: "OLD" });
  assert.equal((await readExplanation(testRoot, first)).status, "generating");
  assert.deepEqual(await readExplanation(testRoot, second), { threadId: second, status: "idle" });
  assert.throws(() => threadDirectory(testRoot, "../outside"), /无效/);
});

test("MCP panel is app-only, uses host thread metadata, and returns no model content", async () => {
  const selection = await seedWindow(testRoot, first);
  await seedResult(testRoot, selection, "current", { status: "ready", text: "PRIVATE_EXPLANATION" });
  const transport = new StdioClientTransport({
    command: process.execPath, args: ["dist/server.mjs"], cwd: root,
    env: { ...process.env, REPLY_EXPLAINER_DATA_DIR: testRoot, REPLY_EXPLAINER_SOURCE_HOME: testRoot }
  });
  const client = new Client({ name: "plugin-local-test", version: "1" });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.equal(tools.length, 3);
    assert.deepEqual(tools[0]._meta.ui.visibility, ["app"]);
    assert.deepEqual(tools[0]._meta["openai/ui"].entrypoints, []);
    const floating = tools.find(tool => tool.name === "reply_explainer.open_floating");
    assert.deepEqual(floating._meta["openai/ui"].entrypoints, [{ type: "thread" }]);
    assert.deepEqual(floating._meta.ui.visibility, ["app"]);
    assert.equal(floating.annotations.readOnlyHint, false);
    const result = await client.callTool({ name: "reply_explainer.open", arguments: { threadId: second }, _meta: { threadId: first } });
    assert.deepEqual(result.content, []);
    assert.equal(result.structuredContent, undefined);
    assert.equal(result._meta.replyExplainer.text, "PRIVATE_EXPLANATION");
    const other = await client.callTool({ name: "reply_explainer.open", arguments: {}, _meta: { threadId: second } });
    assert.equal(other._meta.replyExplainer.status, "idle");
    const invalidFloating = await client.callTool({ name: "reply_explainer.open_floating", arguments: {} });
    assert.equal(invalidFloating.isError, true);
    const missing = await client.callTool({ name: "reply_explainer.open", arguments: {} });
    assert.equal(missing.isError, true);
    const absent = await client.callTool({ name: "reply_explainer.explain_latest", arguments: {}, _meta: { threadId: second } });
    assert.deepEqual(absent.content, []);
    assert.equal(absent._meta.replyExplainer.status, "idle");
    const resource = await client.readResource({ uri: tools[0]._meta.ui.resourceUri });
    assert.match(resource.contents[0].mimeType, /mcp-app/);
    assert.match(resource.contents[0].text, /Codex 回复解释/);
  } finally {
    await client.close();
  }
});

test("empty Stop event has no output, files, or model generation", async () => {
  const data = path.join(testRoot, "empty-hook");
  const child = spawn(process.execPath, ["dist/stop.mjs"], { cwd: root, env: { ...process.env, REPLY_EXPLAINER_DATA_DIR: data }, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", chunk => stdout += chunk);
  child.stderr.on("data", chunk => stderr += chunk);
  child.stdin.end(JSON.stringify({ hook_event_name: "Stop", session_id: first, turn_id: "empty", last_assistant_message: null }));
  const code = await new Promise(resolve => child.once("exit", resolve));
  assert.equal(code, 0);
  assert.equal(stdout, "");
  assert.equal(stderr, "");
  await assert.rejects(access(data), { code: "ENOENT" });
});

test("configured Windows hook starts through the Windows command shell without producing output", { skip: process.platform !== "win32" }, async () => {
  const hook = JSON.parse(await readFile("hooks/hooks.json", "utf8")).hooks.Stop[0].hooks[0];
  const command = hook.command.replaceAll("${PLUGIN_ROOT}", root);
  const child = spawn("cmd.exe", ["/c", '"' + command + '"'], {
    cwd: root, windowsHide: true, windowsVerbatimArguments: true, stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, REPLY_EXPLAINER_DATA_DIR: path.join(testRoot, "shell-hook") }
  });
  let stdout = "", stderr = "";
  child.stdout.on("data", chunk => stdout += chunk);
  child.stderr.on("data", chunk => stderr += chunk);
  child.stdin.end(JSON.stringify({ hook_event_name: "Stop", session_id: first, turn_id: "empty", last_assistant_message: null }));
  const code = await new Promise(resolve => child.once("exit", resolve));
  assert.equal(code, 0, stderr);
  assert.equal(stdout, "");
  assert.equal(stderr, "");
});

test("built panel script has valid JavaScript after HTML assembly", async () => {
  const html = await readFile("dist/panel.html", "utf8");
  const source = html.split('<script type="module">')[1].split("</script>")[0];
  const child = spawn(process.execPath, ["--check", "--input-type=module"], { stdio: ["pipe", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", chunk => stderr += chunk);
  child.stdin.end(source);
  const code = await new Promise(resolve => child.once("exit", resolve));
  assert.equal(code, 0, stderr);
});

test("Windows namespaced rollout paths stay inside the same Codex home", { skip: process.platform !== "win32" }, () => {
  const home = "D:/test/codex-home";
  const source = path.toNamespacedPath(path.join(home, "sessions/2026/10/17/rollout.jsonl"));
  assert.equal(relativeRolloutPath(home, source), path.join("sessions/2026/10/17/rollout.jsonl"));
  assert.throws(() => relativeRolloutPath(home, "C:/outside/rollout.jsonl"), /不在/);
});

test("resumed history keeps the referenced prefix and excludes the abandoned old suffix", async () => {
  const { readRolloutHistory } = await import("../src/history.mjs");
  const home = path.join(testRoot, "segmented-history");
  const directory = path.join(home, "sessions/2026/10/21");
  await mkdir(directory, { recursive: true });
  const parent = path.join(directory, "rollout-old-" + first + ".jsonl");
  const current = path.join(directory, "rollout-current-" + first + "_" + second + ".jsonl");
  const prefix = [
    { ordinal: 0, type: "session_meta", payload: { id: first, history_mode: "paginated" } },
    { ordinal: 1, type: "response_item", payload: { type: "message", role: "user", content: [{ text: "之前的中文偏好" }] } }
  ].map(JSON.stringify).join("\n") + "\n";
  const abandoned = JSON.stringify({ ordinal: 2, type: "response_item", payload: { text: "ABANDONED_REPLY" } }) + "\n";
  await writeFile(parent, prefix + abandoned);
  const suffix = [
    { ordinal: 2, type: "session_meta", payload: { id: first, history_mode: "paginated", history_base: { thread_id: first, end_ordinal_exclusive: 2, end_byte_offset: Buffer.byteLength(prefix) } } },
    { ordinal: 3, type: "turn_context", payload: { turn_id: "current", model: "source-model" } },
    { ordinal: 4, type: "response_item", payload: { type: "message", role: "assistant", content: [{ text: "CURRENT_RESULTS" }] } },
    { ordinal: 5, type: "event_msg", payload: { type: "task_complete", turn_id: "current" } }
  ].map(JSON.stringify).join("\n") + "\n";
  await writeFile(current, suffix);
  const before = await readFile(parent);
  const merged = await readRolloutHistory(home, current);
  const snapshot = snapshotThroughTurn(merged, "current");
  assert.match(snapshot.text, /之前的中文偏好/);
  assert.match(snapshot.text, /CURRENT_RESULTS/);
  assert.doesNotMatch(snapshot.text, /ABANDONED_REPLY/);
  assert.equal(merged.split("\n").filter(line => line && JSON.parse(line).type === "session_meta").length, 1);
  assert.deepEqual(await readFile(parent), before);
  assert.equal(await readFile(current, "utf8"), suffix);
});

test("latest reply follows the registered rollout when one chat has old and resumed files", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const home = path.join(testRoot, "resumed-home");
  const directory = path.join(home, "sessions/2026/10/21");
  await mkdir(directory, { recursive: true });
  const old = path.join(directory, "rollout-old-" + first + ".jsonl");
  const current = path.join(directory, "rollout-current-" + first + "_" + second + ".jsonl");
  const rows = (turn, answer) => [
    { type: "session_meta", payload: { id: first } },
    { type: "response_item", payload: { type: "message", role: "user", content: [{ text: "Inherited preference" }] } },
    { type: "turn_context", payload: { turn_id: turn, model: "source-model", cwd: "D:/project" } },
    { type: "response_item", payload: { type: "message", role: "assistant", content: [{ text: answer }] } },
    { type: "event_msg", payload: { type: "task_complete", turn_id: turn } }
  ].map(JSON.stringify).join("\n") + "\n";
  await writeFile(old, rows("old", "Old preparation reply"));
  const databaseFile = path.join(home, "state_5.sqlite");
  const database = new DatabaseSync(databaseFile);
  database.exec("CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT NOT NULL)");
  database.prepare("INSERT INTO threads VALUES (?, ?)").run(first, old);
  database.close();
  assert.equal((await latestReplyEvent(home, first)).turn_id, "old");
  await writeFile(current, rows("current", "Latest results analysis"));
  const updated = new DatabaseSync(databaseFile);
  updated.prepare("UPDATE threads SET rollout_path = ? WHERE id = ?").run(path.toNamespacedPath(current), first);
  updated.close();
  const before = await readFile(databaseFile);
  const event = await latestReplyEvent(home, first);
  assert.equal(event.turn_id, "current");
  assert.equal(event.last_assistant_message, "Latest results analysis");
  const snapshot = snapshotThroughTurn(await readFile(event.transcript_path, "utf8"), event.turn_id);
  assert.match(snapshot.text, /Inherited preference/);
  assert.match(snapshot.text, /Latest results analysis/);
  assert.doesNotMatch(snapshot.text, /Old preparation reply/);
  assert.deepEqual(await readFile(databaseFile), before);
});

test("opening an existing chat selects its latest completed reply and preserves its context", async () => {
  const directory = path.join(testRoot, "sessions/2026/10/17");
  await mkdir(directory, { recursive: true });
  const rows = [
    { type: "session_meta", payload: { id: second } },
    { type: "response_item", payload: { type: "message", role: "user", content: [{ text: "Earlier constraint" }] } },
    { type: "turn_context", payload: { turn_id: "finished", model: "source-model", cwd: "D:/project" } },
    { type: "response_item", payload: { type: "message", role: "assistant", content: [{ text: "Completed reply" }] } },
    { type: "event_msg", payload: { type: "task_complete", turn_id: "finished" } },
    { type: "turn_context", payload: { turn_id: "unfinished" } }
  ];
  const transcript = path.join(directory, "rollout-test-" + second + ".jsonl");
  await writeFile(transcript, rows.map(JSON.stringify).join("\n") + "\n");
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(path.join(testRoot, "state_5.sqlite"));
  database.exec("CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT NOT NULL)");
  database.prepare("INSERT INTO threads VALUES (?, ?)").run(second, transcript);
  database.close();
  const event = await latestReplyEvent(testRoot, second);
  assert.equal(event.turn_id, "finished");
  assert.equal(event.last_assistant_message, "Completed reply");
  assert.equal(event.model, "source-model");
  const saved = snapshotThroughTurn(await readFile(event.transcript_path, "utf8"), event.turn_id);
  assert.match(saved.text, /Earlier constraint/);
  assert.doesNotMatch(saved.text, /unfinished/);
  assert.equal(await latestReplyEvent(testRoot, "00000000-0000-4000-8000-000000000003"), null);
});

test("temporary branches without saved history produce no files or output", async () => {
  const data = path.join(testRoot, "temporary-hook");
  const child = spawn(process.execPath, ["dist/stop.mjs"], { cwd: root, env: { ...process.env, REPLY_EXPLAINER_DATA_DIR: data }, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", chunk => stdout += chunk);
  child.stderr.on("data", chunk => stderr += chunk);
  child.stdin.end(JSON.stringify({ hook_event_name: "Stop", session_id: first, turn_id: "temporary", transcript_path: null, last_assistant_message: "Temporary prediction" }));
  const code = await new Promise(resolve => child.once("exit", resolve));
  assert.equal(code, 0);
  assert.equal(stdout, "");
  assert.equal(stderr, "");
  await assert.rejects(access(data), { code: "ENOENT" });
});


test("floating window title uses the saved chat name without modifying the database", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { readThreadName } = await import("../src/floating.mjs");
  const home = path.join(testRoot, "title-home");
  await mkdir(home);
  const databaseFile = path.join(home, "state_5.sqlite");
  const database = new DatabaseSync(databaseFile);
  database.exec("CREATE TABLE threads (id TEXT PRIMARY KEY, name TEXT, title TEXT)");
  database.prepare("INSERT INTO threads VALUES (?, ?, ?)").run(first, '聊天名称 <不是指令> "中文"', "first user message");
  database.prepare("INSERT INTO threads VALUES (?, ?, ?)").run(second, null, "未重命名的聊天");
  database.close();
  const before = await readFile(databaseFile);
  assert.equal(readThreadName(home, first), '聊天名称 <不是指令> "中文"');
  assert.equal(readThreadName(home, second), "未重命名的聊天");
  assert.deepEqual(await readFile(databaseFile), before);
  assert.throws(() => readThreadName(home, "../other"), /无效/);
  assert.throws(() => readThreadName(home, "00000000-0000-4000-8000-000000000003"), /没有找到/);
});

async function fakeSource(name, id = first) {
  const source = path.join(testRoot, name);
  const transcript = path.join(source, "sessions/2026/10/17/rollout-" + id + ".jsonl");
  await mkdir(path.dirname(transcript), { recursive: true });
  await mkdir(path.join(source, "plugins/cache"), { recursive: true });
  await writeFile(path.join(source, "plugins/cache/sentinel.txt"), "KEEP_INSTALLED_PLUGIN");
  await writeFile(path.join(source, "auth.json"), "FAKE_AUTH");
  await writeFile(path.join(source, "config.toml"), "# original settings");
  const rows = [
    { type: "session_meta", payload: { id, session_id: id, model_provider: "openai", base_instructions: "inherited base" } },
    { type: "response_item", payload: { type: "message", role: "user", content: [{ text: "earlier preference" }] } },
    { type: "turn_context", payload: { turn_id: "done", cwd: source, model: "source-model", effort: "high" } },
    { type: "response_item", payload: { type: "message", role: "assistant", content: [{ text: "finished reply" }] } },
    { type: "event_msg", payload: { type: "task_complete", turn_id: "done" } },
    { type: "turn_context", payload: { turn_id: "later" } },
    { type: "response_item", payload: { text: "do not inherit this unfinished turn" } }
  ];
  await writeFile(transcript, rows.map(JSON.stringify).join("\n") + "\n");
  return { source, transcript, event: { hook_event_name: "Stop", session_id: id, turn_id: "done", transcript_path: transcript, last_assistant_message: "finished reply" } };
}
async function untilFile(file) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try { const text = await readFile(file, "utf8"); if (text.trim()) return text; }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw new Error("Fake generation did not start");
}


const framework=path.join(process.env.WINDIR,"Microsoft.NET/Framework64/v4.0.30319");
const fakeCli=path.join(testRoot,"fake-app-server.exe");
execFileSync(path.join(framework,"csc.exe"),["/nologo","/target:exe","/out:"+fakeCli,"/reference:"+path.join(framework,"System.Web.Extensions.dll"),path.join(root,"test/fake-app-server.cs")],{windowsHide:true,env:{...process.env,TMP:testRoot,TEMP:testRoot}});
async function until(check) {
 const deadline=Date.now()+30000;
 while(Date.now()<deadline){const value=await check();if(value)return value;await new Promise(r=>setTimeout(r,30));}
 throw new Error("Local validation timed out");
}
async function launchWorker(name,flag="",childMarker=false) {
 const fixture=await fakeSource(name);
 if(flag)await writeFile(fixture.transcript,(await readFile(fixture.transcript,"utf8")).replace("finished reply",flag));
 const data=path.join(testRoot,name+"-data"),record=path.join(testRoot,name+"-record.jsonl"),marker=path.join(testRoot,name+"-child.txt");
 await seedWindow(data,first);
 const child=spawn(process.execPath,["dist/worker.mjs",data,fixture.source,fakeCli],{cwd:root,windowsHide:true,stdio:["ignore","ignore","pipe"],env:{...process.env,FAKE_RECORD:record,FAKE_STREAM_GATE:path.join(data,"stream-gate"),...childMarker?{FAKE_CHILD_PID_FILE:marker}:{}}});
 const worker={...fixture,data,record,marker,child,stderr:""};workers.push(worker);child.stderr.on("data",x=>worker.stderr+=x);
 worker.state=await until(async()=>{if(child.exitCode!==null)throw Error("Worker exited "+child.exitCode+": "+worker.stderr);const state=await liveWorker(data);return state?.status==="ready"&&state;});
 return worker;
}
async function ready(worker,turn="done") {
 return await until(async()=>{const state=await readExplanation(worker.data,first);return state.turnId===turn&&["ready","error"].includes(state.status)&&state;});
}
async function records(worker){return(await readFile(worker.record,"utf8")).trim().split("\n").map(JSON.parse);}
async function started(worker){await until(async()=>{try{return(await records(worker)).some(x=>x.method==="turn/start");}catch(e){if(e.code!=="ENOENT")throw e;return false;}});}
async function newer(worker){
 const base=snapshotThroughTurn(await readFile(worker.transcript,"utf8"),"done").text;
 const rows=[{type:"turn_context",payload:{turn_id:"newer",cwd:worker.source,model:"source-model",effort:"high"}},{type:"response_item",payload:{type:"message",role:"assistant",content:[{text:"NEWER_CONDITION"}]}},{type:"event_msg",payload:{type:"task_complete",turn_id:"newer"}}];
 await writeFile(worker.transcript,base+rows.map(JSON.stringify).join("\n")+"\n");
 return {...worker.event,turn_id:"newer",last_assistant_message:"NEWER_CONDITION"};
}
async function stopWorker(worker){
 await rm(path.join(worker.data,"floating/window.json"),{force:true});await rm(path.join(worker.data,"floating/selection.json"),{force:true});
 await until(()=>worker.child.exitCode!==null);
 assert.equal(worker.child.exitCode,0,worker.stderr);
 await assert.rejects(access(path.join(worker.data,"backend")),{code:"ENOENT"});
}

async function registerSource(w) {
 const {DatabaseSync}=await import("node:sqlite");
 const database=new DatabaseSync(path.join(w.source,"state_5.sqlite"));
 database.exec("CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT NOT NULL)");
 database.prepare("INSERT INTO threads VALUES (?, ?)").run(first,w.transcript);
 database.close();
 return await readJson(path.join(w.data,"floating/selection.json"));
}
async function questionReady(w, selection) {
 return await until(async()=>{const control=await readJson(questionFiles(w.data,selection).control),s=await readJson(questionFiles(w.data,selection).result);return s?.requestId===control?.requestId&&["ready","error"].includes(s?.status)&&s;});
}

test("questions reuse one ephemeral branch across turns and new main replies; reset imports latest context",async()=>{
 const w=await launchWorker("question-multiple");const selection=await registerSource(w);
 const original=await readFile(w.transcript),databaseBefore=await readFile(path.join(w.source,"state_5.sqlite"));
 await submitQuestion(w.data,selection.openId,"ask","第一问：结合我的偏好回答");
 const a=await questionReady(w,selection);assert.equal(a.status,"ready",a.error);assert.equal(a.messages.length,2);
 assert.deepEqual(await readFile(w.transcript),original);assert.deepEqual(await readFile(path.join(w.source,"state_5.sqlite")),databaseBefore);
 const same=await selectChat(w.data,first,"同一聊天");assert.equal(same.openId,selection.openId);
 await enqueueStop(await newer(w),{dataRoot:w.data});await ready(w,"newer");
 await submitQuestion(w.data,selection.openId,"ask","第二问：继续刚才的讨论");
 const b=await questionReady(w,selection);assert.equal(b.status,"ready",b.error);assert.equal(b.branchId,a.branchId);assert.equal(b.messages.length,4);assert.equal(b.sourceTurnId,"done");
 const calls=await records(w),fork=calls.find(x=>x.method==="thread/fork");
 assert.equal(fork.input.ephemeral,true);assert.equal(fork.input.sandbox,"read-only");assert.equal(fork.input.config["plugins.codex-app-tools@openai-bundled.enabled"],false);assert.equal(fork.input.config["mcp_servers.example.enabled"],false);
 assert.equal(calls.find(x=>x.method==="config/read").input.cwd,w.source);assert.equal(fork.input.config["mcp_servers.project_only.enabled"],false);
 const turns=calls.filter(x=>x.method==="turn/start"&&x.input.threadId===a.branchId);assert.equal(turns.length,2);assert.equal(turns[1].prompt,"第二问：继续刚才的讨论");
 assert.equal(calls.filter(x=>x.method==="thread/fork").length,2);
 await submitQuestion(w.data,selection.openId,"reset");
 await until(async()=> (await readJson(questionFiles(w.data,selection).result))?.status==="idle");
 await submitQuestion(w.data,selection.openId,"ask","从最新回复重新开始");
 const c=await questionReady(w,selection);assert.equal(c.status,"ready",c.error);assert.notEqual(c.branchId,a.branchId);assert.equal(c.messages.length,2);assert.equal(c.sourceTurnId,"newer");
 assert.ok((await records(w)).some(x=>x.method==="thread/unsubscribe"&&x.input.threadId===a.branchId));
 await assert.rejects(access(path.join(w.data,"backend/home/auth.json")),{code:"ENOENT"});assert.deepEqual(await readdir(path.join(w.data,"backend/home/sessions")),[]);
 await stopWorker(w);assert.equal((await readdir(path.join(w.data,"floating"))).filter(x=>x.startsWith("questions-")).length,0);
});

test("reset interrupts a question, preserves queued explanation and rejects a duplicate send",async()=>{
 const w=await launchWorker("question-reset");const selection=await registerSource(w);
 await submitQuestion(w.data,selection.openId,"ask","WAIT_QUESTION");await started(w);
 await assert.rejects(submitQuestion(w.data,selection.openId,"ask","duplicate"),/等待/);
 await enqueueStop(w.event,{dataRoot:w.data});
 assert.equal((await readExplanation(w.data,first)).status,"queued");
 await submitQuestion(w.data,selection.openId,"reset");
 const explain=await ready(w);assert.equal(explain.status,"ready",explain.error);
 await submitQuestion(w.data,selection.openId,"ask","reset question");const answer=await questionReady(w,selection);assert.equal(answer.status,"ready",answer.error);assert.equal(answer.messages.length,2);
 assert.equal(answer.messages[0].text,"reset question");assert.ok((await records(w)).filter(x=>x.method==="thread/unsubscribe").length>=2);
 await stopWorker(w);
});

test("a question waits for the active explanation and is not lost when a newer reply cancels it",async()=>{
 const w=await launchWorker("question-queued","WAIT_FOR_CANCEL");const selection=await registerSource(w);
 await enqueueStop(w.event,{dataRoot:w.data});await started(w);
 await submitQuestion(w.data,selection.openId,"ask","queued question");
 await enqueueStop(await newer(w),{dataRoot:w.data});
 const answer=await questionReady(w,selection);assert.equal(answer.status,"ready",answer.error);assert.equal(answer.sourceTurnId,"newer");
 assert.equal((await ready(w,"newer")).status,"ready");await stopWorker(w);
});

test("switching or closing during a question removes its branch and question files",async()=>{
 const w=await launchWorker("question-switch");const selection=await registerSource(w);
 await submitQuestion(w.data,selection.openId,"ask","WAIT_QUESTION");await started(w);
 const branch=(await records(w)).find(x=>x.method==="turn/start").input.threadId;
 await selectChat(w.data,second,"另一个聊天");
 await until(async()=> (await records(w)).some(x=>x.method==="thread/unsubscribe"&&x.input.threadId===branch));
 await assert.rejects(access(questionFiles(w.data,selection).result),{code:"ENOENT"});await assert.rejects(access(questionFiles(w.data,selection).control),{code:"ENOENT"});
 await assert.rejects(submitQuestion(w.data,selection.openId,"ask","stale click"),/切换或关闭/);
 const back=await selectChat(w.data,first,"回来");await submitQuestion(w.data,back.openId,"ask","WAIT_QUESTION");
 await until(async()=> (await records(w)).filter(x=>x.method==="turn/start").length===2);
 await stopWorker(w);assert.throws(()=>process.kill(w.state.backendPid,0),{code:"ESRCH"});
 assert.equal((await readdir(path.join(w.data,"floating"))).filter(x=>x.startsWith("questions-")).length,0);
});

test("failed questions keep their visible error and require an explicit reset",async()=>{
 const w=await launchWorker("question-failure","FAIL_GENERATION");const selection=await registerSource(w);
 await submitQuestion(w.data,selection.openId,"ask","失败测试");const failed=await questionReady(w,selection);
 assert.equal(failed.status,"error");assert.match(failed.error,/FAKE_FAILURE/);assert.equal(failed.messages[0].text,"失败测试");
 await assert.rejects(submitQuestion(w.data,selection.openId,"ask","不可偷偷重建分支"),/重新开始/);
 await newer(w);await submitQuestion(w.data,selection.openId,"reset");
 // Sending immediately after reset must not be blocked by the discarded error.
 await submitQuestion(w.data,selection.openId,"ask","重试");
 const answer=await questionReady(w,selection);assert.equal(answer.status,"ready",answer.error);assert.equal(answer.sourceTurnId,"newer");await stopWorker(w);
});

test("one backend receives fresh complete snapshots, configuration and per-request cache counts",async()=>{
 const w=await launchWorker("reuse-source");const original=await readFile(w.transcript);
 await enqueueStop(w.event,{dataRoot:w.data});
 await until(async()=>{const partial=await readExplanation(w.data,first);return partial.status==="generating"&&partial.text==="FAKE_EXPLANATION";});
 const a=await ready(w);assert.equal(a.status,"ready",a.error);assert.equal(a.text,"FAKE_EXPLANATION");
 assert.deepEqual(await readFile(w.transcript),original);
 const event=await newer(w);const updated=await readFile(w.transcript);await writeFile(path.join(w.source,"config.toml"),"# changed preference");
 await enqueueStop(event,{dataRoot:w.data});const b=await ready(w,"newer");assert.equal(b.status,"ready",b.error);assert.equal(b.text,"NEWER_EXPLANATION");
 assert.equal(a.backendPid,b.backendPid);assert.deepEqual(b.usage,[{input_token_count:1000,cached_token_count:900,output_token_count:25}]);
 const forked=(await records(w)).filter(x=>x.method==="thread/fork");assert.equal(forked.length,2);
 assert.equal(forked[0].input.ephemeral,true);assert.notEqual(forked[0].input.threadId,first);assert.notEqual(forked[0].input.threadId,forked[1].input.threadId);assert.equal(forked[0].input.model,"source-model");
 for(const fork of forked){const rows=fork.input.snapshot.trim().split("\n").map(JSON.parse);assert.equal(rows[0].payload.id,fork.input.threadId);assert.equal(rows[0].payload.session_id,first);assert.equal(rows[0].payload.history_mode,"legacy");assert.equal(rows[0].payload.history_base,undefined);assert.ok(rows.every(row=>row.ordinal===undefined));}
 assert.match(forked[0].input.snapshot,/earlier preference/);assert.doesNotMatch(forked[0].input.snapshot,/unfinished turn/);
 assert.match(forked[1].input.snapshot,/NEWER_CONDITION/);assert.equal(forked[1].input.runtimeConfig,"# changed preference");
 for(const row of forked)await assert.rejects(access(row.input.path),{code:"ENOENT"});
 assert.deepEqual(await readdir(path.join(w.data,"runs")),[]);await assert.rejects(access(path.join(w.data,"backend/home/auth.json")),{code:"ENOENT"});
 for(const call of forked)await assert.rejects(access(call.input.path),{code:"ENOENT"});
 assert.equal(await readFile(path.join(w.source,"plugins/cache/sentinel.txt"),"utf8"),"KEEP_INSTALLED_PLUGIN");
 assert.deepEqual(await readFile(w.transcript),updated);
 await stopWorker(w);
});

test("a newer queued reply cancels the old turn and keeps the same backend",async()=>{
 const w=await launchWorker("newer-source","WAIT_FOR_CANCEL");await enqueueStop(w.event,{dataRoot:w.data});await started(w);
 await enqueueStop(await newer(w),{dataRoot:w.data});const state=await ready(w,"newer");assert.equal(state.status,"ready",state.error);assert.equal(state.text,"NEWER_EXPLANATION");assert.equal(state.backendPid,w.state.backendPid);
 assert.deepEqual(await readdir(path.join(w.data,"runs")),[]);assert.equal((await readdir(path.join(w.data,"floating"))).filter(x=>x.startsWith("result-")).length,1);await stopWorker(w);
});

test("switching chats discards the old answer and reuses the backend for the new chat",async()=>{
 const w=await launchWorker("switch-source","WAIT_FOR_CANCEL");await enqueueStop(w.event,{dataRoot:w.data});await started(w);
 const next=await fakeSource("switch-source",second);await selectChat(w.data,second,"第二段聊天");await enqueueStop(next.event,{dataRoot:w.data});
 const state=await until(async()=>{const s=await readExplanation(w.data,second);return s.status==="ready"&&s;});assert.equal(state.backendPid,w.state.backendPid);assert.equal((await readdir(path.join(w.data,"floating"))).filter(x=>x.startsWith("result-")).length,1);await stopWorker(w);
});

test("closing during generation terminates backend and child processes and removes all temporary data",async()=>{
 const w=await launchWorker("close-source","WAIT_FOR_CANCEL",true);await enqueueStop(w.event,{dataRoot:w.data});await started(w);
 const pid=Number(await untilFile(w.marker));await stopWorker(w);assert.throws(()=>process.kill(pid,0),{code:"ESRCH"});assert.throws(()=>process.kill(w.state.backendPid,0),{code:"ESRCH"});
 assert.deepEqual(await readdir(path.join(w.data,"runs")),[]);assert.deepEqual(await readdir(path.join(w.data,"floating")),[]);
});

test("generation errors are visible and the backend can handle a later reply",async()=>{
 const w=await launchWorker("failure-source","FAIL_GENERATION");await enqueueStop(w.event,{dataRoot:w.data});const failed=await ready(w);assert.equal(failed.status,"error");assert.match(failed.error,/FAKE_FAILURE/);
 assert.deepEqual(await readdir(path.join(w.data,"runs")),[]);await enqueueStop(await newer(w),{dataRoot:w.data});const state=await ready(w,"newer");assert.equal(state.status,"ready",state.error);await stopWorker(w);
});

test("backend exit is reported and its runtime directory is discarded",async()=>{
 const w=await launchWorker("crash-source","CRASH_GENERATION");await enqueueStop(w.event,{dataRoot:w.data});const failed=await ready(w);assert.equal(failed.status,"error");assert.match(failed.error,/后台已退出/);await until(()=>w.child.exitCode!==null);await assert.rejects(access(path.join(w.data,"backend")),{code:"ENOENT"});
});

test("closed or unselected chats cannot enqueue a generation",async()=>{
 const f=await fakeSource("closed-source"),data=path.join(testRoot,"closed-data");await enqueueStop(f.event,{dataRoot:data});await assert.rejects(access(data),{code:"ENOENT"});await seedWindow(data,second);await enqueueStop(f.event,{dataRoot:data});await assert.rejects(access(path.join(data,"backend")),{code:"ENOENT"});
});

test("a missing backend is shown in the window without returning hook content",async()=>{
 const f=await fakeSource("missing-worker-source"),data=path.join(testRoot,"missing-worker-data");await seedWindow(data,first);await enqueueStop(f.event,{dataRoot:data});const state=await readExplanation(data,first);assert.equal(state.status,"error");assert.match(state.error,/后台已结束/);await assert.rejects(access(path.join(data,"backend")),{code:"ENOENT"});
});

test("invalid binding cannot create a temporary directory outside its data folder",async()=>{
 const f=await fakeSource("invalid-source"),data=path.join(testRoot,"invalid-data");await writeJson(path.join(data,"floating/window.json"),{pid:process.pid});await writeJson(path.join(data,"floating/selection.json"),{threadId:first,openId:"../../outside"});await assert.rejects(explainStop(f.event,{dataRoot:data,sourceHome:f.source}),/无效/);await assert.rejects(access(path.join(data,"runs")),{code:"ENOENT"});
});

test("Windows marker read denied during deletion is closed only after that marker disappears", {skip:process.platform!=="win32"}, async()=>{
 const data=path.join(testRoot,"window-deletion"),file=path.join(data,"floating/window.json");
 const original=fsPromises.readFile;
 const denied=Object.assign(new Error("marker open denied"),{code:"EPERM",path:file});
 const intercepted=mock.method(fsPromises,"readFile",async(name,...args)=>{
  if(name===file)throw denied;
  return await original(name,...args);
 });
 syncBuiltinESMExports();
 try {
  assert.equal(await isWindowOpen(data),null);
  await writeJson(file,{pid:process.pid});
  await assert.rejects(isWindowOpen(data),error=>error===denied);
 } finally {intercepted.mock.restore();syncBuiltinESMExports();}
 assert.equal(await isWindowOpen(data),true);
});

after(async()=>{
 for(const worker of workers)if(worker.child.exitCode===null)await stopWorker(worker);
 const resolved=path.resolve(testRoot);if(path.dirname(resolved)!==path.join(root, ".local"))throw Error("Test root outside private test folder");await rm(resolved,{recursive:true,force:true});
});

test("a reader holding the result open cannot kill the explanation worker", async () => {
 const w = await launchWorker("locked-reader-source", "LOCK_STREAM");
 await enqueueStop(w.event, {dataRoot:w.data}); await started(w);
 const selection=await readJson(path.join(w.data,"floating/selection.json"));
 const file=explanationFiles(w.data,selection,"done").result;
 const marker=path.join(w.data,"reader-open.txt");
 const command="$stream = [System.IO.File]::Open($args[0], 'Open', 'Read', 'Read'); [System.IO.File]::WriteAllText($args[1], 'open'); Start-Sleep -Seconds 4; $stream.Dispose()";
 const script=path.join(w.data,"hold-reader.ps1"); await writeFile(script,command);
 const reader=spawn("powershell.exe",["-NoProfile","-File",script,file,marker],{windowsHide:true,stdio:"ignore"});
 await untilFile(marker);
 await writeFile(path.join(w.data,"stream-gate"),"go");
 await new Promise(resolve=>reader.once("exit",resolve));
 assert.equal(w.child.exitCode,null,w.stderr);
 const state=await ready(w);
 assert.equal(state.status,"ready",state.error);
 assert.equal(state.text,"FAKE_EXPLANATION");
 await stopWorker(w);
});


test("the floating request restarts a dead worker for the same chat and cleans abandoned runs", async () => {
 const w=await launchWorker("restart-source","WAIT_FOR_CANCEL");
 const {DatabaseSync}=await import("node:sqlite");
 const database=new DatabaseSync(path.join(w.source,"state_5.sqlite"));
 database.exec("CREATE TABLE threads (id TEXT PRIMARY KEY, name TEXT, title TEXT, rollout_path TEXT NOT NULL)");
 database.prepare("INSERT INTO threads VALUES (?, ?, ?, ?)").run(first,"同一聊天","test",w.transcript);
 database.close();
 const original=await readFile(w.transcript);
 await enqueueStop(w.event,{dataRoot:w.data}); await started(w);
 const selection=await readJson(path.join(w.data,"floating/selection.json"));
 await submitQuestion(w.data,selection.openId,"ask","do not replay after crash");
 execFileSync("taskkill.exe",["/PID",String(w.child.pid),"/T","/F"],{windowsHide:true,stdio:"ignore"});
 await until(()=>w.child.exitCode!==null);
 const dead=await readExplanation(w.data,first);
 assert.equal(dead.status,"error"); assert.match(dead.error,/后台已退出/);
 await writeFile(w.transcript,(await readFile(w.transcript,"utf8")).replace("WAIT_FOR_CANCEL","finished reply"));
 const before=await readFile(w.transcript);
 const request=spawn(process.execPath,["dist/request.mjs",w.data,w.source,first],{cwd:root,windowsHide:true,stdio:["ignore","ignore","pipe"],env:{...process.env,CODEX_CLI_PATH:fakeCli}});
 let stderr=""; request.stderr.on("data",chunk=>stderr+=chunk);
 assert.equal(await new Promise(resolve=>request.once("exit",resolve)),0,stderr);
 const state=await ready(w);
 assert.equal(state.status,"ready",state.error); assert.equal(state.text,"FAKE_EXPLANATION");
 assert.notEqual(state.backendPid,w.state.backendPid);
 assert.deepEqual(state.usage,[{input_token_count:1000,cached_token_count:900,output_token_count:25}]);
 assert.deepEqual(await readFile(w.transcript),before);
 await assert.rejects(access(questionFiles(w.data,selection).control),{code:"ENOENT"});
 await assert.rejects(access(questionFiles(w.data,selection).result),{code:"ENOENT"});
 assert.deepEqual(await readdir(path.join(w.data,"runs")),[]);
 await access(path.join(w.data,"worker-error.log"));
 await rm(path.join(w.data,"floating/window.json"));
 await until(async()=>!await liveWorker(w.data));
 await until(async()=>{try{await access(path.join(w.data,"backend"));return false;}catch(error){if(error.code!=="ENOENT")throw error;return true;}});
 assert.equal(JSON.parse(await readFile(path.join(w.data,"worker-exit.json"),"utf8")).code,0);
 assert.equal(await readFile(path.join(w.source,"plugins/cache/sentinel.txt"),"utf8"),"KEEP_INSTALLED_PLUGIN");
});


test("a persistent file lock reports an error without exiting and the same reply can be retried", async () => {
 const w=await launchWorker("long-lock-source","LOCK_STREAM");
 await enqueueStop(w.event,{dataRoot:w.data}); await started(w);
 const selection=await readJson(path.join(w.data,"floating/selection.json"));
 const file=explanationFiles(w.data,selection,"done").result;
 const marker=path.join(w.data,"reader-open.txt");
 const script=path.join(w.data,"hold-reader.ps1");
 await writeFile(script,"$stream = [System.IO.File]::Open($args[0], 'Open', 'Read', 'Read'); [System.IO.File]::WriteAllText($args[1], 'open'); Start-Sleep -Seconds 7; $stream.Dispose()");
 const reader=spawn("powershell.exe",["-NoProfile","-File",script,file,marker],{windowsHide:true,stdio:"ignore"});
 await untilFile(marker); await writeFile(path.join(w.data,"stream-gate"),"go");
 await new Promise(resolve=>reader.once("exit",resolve));
 const failed=await ready(w); assert.equal(failed.status,"error"); assert.match(failed.error,/EPERM/);
 assert.equal(failed.text,"FAKE_EXPLANATION"); assert.equal(w.child.exitCode,null,w.stderr);
 await enqueueStop(w.event,{dataRoot:w.data});
 const retried=await ready(w); assert.equal(retried.status,"ready",retried.error); assert.equal(retried.text,"FAKE_EXPLANATION");
 assert.equal((await records(w)).filter(x=>x.method==="thread/fork").length,2);
 assert.equal((await readdir(path.join(w.data,"floating"))).filter(x=>x.endsWith(".tmp")).length,0);
 await stopWorker(w);
});
