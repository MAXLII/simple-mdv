const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { marked } = require('marked');
const { compatibleFlowchartSource } = require('../mermaid-support');
const { createMarkdownRenderer } = require('../markdown-renderer');

(async () => {
  const dom = new JSDOM('<main></main>');
  global.window = dom.window; global.document = dom.window.document;
  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true });
  const source = String.raw`flowchart LR
    A["__attribute__((section(\"section\")))<br/>输入段"] --> B["输出段"]`;
  assert.equal(await mermaid.parse(source, { suppressErrors: true }), false);
  assert.ok(await mermaid.parse(compatibleFlowchartSource(source)));
  const children = document.body.childElementCount;
  await assert.rejects(mermaid.render('invalid-regression', 'not a valid diagram'));
  assert.equal(document.body.childElementCount, children, 'Mermaid must remove its error DOM');
  const sequence = String.raw`sequenceDiagram
    A->>B: \"quoted message\"`;
  assert.equal(compatibleFlowchartSource(sequence), sequence);
  const tab = { id: 'test', filePath: 'test.md', objectUrls: new Set() };
  const attempts = [];
  const renderer = createMarkdownRenderer({
    window: dom.window, marked,
    mermaid: { render: async (_id, text) => {
      attempts.push(text);
      if (text.includes('#quot;') || text.includes('A-->B')) return { svg: '<svg><text>ok</text></svg>' };
      throw new Error('<img src=x onerror=alert(1)> invalid syntax');
    } },
    hljs: { getLanguage: () => false }, path: { dirname: () => '.' },
    filesystem: {}, normalizeLatexDisplayMath: x => x, configureMarked() {},
    isRenderAllowed: () => true, onRendered() {}
  });
  const markdown = [source, 'invalid diagram', 'graph TD; A-->B'].map(s => '```mermaid\n' + s + '\n```').join('\n\n');
  const target = document.querySelector('main');
  await renderer.renderMarkdownInto(markdown, target, tab, false);
  assert.equal(target.querySelectorAll('.mermaid-wrapper').length, 2);
  assert.equal(target.querySelectorAll('.mermaid-error').length, 1);
  assert.equal(target.querySelector('.mermaid-error code').textContent.trim(), 'invalid diagram');
  assert.equal(target.querySelector('img'), null, 'error messages must stay plain text');
  assert.equal(attempts[0], source + '\n', 'always try unmodified source first');
  assert.match(attempts[1], /#quot;/);
  dom.window.close();
  console.log('Mermaid compatibility and isolated error recovery passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
