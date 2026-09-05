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
        svg: '<svg onload="alert(1)"><script>alert(1)</script><foreignObject>bad</foreignObject><text>diagram</text></svg>'
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
