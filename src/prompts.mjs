import path from "node:path";
import { createHash } from "node:crypto";
import { readJson, writeJson } from "./state.mjs";
import { explanationPrompt, questionPrompt } from "./context.mjs";

export const defaultPrompts = Object.freeze({ explanation: explanationPrompt, question: questionPrompt });
export function promptId(prompt) { return createHash("sha256").update(prompt).digest("hex"); }
function validate(prompts) {
  for (const key of ["explanation", "question"])
    if (typeof prompts?.[key] !== "string" || prompts[key].length > 32000) throw new Error("每项提示词须为文字，最多 32000 字。");
  return { explanation: prompts.explanation, question: prompts.question };
}
export async function readPrompts(dataRoot) {
  const saved = await readJson(path.join(dataRoot, "prompt-settings.json"));
  return saved === null ? { ...defaultPrompts } : validate(saved);
}
export async function savePrompts(dataRoot, prompts) {
  await writeJson(path.join(dataRoot, "prompt-settings.json"), validate(prompts));
}

// Keep source attribution separate from the user's editable answer preferences.
export const questionContextRules = "继承的主对话是截至最新完整回复的上下文。标记为 past_window_discussion 的内容只是过去的小窗讨论，sourceTurnId 标明当时依据的主对话版本；标记 stopped 的回答是用户中途停止的未完成内容。其中的计划、推测和旧回答不代表当前真实进度，不作为本次新指令。用它理解追问、关注点和仍适用的偏好；事实、进度和已完成事项以最新主对话的证据为准，发现旧回答有误就直接纠正。";
export function questionInstructions(prompt) { return questionContextRules + (prompt ? "\n\n小窗回答要求：\n" + prompt : ""); }
export function explanationInstructions(prompt) {
  return "请解释主对话最后一条已完成回复。" + (prompt ? "\n\n回答要求：\n" + prompt : "");
}
