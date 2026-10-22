import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readThreadName } from "./floating.mjs";
import { latestReplyEvent } from "./latest.mjs";
import { ensureWorker, enqueueStop } from "./worker-client.mjs";
import { selectChat, writeJson, isCurrentSelection, isWindowOpen, discardSelection, readJson } from "./state.mjs";

const [dataRoot, sourceHome, threadId] = process.argv.slice(2);
if (await isWindowOpen(dataRoot)) {
  await ensureWorker({ root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), dataRoot, sourceHome });
  const title = readThreadName(sourceHome, threadId);
  const selection = await selectChat(dataRoot, threadId, title);
  try {
    if (selection?.threadId === threadId && await isCurrentSelection(dataRoot, selection)) {
      const event = await latestReplyEvent(sourceHome, threadId);
      if (event) await enqueueStop(event, { dataRoot });
      else if (await isCurrentSelection(dataRoot, selection)) await writeJson(path.join(dataRoot, "floating", "selection.json"), { ...selection, initialStatus: "unavailable" });
    }
  } finally {
    if (selection && !await isCurrentSelection(dataRoot, selection)) {
      await discardSelection(dataRoot, selection);
      const file = path.join(dataRoot, "floating", "selection.json");
      if ((await readJson(file))?.openId === selection.openId) await rm(file, { force: true });
    }
  }
}
