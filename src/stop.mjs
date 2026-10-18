import { loadSettings } from "./settings.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { enqueueStop } from "./worker-client.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const settings = await loadSettings(root);
let input = "";
for await (const chunk of process.stdin) input += chunk;
const event = JSON.parse(input);
if (event.hook_event_name !== "Stop") throw new Error("Only Stop events are accepted.");
await enqueueStop(event, { dataRoot: settings.dataDirectory });
