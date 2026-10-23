import { readThreadIdByName } from "./floating.mjs";
let input = "";
for await (const chunk of process.stdin) input += chunk;
try {
  console.log(await readThreadIdByName(process.argv[2], JSON.parse(input)));
} catch (error) { console.error(error.message); process.exitCode = 1; }
