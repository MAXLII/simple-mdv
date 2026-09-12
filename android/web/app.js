import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import { createMathExtension } from '../../math-rendering';
import mermaid from 'mermaid';
import hljs from 'highlight.js/lib/core';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import { createAndroidPlatform } from '../../platform/android';
import { createMarkdownRenderer } from '../../markdown-renderer';
import { normalizeLatexDisplayMath } from '../../markdown-math';
import { highlightTextMatches } from '../../search-support';
import { isSupportedDocument } from '../../document-support';
import { createDocument, updateDocument, saveDocument, relativeLink, snapshotSession } from './document-model';

const $ = id => document.getElementById(id);
const platform = createAndroidPlatform(window.NativeBridge);
const tabs = [];
let active = null, root = null, recent = [], preferences = { dark: false, font: 17 };
let editing = false, composing = false, ready = false, allFilesAllowed = false, draftTimer, renderTimer, toastTimer;
let highlights = [], matchIndex = -1, history = [], historyIndex = -1;
let dialogResolve = null, checkpointChain = Promise.resolve(), actionChain = Promise.resolve();
hljs.registerLanguage('c', c); hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('javascript', javascript); hljs.registerLanguage('typescript', javascript); hljs.registerLanguage('json', json);
marked.use(createMathExtension(markedKatex));
marked.setOptions({ gfm: true, breaks: true });

function notify(message) {
  $('toast').textContent = message; $('toast').hidden = false; $('status').textContent = message;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 6500);
}
function action(id, callback) {
  $(id).addEventListener('click', () => {
    actionChain = actionChain.then(callback).catch(error => notify(error.message));
  });
}
function choose(title, message, options) {
  if (dialogResolve) return Promise.resolve('cancel');
  $('choice-title').textContent = title; $('choice-message').textContent = message;
  $('choice-buttons').replaceChildren();
  return new Promise(resolve => {
    dialogResolve = resolve;
    for (const [value, label] of options) {
      const button = document.createElement('button'); button.textContent = label;
      if (value === options[options.length - 1][0]) button.className = 'primary';
      button.onclick = () => finishChoice(value); $('choice-buttons').append(button);
    }
    $('choice').showModal();
  });
}
function finishChoice(value) {
  const resolve = dialogResolve; dialogResolve = null; $('choice').close(); resolve?.(value);
}
$('choice').addEventListener('cancel', event => { event.preventDefault(); finishChoice('cancel'); });

