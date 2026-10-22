import { createHash } from "node:crypto";
import { readdir, readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const releases = path.join(root, ".local/releases");
await mkdir(releases, { recursive: true });
const runtime = [".codex-plugin", ".mcp.json", "hooks", "settings.json", "dist", "assets", "install.ps1", "open.cmd", "README.md", "README.en.md", "LICENSE", "PRIVACY.md", "THIRD_PARTY_NOTICES.md", "VALIDATION.md"];
const source = [".agents", "plugin", ".gitignore", ".codex-plugin", ".mcp.json", "hooks", "settings.json", "src", "test", "scripts", "vendor", "assets", "package.json", "package-lock.json", "install.ps1", "open.cmd", "README.md", "README.en.md", "LICENSE", "PRIVACY.md", "THIRD_PARTY_NOTICES.md", "CONTRIBUTING.md", "CHANGELOG.md", "VALIDATION.md"];
for (const [kind, entries] of [["plugin-windows-x64", runtime], ["source", source]]) {
  const name = `codex-reply-explainer-${version}-${kind}`;
  const stage = path.join(releases, name);
  if (path.dirname(stage) !== releases) throw new Error("Unexpected staging path.");
  await rm(stage, { recursive: true, force: true });
  await mkdir(stage, { recursive: true });
  for (const entry of entries) await cp(path.join(root, entry), path.join(stage, entry), { recursive: true });
  const files = await readdir(stage, { recursive: true, withFileTypes: true });
  for (const file of files) {
    if (!file.isFile()) continue;
    const value = await readFile(path.join(file.parentPath, file.name));
    if (/[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s"']+/i.test(value.toString("utf8"))) throw new Error("Personal home path in " + file.name);
    if (["auth.json", "config.toml", "state_5.sqlite"].includes(file.name) || file.name.endsWith(".jsonl")) throw new Error("Runtime file in release: " + file.name);
  }
  const archive = path.join(releases, name + ".zip");
  execFileSync("tar.exe", ["-a", "-c", "-f", archive, "-C", stage, "."], { stdio: "inherit", windowsHide: true });
  console.log(archive);
}

const archives = ["plugin-windows-x64", "source"].map(kind => "codex-reply-explainer-" + version + "-" + kind + ".zip");
const sums = await Promise.all(archives.map(async name => createHash("sha256").update(await readFile(path.join(releases, name))).digest("hex") + "  " + name));
await writeFile(path.join(releases, "SHA256SUMS.txt"), sums.join("\n") + "\n");
