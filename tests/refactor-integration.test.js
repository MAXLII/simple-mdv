const assert = require('assert');
const { createOrderedQueue, createRenderCoordinator } = require('../async-lifecycle');
const { confirmAndDisposeTab, disposeTabResources, saveTab } = require('../document-lifecycle');
const { classifyLink } = require('../link-support');
const { setupPreviewLinkHandling } = require('../link-navigation');
const { consumeOpenRequestDirectory } = require('../open-request-queue');
const { createTabState, updateTabContent } = require('../tab-state');

async function run() {
  const tab = createTabState({
    id: 'tab-a',
    filePath: 'A.md',
    documentType: { kind: 'markdown' },
    content: 'saved'
  });
  updateTabContent(tab, 'draft');
  await assert.rejects(() => saveTab(tab, 'draft', async () => {
    throw new Error('disk full');
  }), /disk full/);
  assert.strictEqual(tab.dirty, true, 'save failure must preserve the dirty state');
  assert.strictEqual(tab.savedContent, 'saved', 'save failure must preserve the last disk-backed content');
  await saveTab(tab, 'draft', async () => undefined);
  assert.strictEqual(tab.dirty, false);
  assert.strictEqual(tab.savedContent, 'draft');

  updateTabContent(tab, 'save snapshot');
  await saveTab(tab, 'save snapshot', async () => updateTabContent(tab, 'typed while saving'));
  assert.strictEqual(tab.savedContent, 'save snapshot');
  assert.strictEqual(tab.content, 'typed while saving');
  assert.strictEqual(tab.dirty, true, 'edits made during a successful write must remain dirty');

  updateTabContent(tab, 'new draft');
  let disposed = false;
  assert.strictEqual(await confirmAndDisposeTab(tab, () => false, async () => {
    disposed = true;
  }), false);
  assert.strictEqual(disposed, false, 'cancelled dirty close must not dispose the tab');

  tab.watcher = 42;
  tab.objectUrls.add('blob:one');
  const released = [];
  await disposeTabResources(tab, async id => released.push(`watcher:${id}`), url => released.push(url));
  assert.deepStrictEqual(released, ['watcher:42', 'blob:one']);
  assert.strictEqual(tab.watcher, null);
  assert.strictEqual(tab.objectUrls.size, 0);

  const renders = createRenderCoordinator();
  const first = renders.begin('preview');
  const second = renders.begin('preview');
  assert.strictEqual(renders.isCurrent(first), false, 'an older render must not remain current');
  assert.strictEqual(renders.isCurrent(second), true);
  renders.invalidate('preview');
  assert.strictEqual(renders.isCurrent(second), false, 'closing/switching must invalidate pending renders');

  const executionOrder = [];
  const enqueue = createOrderedQueue(async value => {
    await new Promise(resolve => setTimeout(resolve, value === 'first' ? 10 : 0));
    executionOrder.push(value);
  });
  await Promise.all([enqueue('first'), enqueue('second'), enqueue('third')]);
  assert.deepStrictEqual(executionOrder, ['first', 'second', 'third']);

  const requestFiles = new Map([
    ['queue\\0002.request', 'B.md\nC.md\n'],
    ['queue\\0001.request', 'A.md\n']
  ]);
  const removed = [];
  const opened = [];
  await consumeOpenRequestDirectory('queue', {
    readDirectory: async () => [
      { entry: '0002.request' }, { entry: 'ignored.tmp' }, { entry: '0001.request' }
    ],
    readFile: async requestPath => requestFiles.get(requestPath),
    removeFile: async requestPath => removed.push(requestPath),
    resolve: (directory, name) => `${directory}\\${name}`
  }, async paths => opened.push(...paths));
  assert.deepStrictEqual(opened, ['A.md', 'B.md', 'C.md']);
  assert.deepStrictEqual(removed, ['queue\\0001.request', 'queue\\0002.request']);

  const roots = [{}, {}];
  roots.forEach(root => {
    root.addEventListener = (_name, handler) => { root.handler = handler; };
  });
  const linkedFiles = [];
  setupPreviewLinkHandling({
    roots,
    classifyLink,
    getCurrentFile: () => 'C:\\docs\\current.md',
    isSupportedDocument: () => true,
    loadFile: async filePath => { linkedFiles.push(filePath); return true; },
    openExternal: async () => undefined,
    path: {
      basename: value => value.split(/[\\/]/).pop(),
      dirname: value => value.slice(0, value.lastIndexOf('\\')),
      isAbsolute: value => /^[a-z]:[\\/]/i.test(value),
      resolve: (base, value) => `${base}\\${value}`
    },
    safeDecodeUri: value => value,
    scrollToAnchor: () => undefined,
    notify: message => { throw new Error(message); }
  });
  let prevented = false;
  await roots[1].handler({
    currentTarget: roots[1],
    preventDefault: () => { prevented = true; },
    target: { closest: () => ({ getAttribute: () => 'next.md#details' }) }
  });
  assert.strictEqual(prevented, true, 'compare preview links must be intercepted');
  assert.deepStrictEqual(linkedFiles, ['C:\\docs\\next.md']);

  console.log('refactor integration tests passed');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
