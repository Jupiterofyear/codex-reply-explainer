import test from 'node:test';import assert from 'node:assert/strict';import{renderMarkdown,renderMessages}from'../src/markdown.mjs';
test('emphasis and bracket math render while preserving Chinese text',()=>{
 const html=renderMarkdown(String.raw`计算结果为 \(2^3=8\)，误差约 **1%–2%**。

现在需要**检查输入条件，
再记录最终结果**。`);
 assert.match(html,/<strong>1%–2%<\/strong>/);assert.match(html,/<strong>检查输入条件/);assert.match(html,/class="katex"/);assert.match(html,/2/);assert.doesNotMatch(html,/\*\*|\\\(|\\\)/);
});
test('paragraphs, lists, tables and code keep their intended structure',()=>{
 const html=renderMarkdown('第一段。\n\n- **重点**\n- 第二项\n\n| 项目 | 值 |\n| --- | --- |\n| A | 1 |\n\n`a_b`\n\n```js\nconst x = "**literal**";\n```');
 assert.equal((html.match(/<li>/g)||[]).length,2);assert.match(html,/<table>/);assert.match(html,/<code>a_b<\/code>/);assert.match(html,/<pre><code class="language-js">/);assert.match(html,/\*\*literal\*\*/);
});
test('all common math delimiters and fractions render without changing code examples',()=>{
 for(const source of [String.raw`\(x^2\)`,String.raw`\[\frac{1}{2}\]`,'$x^2$','$$\\frac{1}{2}$$','```math\n\\frac{1}{2}\n```'])assert.match(renderMarkdown(source),/class="katex/);
 assert.doesNotMatch(renderMarkdown("`\\(x\\)`"),/class="katex/);
});
test('HTML, unsafe links, images and untrusted math cannot execute or fetch content',()=>{
 const html=renderMarkdown('<script>alert(1)</script>\n\n[链接](javascript:alert(1))\n\n![图片](https://example.com/private.png)\n\n'+String.raw`\(\href{javascript:alert(1)}{x}\)`);
 assert.doesNotMatch(html,/<script|<img|href="javascript:/);assert.match(html,/&lt;script&gt;/);
});
test('each question, answer and partial answer has its own Markdown boundaries',()=>{
 const parts=renderMessages([
  {role:'user',text:'解释这段代码：\n\n```js\nconst x = 1;'},
  {role:'assistant',text:'**回答仍有加粗**，公式 $x^2$。\n\n- 第一点'},
  {role:'user',text:'> 引用未收尾\n\n```text\n还有一个未闭合代码块'}
 ],'**正在返回的回答**\n\n- 流式内容');
 assert.equal(parts.length,4);
 assert.match(parts[0].html,/<pre><code class="language-js">/);
 assert.match(parts[0].html,/<\/code><\/pre>/);
 assert.match(parts[1].html,/<strong>回答仍有加粗<\/strong>/);
 assert.match(parts[1].html,/class="katex/);
 assert.match(parts[1].html,/<li>第一点<\/li>/);
 assert.doesNotMatch(parts[1].html,/<pre>|language-js|&lt;strong/);
 assert.match(parts[3].html,/<strong>正在返回的回答<\/strong>/);
 assert.match(parts[3].html,/<li>流式内容<\/li>/);
 assert.doesNotMatch(parts[3].html,/<pre>|<blockquote>/);
});
test('Markdown link definitions and unsafe HTML cannot leak into the next message',()=>{
 const parts=renderMessages([
  {role:'user',text:'[private]: https://example.com/private\n\n<script>unclosed'},
  {role:'assistant',text:'[private]\n\n**独立回答**'}
 ]);
 assert.doesNotMatch(parts[0].html,/<script>/);
 assert.doesNotMatch(parts[1].html,/<a |https:\/\/example/);
 assert.match(parts[1].html,/<strong>独立回答<\/strong>/);
});
