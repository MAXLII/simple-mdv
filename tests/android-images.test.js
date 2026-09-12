const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { createMarkdownRenderer } = require('../markdown-renderer');

(async () => {
  const dom = new JSDOM('<article></article>');
  const target = dom.window.document.querySelector('article');
  const tab = { id: 'image-test', documentType: { kind: 'markdown' }, objectUrls: new Set() };
  const calls = [];
  const renderer = createMarkdownRenderer({
    window: dom.window,
    marked: { parse: () => '<img src="file:///sdcard/test.png" onerror="alert(1)"><img src="assets/photo.png"><img src="/storage/emulated/0/image.png"><img src="missing.png">' },
    mermaid: {}, hljs: { getLanguage: () => false }, configureMarked() {},
    normalizeLatexDisplayMath: value => value, isRenderAllowed: () => true, onRendered() {},
    loadLocalImage: async (_tab, source) => {
      calls.push(source);
      if (source === 'missing.png') throw new Error('文件不存在');
      return URL.createObjectURL(new Blob(['image data']));
    }
  });
  await renderer.renderDocument('', target, tab);
  assert.deepEqual(calls, ['file:///sdcard/test.png', 'assets/photo.png', '/storage/emulated/0/image.png', 'missing.png']);
  const images = [...target.querySelectorAll('img')];
  assert.ok(images.slice(0, 3).every(image => image.getAttribute('src').startsWith('blob:')));
  assert.ok(images.every(image => !image.hasAttribute('onerror') && !image.hasAttribute('data-mdv-file-src')));
  assert.ok(images[3].alt.includes('文件不存在'));
  renderer.releaseTab(tab); assert.equal(tab.objectUrls.size, 0);
  dom.window.close();
  console.log('Android image tests passed: relative, absolute, file URI, missing resource and URL cleanup.');
})().catch(error => { console.error(error); process.exitCode = 1; });
