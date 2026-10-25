import { mkdir, rename, readFile, readdir, rm, symlink, unlink } from "node:fs/promises";
import path from "node:path";
import { writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { AppServerBackend } from "./backend.mjs";
import { explainStop, copyRuntimeInputs } from "./explain.mjs";
import { readJson, writeJson, isWindowOpen, activeSelection, retainedSelections } from "./state.mjs";
import { workerFiles } from "./worker-client.mjs";
import { QuestionsSession } from "./questions.mjs";

const [dataRoot, sourceHome, cliPath] = process.argv.slice(2);
const files = workerFiles(dataRoot);
let failure;
process.on("exit", code => writeFileSync(path.join(dataRoot, "worker-exit.json"), JSON.stringify({ pid: process.pid, code, error: failure?.message, at: new Date().toISOString() }) + "\n"));
const home = path.join(files.directory, "home");
const cache = path.join(home, "plugins/cache");
const questionDirectory = path.join(files.directory, "questions");
const questionHome = path.join(questionDirectory, "home");
const questionCache = path.join(questionHome, "plugins/cache");
const processing = path.join(files.directory, "processing.json");
let backend, questionBackend, monitor, finished = false;
const questionSessions = new Map();
const closeBackends = () => Promise.all([backend?.close(), questionBackend?.close()]);
async function detachCache(link) {
  try { await unlink(link); } catch (error) { if (error.code !== "ENOENT") throw error; }
}
async function clearQuestions() {
  for (const file of await readdir(path.join(dataRoot, "floating"))) {
    if (file.startsWith("questions-") && file.endsWith(".json")) await rm(path.join(dataRoot, "floating", file), { force: true });
  }
}
try {
  // Only this worker's private directory is removed; detach its installed-code link first.
  await detachCache(cache);
  await detachCache(questionCache);
  await rm(files.directory, { recursive: true, force: true });
  await rm(path.join(dataRoot, "runs"), { recursive: true, force: true });
  await clearQuestions();
  await writeJson(files.state, { pid: process.pid, status: "starting" });
  for (const [privateHome, directory, link] of [[home, files.directory, cache], [questionHome, questionDirectory, questionCache]]) {
    await mkdir(path.join(privateHome, "plugins"), { recursive: true });
    await mkdir(path.join(directory, "tmp"), { recursive: true });
    await copyRuntimeInputs(sourceHome, privateHome);
    await symlink(path.join(sourceHome, "plugins/cache"), link, "junction");
  }
  backend = new AppServerBackend({ cliPath, home, directory: files.directory, cwd: sourceHome });
  questionBackend = new AppServerBackend({ cliPath, home: questionHome, directory: questionDirectory, cwd: sourceHome });
  await Promise.all([backend.start(), questionBackend.start()]);
  await Promise.all([home, questionHome].map(privateHome => rm(path.join(privateHome, "auth.json"), { force: true })));
  await writeJson(files.state, { pid: process.pid, backendPid: backend.child.pid, questionBackendPid: questionBackend.child.pid, status: "ready" });
  monitor = (async () => {
    while (!finished) {
      await delay(250);
      if (!finished && !await isWindowOpen(dataRoot)) { await closeBackends(); return; }
    }
  })();
  const running = async () => !finished && await isWindowOpen(dataRoot) && backend.child.exitCode === null && questionBackend.child.exitCode === null;
  await Promise.all([
    (async () => {
      while (await running()) {
        try { await rename(files.pending, processing); }
        catch (error) { if (error.code !== "ENOENT") throw error; await delay(50); continue; }
        const request = await readJson(processing);
        const selection = (await retainedSelections(dataRoot)).find(item => item.openId === request.openId);
        if (selection) await explainStop(request.event, { dataRoot, sourceHome, backend, selection, prompt: request.prompt });
        await rm(processing, { force: true });
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
        await delay(50);
      }
    })()
  ]);

} catch (error) {
  failure = error;
  throw error;
} finally {
  finished = true;
  await closeBackends();
  for (const questions of questionSessions.values()) await questions.discard();
  await clearQuestions();
  if (monitor) await monitor;
  await detachCache(cache);
  await detachCache(questionCache);
  await rm(files.directory, { recursive: true, force: true });
}
