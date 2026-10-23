// src/floating.mjs
import path from "node:path";
async function readThreadIdByName(sourceHome, title) {
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(path.join(sourceHome, "state_5.sqlite"), { readOnly: true });
  try {
    const rows = database.prepare("SELECT id FROM threads WHERE COALESCE(NULLIF(name, ''), title) = ?").all(title);
    if (rows.length > 1) throw new Error("\u6709\u591A\u6BB5\u540C\u540D\u804A\u5929\uFF0C\u65E0\u6CD5\u81EA\u52A8\u786E\u5B9A\u5F53\u524D\u5BF9\u8BDD\u3002\u8BF7\u7ED9\u5F53\u524D\u804A\u5929\u6539\u4E00\u4E2A\u4E0D\u540C\u7684\u540D\u79F0\u3002");
    if (rows.length === 0) throw new Error("\u5F53\u524D\u804A\u5929\u6CA1\u6709\u672C\u5730\u8BB0\u5F55\uFF0C\u6682\u4E0D\u652F\u6301\u5728\u5C0F\u7A97\u4E2D\u63D0\u95EE\u3002");
    return rows[0].id;
  } finally {
    database.close();
  }
}

// src/current-chat.mjs
var input = "";
for await (const chunk of process.stdin) input += chunk;
try {
  console.log(await readThreadIdByName(process.argv[2], JSON.parse(input)));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
