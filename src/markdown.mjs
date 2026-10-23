import MarkdownIt from "markdown-it";
import { katex } from "@mdit/plugin-katex";

const parser = new MarkdownIt({ html: false }).use(katex, {
  delimiters: "all", mathFence: true, trust: false, throwOnError: false
});
// Explanations may contain untrusted text. Embedded images never fetch remote data.
parser.renderer.rules.image = (tokens, index) => parser.utils.escapeHtml(tokens[index].content);
export function renderMarkdown(text) { return parser.render(text); }
export function formatDuration(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return seconds < 60 ? seconds + " 秒" : Math.floor(seconds / 60) + " 分 " + seconds % 60 + " 秒";
}
function renderAnswer(text, thinking = []) {
  let html = "", offset = 0;
  for (const stage of thinking) {
    html += renderMarkdown(text.slice(offset, stage.offset));
    const live = stage.elapsedMs === undefined;
    html += '<div class="thinking-row' + (live ? ' live' : '') + '"><span class="thinking-label">' + (live ? '正在思考' : '已思考') + '</span><span class="thinking-time"'
      + (live ? ' data-started-at="' + parser.utils.escapeHtml(stage.startedAt) + '"' : '') + '> · ' + formatDuration(live ? Date.now() - Date.parse(stage.startedAt) : stage.elapsedMs) + '</span></div>';
    offset = stage.offset;
  }
  return html + renderMarkdown(text.slice(offset));
}
export function renderMessages(messages, partial = "", thinking = []) {
  const visible = partial || thinking.length ? [...messages, { role: "assistant", text: partial, thinking }] : messages;
  return visible.map(message => ({ role: message.role, html: (message.role === "assistant" ? renderAnswer(message.text, message.thinking) : renderMarkdown(message.text)) + (message.role === "assistant" && Number.isFinite(message.elapsedMs)
    ? '<div class="reply-duration">' + (message.stopped ? '已停止 · 用时 ' : '用时 ') + formatDuration(message.elapsedMs) + '</div>' : "") }));
}
