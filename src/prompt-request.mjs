import { defaultPrompts, readPrompts, savePrompts } from "./prompts.mjs";
const [dataRoot, action] = process.argv.slice(2);
try {
  if (action === "get") process.stdout.write(JSON.stringify({ prompts: await readPrompts(dataRoot), defaults: defaultPrompts }));
  else if (action === "save") {
    let text = "";
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) text += chunk;
    await savePrompts(dataRoot, JSON.parse(text));
  } else throw new Error("提示词设置操作无效。");
} catch (error) { process.stderr.write(error.message); process.exitCode = 1; }
