import { submitQuestion } from "./questions.mjs";
const [dataRoot, openId, action] = process.argv.slice(2);
let text = "";
for await (const chunk of process.stdin) text += chunk;
await submitQuestion(dataRoot, openId, action, text);
