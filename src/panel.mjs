import { App, applyDocumentTheme, applyHostStyleVariables } from "@modelcontextprotocol/ext-apps";

import { renderMarkdown } from "./markdown.mjs";

const app = new App({ name: "reply-explainer", version: "0.5.0-beta.2" }, {});
const status = document.querySelector("#status");
const text = document.querySelector("#explanation");
const error = document.querySelector("#error");
function render(result) {
  if (result._meta?.floatingWindow?.requested) document.querySelector("#floating-note").hidden = false;
  const state = result._meta?.replyExplainer;
  if (!state) return;
  error.textContent = state.status === "error" ? state.error : "";
  text.innerHTML = renderMarkdown(state.text || "");
  status.textContent = state.status === "ready" ? ""
    : state.status === "generating" ? "正在生成解释…"
    : state.status === "error" ? "这次解释没有生成成功"
    : state.status === "unavailable" ? "暂时没有找到这段聊天已保存的完整回复。"
    : "这段聊天还没有解释。";
}
app.ontoolresult = render;
function theme(context) {
  if (context?.theme) applyDocumentTheme(context.theme);
  if (context?.styles?.variables) applyHostStyleVariables(context.styles.variables);
}
app.addEventListener("hostcontextchanged", theme);
await app.connect();
theme(app.getHostContext());
async function refresh(name = "reply_explainer.open") {
  try {
    render(await app.callServerTool({ name, arguments: {} }));
  } catch (failure) {
    status.textContent = "暂时无法读取解释";
    error.textContent = failure.message;
  }
}
document.querySelector("#reopen").onclick = async event => {
  const button = event.currentTarget;
  button.disabled = true;
  try { await refresh("reply_explainer.open_floating"); }
  finally { button.disabled = false; }
};
await refresh("reply_explainer.explain_latest");
setInterval(() => refresh(), 2000);
