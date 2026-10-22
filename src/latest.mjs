import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { snapshotThroughTurn, relativeRolloutPath } from "./explain.mjs";
import { threadDirectory } from "./state.mjs";
import { readRolloutHistory } from "./history.mjs";

export async function latestReplyEvent(sourceHome, threadId) {
  threadDirectory(sourceHome, threadId);
  const database = new DatabaseSync(path.join(sourceHome, "state_5.sqlite"), { readOnly: true });
  let transcript;
  try {
    const thread = database.prepare("SELECT rollout_path FROM threads WHERE id = ?").get(threadId);
    if (!thread) return null;
    transcript = thread.rollout_path;
  } finally {
    database.close();
  }
  relativeRolloutPath(sourceHome, transcript);
  const text = await readRolloutHistory(sourceHome, transcript);
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
