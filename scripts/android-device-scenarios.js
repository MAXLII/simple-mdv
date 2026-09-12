// Evaluate in the debug APK with android-device-check.mjs --file.
// Operates only on the explicitly selected SimpleMDV test folder.
(async () => {
  const $ = id => document.getElementById(id);
  const checks = [];
  const assert = (condition, name) => { if (!condition) throw new Error(name); checks.push(name); };
  async function until(predicate, label, timeout = 15000) {
    const start = Date.now();
    while (!predicate()) { if (Date.now() - start > timeout) throw new Error(`等待超时：${label}`); await new Promise(resolve => setTimeout(resolve, 50)); }
  }
  const originalListener = NativeBridge.onmessage;
  const requests = new Map(); let sequence = 0;
  NativeBridge.onmessage = event => {
    const response = JSON.parse(event.data);
    if (!requests.has(response.id)) { originalListener(event); return; }
    const { resolve, reject } = requests.get(response.id); requests.delete(response.id);
    response.error ? reject(new Error(response.error)) : resolve(response.result);
  };
  const native = (method, args = {}) => new Promise((resolve, reject) => {
    const id = `qa-${++sequence}`; requests.set(id, { resolve, reject });
    NativeBridge.postMessage(JSON.stringify({ id, method, args }));
  });
  try {
    await until(() => $('tree').textContent.includes('阅读验收.md'), '测试文件树');
    assert(['SimpleMDV-Test-20260912', '内部共享存储'].includes($('root-name').textContent), '授权存储可访问');
    [...document.querySelectorAll('.tree-item')].find(button => button.textContent.includes('阅读验收.md')).click();
    await until(() => $('document-name').textContent === '阅读验收.md' && document.querySelector('.mermaid-wrapper svg'), '完整文档渲染');
    assert(document.querySelectorAll('.katex').length >= 2, '行内与独立公式渲染');
    assert(document.querySelectorAll('.hljs span').length > 0, '源码语法高亮');
    await until(() => [...document.querySelectorAll('#viewer img')].some(image => image.naturalWidth > 0), '中文路径图片');
    assert([...document.querySelectorAll('#viewer img')].some(image => image.alt.includes('文件不存在')), '缺失图片有明确提示');
    assert(!window.UNSAFE_SCRIPT_EXECUTED && !document.querySelector('#viewer script,#viewer [onerror]'), '恶意脚本及事件已移除');
    $('find').click(); await until(() => !$('search-panel').hidden, '搜索面板');
    $('search-input').value = '苹果'; $('search-input').dispatchEvent(new Event('input'));
    assert(document.querySelectorAll('.search-highlight').length === 3, '搜索三处匹配');
    $('search-next').click(); await until(() => $('search-count').textContent === '1/3', '搜索定位');
    $('search-close').click();
    [...document.querySelectorAll('#viewer a')].find(link => link.textContent === '打开子文档').click();
    await until(() => $('document-name').textContent === '第二页.md' && [...document.querySelectorAll('#viewer img')].some(i => i.naturalWidth > 0), '相对文档与图片');
    assert(true, '子目录文档跳转及上级图片读取');
    document.querySelector('#viewer a').click();
    await until(() => $('document-name').textContent === '阅读验收.md' && document.querySelector('.mermaid-wrapper svg'), '返回首页');
    await window.androidApp.checkpoint();
    const session = await native('loadSession');
    const ref = session.tabs.find(tab => tab.ref.name === '阅读验收.md').ref;
    assert(decodeURIComponent(ref.id).includes('SimpleMDV-Test-20260912'), '只操作专用测试文件');
    const baseline = await native('read', { ref });
    let rejected = false;
    try { await native('resolve', { ref, relative: '../private.md' }); } catch { rejected = true; }
    assert(rejected, '原生层拒绝越界链接');
    $('edit').click(); await until(() => !$('editor').hidden, '编辑器');
    const draft = baseline + '\n\n真机保存验证：中文草稿 2026-09-12。\n';
    $('editor').value = draft; $('editor').dispatchEvent(new Event('input'));
    await window.androidApp.checkpoint();
    const recovery = await native('loadSession');
    assert(recovery.tabs.find(tab => tab.ref.id === ref.id).draft === draft, '草稿已持久化到原生存储');
    assert(await native('read', { ref }) === baseline, '草稿没有自动覆盖源文件');
    await native('write', { ref, content: baseline + '\n外部修改\n', force: true });
    $('save').click(); await until(() => $('choice').open, '保存冲突');
    assert($('choice-title').textContent.includes('源文件已变化'), '实际源文件变化触发冲突');
    [...$('choice-buttons').children].find(button => button.textContent === '取消').click();
    await until(() => !$('choice').open, '取消冲突');
    assert((await native('read', { ref })).endsWith('外部修改\n'), '取消后不覆盖外部修改');
    $('save').click(); await until(() => $('choice').open, '再次冲突');
    [...$('choice-buttons').children].find(button => button.textContent === '覆盖源文件').click();
    await until(() => $('dirty-state').textContent === '已保存', '保存确认');
    assert(await native('read', { ref }) === draft, '真机保存后回读内容一致');
    // Leave a dedicated recoverable draft for the subsequent process-restart check.
    $('editor').value = draft + '\n进程恢复标记：RECOVERY-20260912\n';
    $('editor').dispatchEvent(new Event('input')); await window.androidApp.checkpoint();
    assert((await native('loadSession')).tabs.some(tab => tab.draft?.includes('RECOVERY-20260912')), '进程恢复测试草稿准备完成');
    return { checks, width: innerWidth, height: innerHeight, status: $('status').textContent };
  } finally { NativeBridge.onmessage = originalListener; }
})()
