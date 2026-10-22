import path from "node:path";
export const questionPrompt = "这是解释小窗中的独立提问。结合已继承的对话，理解用户的问题、关注点、知识水平和明确偏好，直接回答接下来提出的问题。\n用尽可能少的话讲清楚，保留必要依据和推导。使用常用、具体、定义清楚的词，必要的专业词随即用常识能理解的话解释。避免自创词汇、空泛术语、开场和重复总结。\n不使用防御性套话、免责声明、自我辩护和预防性澄清。直接说明结论、依据和必要条件。已有信息不足时，给出有依据的猜测并说明依据，明确标为猜测，不冒充事实；没有依据时指出具体缺少什么信息。\n只根据已有上下文回答，不执行任务、不调用工具、不读写文件、不向主聊天发送消息。后续提问沿用这个独立分支。";
export const explanationPrompt = "这是一条应用自动发起的解释请求。结合已继承的对话，理解用户当前的问题、关注点、知识水平和明确偏好，只解释最后一条已完成回复。\n直接告诉用户最值得知道的结论、这对其问题意味着什么；需要行动时说明下一步。只保留理解所需的依据，按重要性取舍，避免逐项复述原文。\n用尽可能少的话讲清楚，长度随内容决定，每句话都要提供有用信息。用常用、具体、定义清楚的词；必要的专业词随即用常识能理解的话解释。严禁自创词汇、空泛术语、套话、开场和重复总结。\n禁止任何防御性语言、免责声明、自我辩护和预防性澄清。禁止“不是A而是B”“既不是A也不是B”“这不代表……”等否定对比。把意思直接写成具体事实。影响用户判断的失败、未完成事项和必要条件，简洁交代。\n只依据已有内容解释，不编造事实，不继续执行任务，不调用工具，不读写文件，不向主聊天发送消息。";

export function snapshotThroughTurn(text, turnId) {
  const lines = text.slice(0, text.lastIndexOf("\n") + 1).split("\n").filter(Boolean);
  const kept = [];
  let found = false;
  let context;
  for (const line of lines) {
    const item = JSON.parse(line);
    if (item.type === "turn_context") {
      if (found && item.payload.turn_id !== turnId) break;
      if (item.payload.turn_id === turnId) {
        found = true;
        context = item.payload;
      }
    }
    kept.push(line);
    if (found && item.type === "event_msg" && item.payload.type === "task_complete" && item.payload.turn_id === turnId) break;
  }
  if (!found) throw new Error("保存记录中还没有这条回复的上下文。");
  return { text: kept.join("\n") + "\n", context };
}

export function relativeRolloutPath(sourceHome, source) {
  const relative = path.relative(path.toNamespacedPath(sourceHome), path.toNamespacedPath(path.resolve(source)));
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("聊天记录不在指定的 Codex 存储目录中。");
  return relative;
}

export function requestUsage(log) {
  return log.split("\n")
    .filter(line => line.includes("event.kind=response.completed"))
    .map(line => {
      const fields = {};
      for (const name of ["input_token_count", "cached_token_count", "output_token_count"]) {
        fields[name] = Number(line.match(new RegExp("(?:^| )" + name + "=(\\d+)"))[1]);
      }
      return fields;
    })
    .filter(usage => usage.output_token_count > 0);
}

