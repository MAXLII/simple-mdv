const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { Marked } = require('marked');
const markedKatex = require('marked-katex-extension');
const katex = require('katex');
const { createMathExtension } = require('../math-rendering');
const { createMarkdownRenderer } = require('../markdown-renderer');
const { normalizeLatexDisplayMath } = require('../markdown-math');

(async () => {
  const dom = new JSDOM('<main></main>');
  const marked = new Marked(createMathExtension(markedKatex));
  const target = dom.window.document.querySelector('main');
  const renderer = createMarkdownRenderer({ window: dom.window, marked,
    mermaid: {}, hljs: { getLanguage: () => false }, path: { dirname: () => '.' },
    normalizeLatexDisplayMath, configureMarked() {}, isRenderAllowed: () => true, onRendered() {}
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

  const latexSources = [
    String.raw`T(LI_3)\dot i_{abc}=L\dot i_{\alpha\beta}`,
    String.raw`J=\begin{bmatrix}0&-1\\1&0\end{bmatrix}`,
    String.raw`\omega`, String.raw`-\omega`, String.raw`R_b=34500^2/P_b`,
    String.raw`T^{-1}`, 'Q'
  ];
  const latexInput = `对称电感满足 \\(${latexSources[0]}\\)。\n\n` +
    latexSources.slice(1).map(source => `公式\\(${source}\\)。`).join('\n\n') +
    '\n\n\\[\nx^2\n\\]\n\n兼容 $y_i$。';
  await renderer.renderMarkdownInto(latexInput, target, tab);
  assert.deepEqual([...target.querySelectorAll('annotation')].map(el => el.textContent),
    [...latexSources, 'x^2', 'y_i'], 'LaTeX source must reach KaTeX without Markdown escaping');
  assert.equal(target.querySelectorAll('.katex-display').length, 1);
  assert.equal(target.querySelector('.katex-error'), null);

  const literal = String.raw`\(x_i\)`;
  await renderer.renderMarkdownInto(
    '`' + literal + '`\n\n```tex\n' + literal + '\n```\n\n    ' + literal +
    '\n\n<span title="' + literal + '">说明</span>\n\n' + String.raw`\\(escaped\\) 未闭合 \(z`,
    target, tab);
  assert.equal(target.querySelector('.katex'), null, 'code and escaped or incomplete delimiters stay literal');
  assert.deepEqual([...target.querySelectorAll('code')].map(el => el.textContent.trim()),
    [literal, literal, literal]);
  assert.equal(target.querySelector('span').getAttribute('title'), literal);

  await renderer.renderMarkdownInto(String.raw`\(\href{javascript:alert(1)}{click}\)`, target, tab);
  assert.equal(target.querySelector('a[href^="javascript:"],[data-mdv-math]'), null);
  dom.window.close();
  console.log('Math layout passed: subscripts, accents, fractions, MathML and unsafe HTML rejection');
})().catch(error => { console.error(error); process.exitCode = 1; });
