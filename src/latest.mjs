import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { snapshotThroughTurn } from "./explain.mjs";
import { threadDirectory } from "./state.mjs";

export async function latestReplyEvent(sourceHome, threadId) {
  threadDirectory(sourceHome, threadId);
  let entries;
  try {
    entries = await readdir(path.join(sourceHome, "sessions"), { recursive: true, withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  const entry = entries.find(item => item.isFile() && item.name.endsWith("-" + threadId + ".jsonl"));
  if (!entry) return null;
  const transcript = path.join(entry.parentPath, entry.name);
  const text = await readFile(transcript, "utf8");
  const rows = text.slice(0, text.lastIndexOf("\n") + 1).split("\n").filter(Boolean).map(line => JSON.parse(line));
  if (rows[0].payload.id !== threadId) throw new Error("聊天记录与当前聊天不一致。");
  const completed = rows.findLast(item => item.type === "event_msg" && item.payload.type === "task_complete");
  if (!completed) return null;
  const turnId = completed.payload.turn_id;
  const snapshot = snapshotThroughTurn(text, turnId);
  const savedRows = snapshot.text.trimEnd().split("\n").map(line => JSON.parse(line));
  const message = savedRows.findLast(item => item.type === "response_item" && item.payload.type === "message" && item.payload.role === "assistant");
  const answer = completed.payload.last_agent_message || completed.payload.last_assistant_message
    || message?.payload.content.map(item => item.text || "").join("\n");
  if (!answer?.trim()) return null;
  return { hook_event_name: "Stop", session_id: threadId, turn_id: turnId, transcript_path: transcript,
    cwd: snapshot.context.cwd, model: snapshot.context.model, last_assistant_message: answer };
}