const renderer = createMarkdownRenderer({
  window, marked, mermaid, hljs, normalizeLatexDisplayMath, configureMarked() {},
  isRenderAllowed: tab => tab === active && tabs.includes(tab),
  onRendered() { buildToc(); search(); },
  async loadLocalImage(tab, source) {
    const { path } = relativeLink(source, allFilesAllowed);
    const ref = await platform.resolve(tab.ref, path);
    const bytes = await platform.binary(ref);
    const extension = ref.name.split('.').pop().toLowerCase();
    const type = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' }[extension];
    if (!type) throw new Error('不支持的图片类型');
    return URL.createObjectURL(new Blob([bytes], { type }));
  }
});
function applyPreferences() {
  document.body.classList.toggle('dark', preferences.dark);
  document.documentElement.style.setProperty('--font', `${preferences.font}px`);
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true, htmlLabels: false, flowchart: { htmlLabels: false }, theme: preferences.dark ? 'dark' : 'default' });
}
function rememberScroll() { if (active && !$('viewer').hidden) active.scroll = $('viewer').scrollTop; }
function checkpoint() {
  if (!ready) return Promise.resolve();
  clearTimeout(draftTimer); rememberScroll();
  const snapshot = snapshotSession(tabs, active, preferences, root, recent);
  checkpointChain = checkpointChain.catch(() => {}).then(() => platform.saveSession(snapshot));
  return checkpointChain;
}
function scheduleCheckpoint() {
  clearTimeout(draftTimer); draftTimer = setTimeout(() => checkpoint().catch(error => notify(error.message)), 350);
}
function updateChrome() {
  $('welcome').hidden = !!active; $('document').hidden = !active;
  $('tabs').replaceChildren();
  for (const tab of tabs) {
    const wrapper = document.createElement('div'); wrapper.className = `tab${tab === active ? ' active' : ''}`;
    const button = document.createElement('button'); button.className = 'tab-name';
    button.textContent = `${tab.dirty ? '• ' : ''}${tab.ref.name}`;
    button.onclick = () => activate(tab).catch(error => notify(error.message));
    const close = document.createElement('button'); close.className = 'tab-close'; close.textContent = '×';
    close.setAttribute('aria-label', `关闭 ${tab.ref.name}`); close.onclick = () => closeTab(tab).catch(error => notify(error.message));
    wrapper.append(button, close); $('tabs').append(wrapper);
  }
  if (active) {
    $('document-name').textContent = active.ref.name;
    $('dirty-state').textContent = active.dirty ? '未保存 · 自动保留草稿' : (active.ref.writable ? '已保存' : '只读');
    $('save').disabled = !active.ref.writable || active.saving;
    $('edit').textContent = editing ? '阅读' : '编辑';
    $('editor').hidden = !editing; $('surfaces').classList.toggle('editing', editing);
  }
}
async function render() {
  const tab = active;
  if (!tab) return;
  const started = performance.now();
  const committed = await renderer.renderDocument(tab.content, $('viewer'), tab, true);
  if (committed && active === tab) $('status').textContent = `${tab.ref.name} · ${tab.content.length.toLocaleString()} 字符 · 渲染 ${Math.round(performance.now() - started)} ms`;
}
async function activate(tab, addHistory = true) {
  if (active !== tab) { rememberScroll(); if (active) renderer.releaseTab(active); $('viewer').replaceChildren(); }
  active = tab; editing = false;
  $('editor').value = tab.content; updateChrome();
  if (addHistory && history[historyIndex] !== tab.id) { history = history.slice(0, historyIndex + 1); history.push(tab.id); historyIndex = history.length - 1; }
  await render();
  if (active === tab) $('viewer').scrollTop = tab.scroll || 0;
  scheduleCheckpoint();
}
async function open(ref) {
  if (!ref) return;
  if (!isSupportedDocument(ref.name)) throw new Error('暂不支持此文件类型，请选择 Markdown、文本或源码');
  let tab = tabs.find(item => item.id === ref.id);
  if (!tab) {
    if (tabs.length >= 12) throw new Error('最多同时打开 12 个标签，请先关闭部分文档');
    tab = createDocument(ref, await platform.read(ref)); tabs.push(tab);
  }
  recent = [ref, ...recent.filter(item => item.id !== ref.id)].slice(0, 20);
  document.body.classList.remove('drawer-open');
  await activate(tab); buildRecent();
}
async function save(tab = active, saveAs = false) {
  if (!tab) return false;
  await checkpoint();
  let target = saveAs || !tab.ref.writable ? await platform.createFile(tab.ref.name) : null;
  if ((saveAs || !tab.ref.writable) && !target) return false;
  const oldId = tab.id;
  let saved = await saveDocument(platform, tab, { target });
  if (!saved) {
    const decision = await choose('源文件已变化', '其他应用修改了这个文件。你的编辑仍保留在草稿中。',
      [['cancel', '取消'], ['copy', '另存为'], ['overwrite', '覆盖源文件']]);
    if (decision === 'copy') return save(tab, true);
    if (decision === 'overwrite') saved = await saveDocument(platform, tab, { force: true });
  }
  if (saved) {
    history = history.map(id => id === oldId ? tab.id : id);
    recent = [tab.ref, ...recent.filter(ref => ref.id !== oldId && ref.id !== tab.id)].slice(0, 20);
    updateChrome(); await checkpoint(); notify('文件已保存并校验');
  }
  return saved;
}
async function mayLeave(tab) {
  if (!tab.dirty) return true;
  const result = await choose('保留这次修改？', tab.ref.name, [['cancel', '取消'], ['discard', '放弃修改'], ['save', '保存']]);
  if (result === 'save') {
    const saved = await save(tab);
    if (saved && tab.dirty) notify('保存期间有新的编辑，已保留当前文档');
    return saved && !tab.dirty;
  }
  if (result === 'discard') { updateDocument(tab, tab.savedContent); return true; }
  return false;
}
async function closeTab(tab) {
  if (tab.saving) { notify('正在保存，请稍候'); return; }
  if (!await mayLeave(tab)) return;
  renderer.releaseTab(tab); tabs.splice(tabs.indexOf(tab), 1);
  history = history.filter(id => id !== tab.id); historyIndex = history.length - 1;
  if (active === tab) { active = null; if (tabs.length) await activate(tabs[tabs.length - 1]); }
  updateChrome(); await checkpoint();
}
function showSide(name) {
  for (const id of ['tree', 'toc', 'recent']) $(id).hidden = id !== name;
  for (const [id, value] of [['show-files', 'tree'], ['show-toc', 'toc'], ['show-recent', 'recent']]) $(id).classList.toggle('selected', value === name);
}
async function buildTree(parent = root, destination = $('tree'), depth = 0) {
  if (!parent) return;
  const entries = await platform.list(parent); destination.replaceChildren();
  for (const ref of entries) {
    if (!ref.directory && !isSupportedDocument(ref.name)) continue;
    const item = document.createElement('div'); const button = document.createElement('button');
    button.className = 'tree-item'; button.style.paddingLeft = `${12 + depth * 14}px`;
    button.textContent = `${ref.directory ? '▸' : '·'}  ${ref.name}`; item.append(button);
    let children = null;
    button.onclick = async () => {
      try {
        if (!ref.directory) { await open(ref); return; }
        if (children) { children.hidden = !children.hidden; return; }
        children = document.createElement('div'); item.append(children);
        await buildTree(ref, children, depth + 1);
      } catch (error) { children = null; notify(error.message); }
    };
    destination.append(item);
  }
  if (!destination.childElementCount) { const hint = document.createElement('p'); hint.className = 'muted'; hint.textContent = '此目录没有可阅读的文档'; destination.append(hint); }
}
function buildToc() {
  $('toc').replaceChildren();
  for (const [index, heading] of [...$('viewer').querySelectorAll('h1,h2,h3,h4,h5,h6')].entries()) {
    if (!heading.id) heading.id = `heading-${index}`;
    const item = document.createElement('button'); item.className = 'toc-item'; item.textContent = heading.textContent;
    item.style.paddingLeft = `${12 + (Number(heading.tagName[1]) - 1) * 12}px`;
    item.onclick = () => { heading.scrollIntoView(); document.body.classList.remove('drawer-open'); }; $('toc').append(item);
  }
}
function buildRecent() {
  $('recent').replaceChildren();
  for (const ref of recent) {
    const button = document.createElement('button'); button.className = 'recent-item'; button.textContent = ref.name;
    button.onclick = () => open(ref).catch(error => notify(error.message)); $('recent').append(button);
  }
}
function search() {
  for (const mark of $('viewer').querySelectorAll('.search-highlight')) mark.replaceWith(document.createTextNode(mark.textContent));
  $('viewer').normalize();
  highlights = $('search-panel').hidden ? [] : highlightTextMatches($('viewer'), $('search-input').value, document, window.NodeFilter);
  matchIndex = -1; $('search-count').textContent = highlights.length ? `${highlights.length} 处` : '无匹配';
}
function nextMatch(step) {
  if (!highlights.length) return;
  highlights[matchIndex]?.classList.remove('current');
  matchIndex = (matchIndex + step + highlights.length) % highlights.length;
  highlights[matchIndex].classList.add('current'); highlights[matchIndex].scrollIntoView({ block: 'center' });
  $('search-count').textContent = `${matchIndex + 1}/${highlights.length}`;
}
async function back() {
  if ($('diagram').open) { $('diagram').close(); return; }
  if (dialogResolve) { finishChoice('cancel'); return; }
  if (document.body.classList.contains('drawer-open')) { document.body.classList.remove('drawer-open'); return; }
  if (!$('search-panel').hidden) { $('search-panel').hidden = true; search(); return; }
  if (editing) {
    if (!await mayLeave(active)) return;
    editing = false; $('editor').value = active.content; updateChrome(); await render(); await checkpoint(); return;
  }
  if (historyIndex > 0) { const tab = tabs.find(item => item.id === history[--historyIndex]); if (tab) { await activate(tab, false); return; } }
  for (const tab of tabs) if (!await mayLeave(tab)) return;
  await checkpoint(); await platform.call('finish');
}

