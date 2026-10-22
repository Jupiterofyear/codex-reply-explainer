import { mkdir, rename, readFile, readdir, rm, symlink, unlink } from "node:fs/promises";
import path from "node:path";
import { writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { AppServerBackend } from "./backend.mjs";
import { explainStop, copyRuntimeInputs } from "./explain.mjs";
import { readJson, writeJson, isWindowOpen, activeSelection } from "./state.mjs";
import { workerFiles } from "./worker-client.mjs";
import { QuestionsSession } from "./questions.mjs";

const [dataRoot, sourceHome, cliPath] = process.argv.slice(2);
const files = workerFiles(dataRoot);
process.on("exit", code => writeFileSync(path.join(dataRoot, "worker-exit.json"), JSON.stringify({ pid: process.pid, code, at: new Date().toISOString() }) + "\n"));
const home = path.join(files.directory, "home");
const cache = path.join(home, "plugins/cache");
const processing = path.join(files.directory, "processing.json");
let backend, questions, monitor, finished = false, closing;
async function clearQuestions() {
  for (const file of await readdir(path.join(dataRoot, "floating"))) {
    if (file.startsWith("questions-") && file.endsWith(".json")) await rm(path.join(dataRoot, "floating", file), { force: true });
  }
}
try {
  // Only this worker's private directory is removed; detach its installed-code link first.
  try { await unlink(cache); } catch (error) { if (error.code !== "ENOENT") throw error; }
  await rm(files.directory, { recursive: true, force: true });
  await rm(path.join(dataRoot, "runs"), { recursive: true, force: true });
  await clearQuestions();
  await mkdir(path.join(home, "plugins"), { recursive: true });
  await mkdir(path.join(files.directory, "tmp"));
  await writeJson(files.state, { pid: process.pid, status: "starting" });
  await copyRuntimeInputs(sourceHome, home);
  await symlink(path.join(sourceHome, "plugins/cache"), cache, "junction");
  backend = new AppServerBackend({ cliPath, home, directory: files.directory, cwd: sourceHome });
  await backend.start();
  questions = new QuestionsSession({ dataRoot, sourceHome, backend });
  await rm(path.join(home, "auth.json"), { force: true });
  await writeJson(files.state, { pid: process.pid, backendPid: backend.child.pid, status: "ready" });
  monitor = (async () => {
    while (!finished) {
      await delay(250);
      if (!finished && !await isWindowOpen(dataRoot)) { closing = backend.close(); await closing; return; }
    }
  })();
  while (await isWindowOpen(dataRoot) && backend.child.exitCode === null) {
    if (await questions.process(await activeSelection(dataRoot))) continue;
    try { await rename(files.pending, processing); }
    catch (error) { if (error.code !== "ENOENT") throw error; await delay(50); continue; }
    const request = await readJson(processing);
    if ((await activeSelection(dataRoot))?.openId === request.openId) await explainStop(request.event, { dataRoot, sourceHome, backend });
    await rm(processing, { force: true });
  }
} finally {
  finished = true;
  if (backend) await (closing || backend.close());
  if (questions) await questions.discard();
  await clearQuestions();
  if (monitor) await monitor;
  try { await unlink(cache); } catch (error) { if (error.code !== "ENOENT") throw error; }
  await rm(files.directory, { recursive: true, force: true });
}
