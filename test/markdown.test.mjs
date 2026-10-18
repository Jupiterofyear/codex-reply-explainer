import test from 'node:test';import assert from 'node:assert/strict';import{renderMarkdown}from'../src/markdown.mjs';
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