action('open-file', async () => open(await platform.pickFile()));
async function refreshStoragePermission() {
  const status = await platform.call('storageStatus');
  allFilesAllowed = status.allFiles;
  $('all-files').textContent = status.allFiles ? '浏览内部存储' : '全部文件访问';
  if (status.allFiles && active) await render();
  return status.allFiles;
}
action('all-files', async () => {
  if (!await refreshStoragePermission()) { await checkpoint(); await platform.call('requestAllFiles'); return; }
  root = await platform.call('storageRoot'); $('root-name').textContent = root.name; showSide('tree');
  document.body.classList.remove('sidebar-hidden'); document.body.classList.add('drawer-open');
  await buildTree(); await checkpoint();
});
window.addEventListener('native-resume', () => refreshStoragePermission().catch(error => notify(error.message)));
action('welcome-open', async () => open(await platform.pickFile()));
action('open-folder', async () => {
  const selected = await platform.pickFolder(); if (!selected) return;
  root = selected; $('root-name').textContent = root.name; showSide('tree');
  document.body.classList.remove('sidebar-hidden'); document.body.classList.add('drawer-open');
  await buildTree(); await checkpoint();
});
action('menu', () => { if (innerWidth < 840) document.body.classList.toggle('drawer-open'); else document.body.classList.toggle('sidebar-hidden'); });
action('sidebar-close', () => { document.body.classList.remove('drawer-open'); if (innerWidth >= 840) document.body.classList.add('sidebar-hidden'); });
action('scrim', () => document.body.classList.remove('drawer-open'));
action('show-files', () => showSide('tree')); action('show-toc', () => showSide('toc')); action('show-recent', () => { showSide('recent'); buildRecent(); });
action('theme', async () => { preferences.dark = !preferences.dark; applyPreferences(); await render(); await checkpoint(); });
action('font-down', () => { preferences.font = Math.max(12, preferences.font - 1); applyPreferences(); scheduleCheckpoint(); });
action('font-up', () => { preferences.font = Math.min(30, preferences.font + 1); applyPreferences(); scheduleCheckpoint(); });
action('edit', async () => { editing = !editing; updateChrome(); if (editing) $('editor').focus(); else await render(); });
action('save', () => save()); action('save-as', () => save(active, true));
action('find', () => { $('search-panel').hidden = false; $('search-input').focus(); search(); });
action('search-close', () => { $('search-panel').hidden = true; search(); });
action('search-prev', () => nextMatch(-1)); action('search-next', () => nextMatch(1));
action('diagram-close', () => $('diagram').close());
$('search-input').addEventListener('input', search);
function edited() {
  if (!active) return;
  updateDocument(active, $('editor').value); renderer.invalidate($('viewer'));
  updateChrome(); scheduleCheckpoint(); clearTimeout(renderTimer);
  if (!composing) renderTimer = setTimeout(() => render().catch(error => notify(error.message)), 450);
}
$('editor').addEventListener('compositionstart', () => { composing = true; clearTimeout(renderTimer); });
$('editor').addEventListener('compositionend', () => { composing = false; edited(); });
$('editor').addEventListener('input', edited);
$('viewer').addEventListener('scroll', scheduleCheckpoint, { passive: true });
$('viewer').addEventListener('click', async event => {
  const link = event.target.closest('a');
  if (link) {
    event.preventDefault();
    try {
      const raw = link.getAttribute('href') || '';
      if (/^https?:|^mailto:/i.test(raw)) { await platform.openExternal(raw); return; }
      const { path, anchor } = relativeLink(raw, allFilesAllowed);
      if (path) await open(await platform.resolve(active.ref, path));
      if (anchor) {
        const heading = [...$('viewer').querySelectorAll('[id],h1,h2,h3,h4,h5,h6')].find(node => node.id === anchor || node.textContent === anchor || node.textContent.toLowerCase().replace(/\s+/g, '-') === anchor);
        heading?.scrollIntoView();
      }
    } catch (error) { notify(error.message); }
  }
  const diagram = event.target.closest('.mermaid-wrapper');
  if (diagram && !link) { $('diagram-content').replaceChildren(diagram.cloneNode(true)); $('diagram').showModal(); }
});
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); save().catch(error => notify(error.message)); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); $('find').click(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) checkpoint().catch(error => notify(error.message)); });
window.androidApp = { checkpoint: () => checkpoint().catch(error => notify(error.message)), back: () => back().catch(error => notify(error.message)) };

