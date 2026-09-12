const assert = require('assert');
const { JSDOM } = require('jsdom');
const { createMarkdownRenderer } = require('../markdown-renderer');
const { highlightTextMatches } = require('../search-support');

async function run() {
  const dom = new JSDOM('<main id="preview"></main>');
  const preview = dom.window.document.getElementById('preview');
  const tab = {
    id: 'security-tab',
    filePath: 'C:\\docs\\unsafe.md',
    documentType: { kind: 'markdown' },
    objectUrls: new Set()
  };
  const marked = {
    parse: () => [
      '<p onmouseover="alert(1)">safe text</p>',
      '<img src="x" onerror="alert(1)">',
      '<a href="javascript:alert(1)">unsafe link</a>',
      '<script>alert(1)</script>',
      '<pre><code class="language-mermaid">graph TD; A-->B</code></pre>'
    ].join('')
  };
  const renderer = createMarkdownRenderer({
    window: dom.window,
    marked,
    mermaid: {
      render: async () => ({
        svg: '<svg onload="alert(1)"><script>alert(1)</script><foreignObject>bad</foreignObject><text>diagram</text>' +
          '<path class="messageLine0" style="fill:none;stroke:red" d="M0 0 C40 0 40 30 0 30"/>' +
          '<path class="messageLine1" style="fill:none" d="M0 40 C40 40 40 70 0 70"/>' +
          '<defs><marker id="arrow"><path fill="#333" d="M0 0 L10 5 L0 10 Z"/></marker></defs></svg>'
      })
    },
    hljs: { getLanguage: () => false },
    filesystem: { readBinaryFile: async () => new Uint8Array() },
    path: {
      dirname: () => 'C:\\docs',
      extname: () => '.png',
      isAbsolute: () => false,
      resolve: (_base, value) => value
    },
    normalizeLatexDisplayMath: value => value,
    configureMarked: () => undefined,
    isRenderAllowed: candidate => candidate === tab,
    onRendered: () => undefined
  });

  await renderer.renderMarkdownInto('ignored', preview, tab, false);
  const html = preview.innerHTML;
  assert.doesNotMatch(html, /<script|onerror|onmouseover|onload|javascript:|foreignObject/i);
  assert.match(html, /safe text/);
  assert.match(html, /diagram/);
  assert.strictEqual(preview.querySelector('path.messageLine0').getAttribute('fill'), 'none');
  assert.strictEqual(preview.querySelector('path.messageLine1').getAttribute('fill'), 'none');
  assert.strictEqual(preview.querySelector('marker path').getAttribute('fill'), '#333', 'arrowheads must remain filled');
  assert.strictEqual(preview.querySelector('[style]'), null, 'raw inline styles must remain forbidden');

  preview.innerHTML = '<p>&lt;img src=x onerror=alert(1)&gt; value value</p>';
  const matches = highlightTextMatches(preview, '<img src=x onerror=alert(1)>', dom.window.document);
  assert.strictEqual(matches.length, 1);
  assert.strictEqual(preview.querySelectorAll('img').length, 0, 'search highlighting must not parse matched text as HTML');
  assert.strictEqual(matches[0].textContent, '<img src=x onerror=alert(1)>');

  console.log('security rendering tests passed');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
