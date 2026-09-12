// Entity: correlated requests to the trusted Android host.
// Prior: every request can fail; pending writes must not be reported as successful.
// Time: replies settle once, and each request has a bounded wait.
function createAndroidPlatform(bridge) {
  const pending = new Map();
  let sequence = 0;
  bridge.onmessage = event => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(message.error));
    else request.resolve(message.result);
  };
  function call(method, args = {}) {
    return new Promise((resolve, reject) => {
      const id = String(++sequence);
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('操作超时；写入结果尚未确认，请保留草稿并重试'));
      }, /^(pick|create)/.test(method) ? 180000 : 60000);
      pending.set(id, { resolve, reject, timer });
      try { bridge.postMessage(JSON.stringify({ id, method, args })); }
      catch (error) { pending.delete(id); clearTimeout(timer); reject(error); }
    });
  }
  return {
    call,
    pickFile: () => call('pickFile'),
    pickFolder: () => call('pickFolder'),
    createFile: name => call('createFile', { name }),
    list: ref => call('list', { ref }),
    read: ref => call('read', { ref }),
    write: (ref, content, expected, force = false) => call('write', { ref, content, expected, force }),
    resolve: (ref, relative) => call('resolve', { ref, relative }),
    binary: async ref => {
      const value = atob(await call('binary', { ref }));
      return Uint8Array.from(value, char => char.charCodeAt(0));
    },
    openExternal: url => call('openExternal', { url }),
    loadSession: () => call('loadSession'),
    saveSession: session => call('saveSession', { session })
  };
}
module.exports = { createAndroidPlatform };
