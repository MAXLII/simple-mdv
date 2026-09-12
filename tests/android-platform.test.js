const assert = require('node:assert/strict');
const { createDocument, updateDocument, saveDocument, relativeLink, snapshotSession } = require('../android/web/document-model');
const { createAndroidPlatform } = require('../platform/android');

async function run() {
  const ref = { id: 'content://provider/document/1', name: '中文.md', writable: true };
  const tab = createDocument(ref, '原文');
  updateDocument(tab, '草稿');
  await assert.rejects(saveDocument({ write: async () => { throw new Error('写入失败'); } }, tab), /写入失败/);
  assert.equal(tab.content, '草稿'); assert.equal(tab.savedContent, '原文'); assert.equal(tab.dirty, true);
  assert.equal(await saveDocument({ write: async () => ({ conflict: true }) }, tab), false);
  assert.equal(tab.savedContent, '原文'); assert.equal(tab.dirty, true);

  let release;
  const saving = saveDocument({ write: (_ref, snapshot, expected) => {
    assert.equal(snapshot, '草稿'); assert.equal(expected, '原文');
    return new Promise(resolve => { release = resolve; });
  } }, tab);
  await assert.rejects(saveDocument({}, tab), /正在保存/);
  updateDocument(tab, '保存期间的新编辑'); release({ saved: true });
  assert.equal(await saving, true);
  assert.equal(tab.savedContent, '草稿'); assert.equal(tab.content, '保存期间的新编辑'); assert.equal(tab.dirty, true);
  const state = snapshotSession([tab], tab, { font: 17 }, null, [ref]);
  assert.equal(state.tabs[0].draft, '保存期间的新编辑'); assert.equal(state.tabs[0].baseline, '草稿');
  const destination = { ...ref, id: 'content://provider/document/2', name: '另存.md' };
  await saveDocument({ write: async () => ({ saved: true }) }, tab, { target: destination });
  assert.equal(tab.ref, destination); assert.equal(tab.dirty, false);
  assert.equal(snapshotSession([tab], tab, {}, null, []).tabs[0].draft, undefined);

  assert.deepEqual(relativeLink('../图片/图%201.png#标题'), { path: '../图片/图 1.png', anchor: '标题' });
  for (const invalid of ['content://other/private', 'file:///data/private', '//example.com/a', '%2Fetc/a', '..%5Csecret', '%00', 'javascript:alert(1)']) {
    assert.throws(() => relativeLink(invalid), /不允许/);
  }
  assert.throws(() => relativeLink('%E0%A4%A'), URIError);
  assert.equal(relativeLink('/storage/emulated/0/Documents/image.png', true).path, '/storage/emulated/0/Documents/image.png');
  assert.equal(relativeLink('file:///sdcard/Documents/image.png', true).path, 'file:///sdcard/Documents/image.png');
  assert.equal(relativeLink('images\\photo.png', true).path, 'images\\photo.png');
  for (const path of ['javascript:alert(1)', 'content://private/x', '//host/share', 'C:\\private']) assert.throws(() => relativeLink(path, true));

  const requests = [];
  const bridge = { postMessage: value => requests.push(JSON.parse(value)) };
  const platform = createAndroidPlatform(bridge);
  const first = platform.read(ref), second = platform.list(ref);
  bridge.onmessage({ data: JSON.stringify({ id: requests[1].id, result: ['folder'] }) });
  bridge.onmessage({ data: JSON.stringify({ id: requests[0].id, result: 'text' }) });
  assert.equal(await first, 'text'); assert.deepEqual(await second, ['folder']);
  const failure = platform.read(ref);
  bridge.onmessage({ data: JSON.stringify({ id: requests[2].id, error: '授权失效' }) });
  await assert.rejects(failure, /授权失效/);
  bridge.onmessage({ data: '{invalid json' });
  bridge.onmessage({ data: JSON.stringify({ id: requests[2].id, result: 'late response' }) });
  console.log('Android platform tests passed: conflicts, failed saves, concurrent edits, drafts, URI inputs, reply correlation.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
