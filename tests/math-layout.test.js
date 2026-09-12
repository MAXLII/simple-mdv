const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { Marked } = require('marked');
const markedKatex = require('marked-katex-extension');
const katex = require('katex');
const { createMathExtension } = require('../math-rendering');
const { createMarkdownRenderer } = require('../markdown-renderer');

(async () => {
  const dom = new JSDOM('<main></main>');
  const marked = new Marked(createMathExtension(markedKatex));
  const target = dom.window.document.querySelector('main');
  const renderer = createMarkdownRenderer({ window: dom.window, marked,
    mermaid: {}, hljs: { getLanguage: () => false }, path: { dirname: () => '.' },
    normalizeLatexDisplayMath: x => x, configureMarked() {}, isRenderAllowed: () => true, onRendered() {}
  });
  const tab = { filePath: 'formula.md', objectUrls: new Set() };
  const inline = String.raw`\bar S_a,\bar S_b,\bar S_c`;
  const block = String.raw`v_{iz}=\frac{V_{dc}}{2}\quad x^2_i`;
  const input = `开关 $${inline}$ 的电压。\n\n$$\n${block}\n$$\n\n` +
    '<span style="position:fixed;top:0" onclick="alert(1)">unsafe HTML</span>\n\n' +
    String.raw`$\href{javascript:alert(1)}{click}$ $\htmlStyle{position:fixed}{x}$`;
  await renderer.renderMarkdownInto(input, target, tab, false);
  const placeholders = [...target.querySelectorAll('span')].filter(el => el.firstElementChild?.classList.contains('katex') || el.firstElementChild?.classList.contains('katex-display'));
  for (const [index, source] of [inline, block].entries()) {
    const expected = dom.window.document.createElement('div');
    expected.innerHTML = katex.renderToString(source, { displayMode: index === 1, throwOnError: false, trust: false, maxExpand: 1000 });
    assert.equal(placeholders[index].innerHTML, expected.innerHTML, 'KaTeX layout must survive unchanged');
  }
  assert.ok(target.querySelector('.katex [style]'), 'math positioning must be present');
  assert.ok(target.querySelector('math'), 'accessible MathML must be preserved');
  assert.equal(target.querySelector('[onclick],a[href^="javascript:"],[data-mdv-math]'), null);
  assert.ok(![...target.querySelectorAll('[style]')].some(el => /position:\s*fixed/.test(el.getAttribute('style'))));
  assert.ok(input.includes(inline));
  dom.window.close();
  console.log('Math layout passed: subscripts, accents, fractions, MathML and unsafe HTML rejection');
})().catch(error => { console.error(error); process.exitCode = 1; });
