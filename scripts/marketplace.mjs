import { readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const target = path.join(root, "plugin");
if (path.dirname(target) !== root) throw new Error("Unexpected plugin directory.");
await rm(target, { recursive: true, force: true });
await mkdir(target);
for (const name of [".codex-plugin", ".mcp.json", "hooks", "dist", "LICENSE", "PRIVACY.md", "THIRD_PARTY_NOTICES.md"])
  await cp(path.join(root, name), path.join(target, name), { recursive: true });
await writeFile(path.join(target, "settings.json"), JSON.stringify({ installedSettings: true }, null, 2) + "\n");
await mkdir(".agents/plugins", { recursive: true });
await writeFile(".agents/plugins/marketplace.json", JSON.stringify({
  name: "reply-explainer-preview",
  interface: { displayName: "Codex Reply Explainer" },
  plugins: [{ name: "reply-explainer", source: { source: "local", path: "./plugin" },
    policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" }, category: "Productivity" }]
}, null, 2) + "\n");
const version = JSON.parse(await readFile(".codex-plugin/plugin.json", "utf8")).version;
console.log("Prepared Git marketplace version " + version);