async function initialize() {
  const session = await platform.loadSession();
  preferences = { dark: !!session.preferences?.dark, font: Math.min(30, Math.max(12, Number(session.preferences?.font) || 17)) };
  applyPreferences(); root = session.root || null; recent = session.recent || [];
  if (root) { $('root-name').textContent = root.name; await buildTree().catch(error => notify(error.message)); }
  buildRecent();
  const hasDraft = (session.tabs || []).some(tab => typeof tab.draft === 'string');
  let restore = true;
  if (hasDraft) {
    const decision = await choose('发现未保存草稿', '上次的编辑尚未写入源文件。恢复后可以继续编辑或另存。', [['cancel', '稍后处理'], ['discard', '放弃草稿'], ['restore', '恢复草稿']]);
    if (decision === 'cancel') { await platform.call('finish'); return; }
    restore = decision === 'restore';
  }
  for (const item of (session.tabs || []).slice(0, 12)) {
    try {
      let source;
      try { source = await platform.read(item.ref); }
      catch (error) { if (restore && typeof item.draft === 'string') source = item.baseline || ''; else throw error; notify(error.message); }
      const tab = createDocument(item.ref, source); tab.scroll = item.scroll || 0;
      if (restore && typeof item.draft === 'string') { tab.savedContent = item.baseline ?? source; updateDocument(tab, item.draft); }
      tabs.push(tab);
    } catch (error) { notify(`${item.ref.name}：${error.message}`); }
  }
  ready = true;
  await refreshStoragePermission();
  if (tabs.length) await activate(tabs.find(tab => tab.id === session.active) || tabs[0]);
  updateChrome();
}
initialize().catch(error => notify(`恢复失败，原有草稿未覆盖：${error.message}`));
