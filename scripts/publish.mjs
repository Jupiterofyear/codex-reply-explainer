import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const root = process.cwd(), repository = "Jupiterofyear/codex-reply-explainer";
const notes = process.argv[2];
if (!notes) throw new Error("Usage: node scripts/publish.mjs path/to/release-notes.md");
readFileSync(notes);
const temporary = path.join(root, ".local/publish-tmp");
mkdirSync(temporary, { recursive: true });
const options = { cwd: root, encoding: "utf8", windowsHide: true, env: { ...process.env, TEMP: temporary, TMP: temporary } };
const git = args => execFileSync("git", args, options).trim();
if (git(["branch", "--show-current"]) !== "main") throw new Error("Publish from main.");
if (git(["status", "--porcelain"])) throw new Error("Commit the tested source, docs, and generated plugin files first.");
const remote = git(["remote", "get-url", "origin"]);
if (!["https://github.com/" + repository + ".git", "git@github.com:" + repository + ".git"].includes(remote)) throw new Error("Unexpected origin repository.");
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
if (JSON.parse(readFileSync("plugin/.codex-plugin/plugin.json", "utf8")).version !== version) throw new Error("Rebuild the marketplace before publishing.");
git(["ls-files", "--error-unmatch", ".agents/plugins/marketplace.json", "plugin/dist/server.mjs"]);
const releases = path.join(root, ".local/releases");
const names = ["plugin-windows-x64", "source"].map(kind => "codex-reply-explainer-" + version + "-" + kind + ".zip");
const sums = readFileSync(path.join(releases, "SHA256SUMS.txt"), "utf8");
for (const name of names) {
  const hash = createHash("sha256").update(readFileSync(path.join(releases, name))).digest("hex");
  if (!sums.split(/\r?\n/).includes(hash + "  " + name)) throw new Error("Archive checksum mismatch: " + name);
}
function checkBundles(relative = "") {
  for (const entry of readdirSync(path.join(root, "plugin/dist", relative))) {
    const file = path.join(relative, entry);
    if (statSync(path.join(root, "plugin/dist", file)).isDirectory()) checkBundles(file);
    else {
      const packaged = path.join(releases, "codex-reply-explainer-" + version + "-plugin-windows-x64/dist", file);
      if (!readFileSync(path.join(root, "plugin/dist", file)).equals(readFileSync(packaged))) throw new Error("Package and main-branch runtime differ: " + file);
    }
  }
}
checkBundles();
const head = git(["rev-parse", "HEAD"]);
execFileSync("git", ["push", "origin", "main"], { ...options, stdio: "inherit" });
execFileSync("gh", ["release", "create", "v" + version, "--repo", repository, "--target", head, "--title", "Codex Reply Explainer " + version,
  ...version.includes("-") ? ["--prerelease"] : [], "--notes-file", path.resolve(notes),
  ...names.map(name => path.join(releases, name)), path.join(releases, "SHA256SUMS.txt")], { ...options, stdio: "inherit" });
console.log("Published main-branch automatic update and matching Release assets.");
