import MarkdownIt from "markdown-it";
import { katex } from "@mdit/plugin-katex";

const parser = new MarkdownIt({ html: false }).use(katex, {
  delimiters: "all", mathFence: true, trust: false, throwOnError: false
});
// Explanations may contain untrusted text. Embedded images never fetch remote data.
parser.renderer.rules.image = (tokens, index) => parser.utils.escapeHtml(tokens[index].content);
export function renderMarkdown(text) { return parser.render(text); }
export function renderMessages(messages, partial = "") {
  const visible = partial ? [...messages, { role: "assistant", text: partial }] : messages;
  return visible.map(message => ({ role: message.role, html: renderMarkdown(message.text) }));
}
