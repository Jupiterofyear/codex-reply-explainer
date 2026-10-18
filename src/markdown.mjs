import MarkdownIt from "markdown-it";
import { katex } from "@mdit/plugin-katex";

const parser = new MarkdownIt({ html: false }).use(katex, {
  delimiters: "all", mathFence: true, trust: false, throwOnError: false
});
// Explanations may contain untrusted text. Embedded images never fetch remote data.
parser.renderer.rules.image = (tokens, index) => parser.utils.escapeHtml(tokens[index].content);
export function renderMarkdown(text) { return parser.render(text); }
