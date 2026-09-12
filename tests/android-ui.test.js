const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

async function until(predicate, label) {
  for (let i = 0; i < 150; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error(`Timed out: ${label}`);
}
async function run() {
  const html = fs.readFileSync(path.join(__dirname, '../android/web/index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '../android/app/src/main/assets/app.js'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://appassets.androidplatform.net/assets/index.html', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.TextEncoder = TextEncoder; window.TextDecoder = TextDecoder;
  window.HTMLElement.prototype.scrollIntoView = function() {};
  window.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
  window.HTMLDialogElement.prototype.close = function() { this.open = false; };
  const ref = { id: 'content://fixture/main', name: '界面测试.md', writable: true };
  let disk = '# 标题\n\n苹果和苹果。\n\n```cpp\nint value = 1;\n```';
  let session = {};
  const calls = [];
  const bridge = { postMessage(raw) {
    const request = JSON.parse(raw); calls.push(request);
    queueMicrotask(() => {
      try {
        let result;
        switch (request.method) {
          case 'loadSession': result = session; break;
          case 'storageStatus': result = { allFiles: false }; break;
          case 'saveSession': session = request.args.session; result = true; break;
          case 'pickFile': result = ref; break;
          case 'read': result = disk; break;
          case 'write':
            if (!request.args.force && request.args.expected !== disk) result = { conflict: true };
            else { disk = request.args.content; result = { saved: true }; }
            break;
          default: throw new Error(`Unexpected operation: ${request.method}`);
        }
        bridge.onmessage({ data: JSON.stringify({ id: request.id, result }) });
      } catch (error) { bridge.onmessage({ data: JSON.stringify({ id: request.id, error: error.message }) }); }
    });
  } };
  window.NativeBridge = bridge;
  window.eval(app);
  const $ = id => window.document.getElementById(id);
  await until(() => calls.some(call => call.method === 'loadSession'), 'load session');
  $('open-file').click();
  await until(() => $('viewer').querySelector('h1'), 'open and render');
  assert.equal($('viewer').querySelector('h1').textContent, '标题');
  assert.ok($('viewer').querySelector('.hljs span[class^="hljs-"]'), 'shared renderer must highlight code');
  $('find').click(); await until(() => !$('search-panel').hidden, 'search panel');
  $('search-input').value = '苹果'; $('search-input').dispatchEvent(new window.Event('input'));
  assert.equal($('viewer').querySelectorAll('.search-highlight').length, 2);
  $('search-next').click(); await until(() => $('search-count').textContent === '1/2', 'search navigation');
  $('edit').click(); await until(() => !$('editor').hidden, 'editor');
  $('editor').value = '# 新草稿\n中文输入'; $('editor').dispatchEvent(new window.Event('input'));
  await until(() => session.tabs?.[0]?.draft === '# 新草稿\n中文输入', 'durable draft');
  assert.equal(disk.startsWith('# 标题'), true, 'draft saving must not overwrite source');
  disk = '# 外部修改';
  $('save').click(); await until(() => $('choice').open, 'conflict dialog');
  assert.equal(disk, '# 外部修改');
  [...$('choice-buttons').children].find(button => button.textContent === '取消').click();
  await until(() => !$('choice').open, 'cancel conflict');
  assert.equal(session.tabs[0].draft, '# 新草稿\n中文输入');
  $('save').click(); await until(() => $('choice').open, 'second conflict');
  [...$('choice-buttons').children].find(button => button.textContent === '覆盖源文件').click();
  await until(() => disk === '# 新草稿\n中文输入' && !session.tabs[0].draft, 'confirmed save');
  assert.equal($('dirty-state').textContent, '已保存');
  dom.window.close();
  console.log('Android UI integration passed: real bundle, rendering, search, draft persistence, source conflict and confirmed save.');
}
run().catch(error => { console.error(error); process.exit(1); });
