import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { relativeRolloutPath } from "./context.mjs";

export async function readRolloutHistory(sourceHome, source) {
  async function readSegment(file, end) {
    relativeRolloutPath(sourceHome, file);
    const bytes = await readFile(file);
    const text = bytes.subarray(0, end ?? bytes.lastIndexOf(10) + 1).toString("utf8");
    const headerEnd = text.indexOf("\n");
    const metadata = JSON.parse(text.slice(0, headerEnd)).payload;
    const base = metadata.history_base;
    if (!base) return text;
    let parent;
    for (const folder of ["sessions", "archived_sessions"]) {
      let entries;
      try { entries = await readdir(path.join(sourceHome, folder), { recursive: true, withFileTypes: true }); }
      catch (error) { if (error.code === "ENOENT") continue; throw error; }
      const entry = entries.find(item => item.isFile() &&
        (item.name.endsWith("-" + base.thread_id + ".jsonl") || item.name.endsWith("_" + base.thread_id + ".jsonl")));
      if (entry) { parent = path.join(entry.parentPath, entry.name); break; }
    }
    if (!parent) throw new Error("没有找到这段聊天引用的前一份记录。");
    const inherited = await readSegment(parent, base.end_byte_offset);
    return text.slice(0, headerEnd + 1) + inherited.slice(inherited.indexOf("\n") + 1) + text.slice(headerEnd + 1);
  }
  return await readSegment(source);
}
