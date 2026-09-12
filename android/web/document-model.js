const { getDocumentType } = require('../../document-support');

// Entity: an open document owns its text, source baseline, and recovery state.
// Prior: writes may fail or race with typing; only confirmed snapshots become baselines.
// Time: serial saves and versioned rendering preserve newer edits.
function createDocument(ref, content) {
  return { ref, id: ref.id, filePath: ref.name, content, savedContent: content,
    documentType: getDocumentType(ref.name), objectUrls: new Set(), scroll: 0, dirty: false };
}

function updateDocument(tab, content) {
  tab.content = content;
  tab.dirty = content !== tab.savedContent;
}

async function saveDocument(platform, tab, { force = false, target = null } = {}) {
  if (tab.saving) throw new Error('正在保存，请稍候');
  const snapshot = tab.content;
  const destination = target || tab.ref;
  tab.saving = true;
  try {
    const result = await platform.write(destination, snapshot, target ? undefined : tab.savedContent, force);
    if (result.conflict) return false;
    if (!result.saved) throw new Error('保存结果未确认，草稿已保留');
    tab.ref = destination;
    tab.id = destination.id;
    tab.filePath = destination.name;
    tab.documentType = getDocumentType(destination.name);
    tab.savedContent = snapshot;
    tab.dirty = tab.content !== snapshot;
    return true;
  } finally { tab.saving = false; }
}

function relativeLink(raw, allowSharedPaths = false) {
  const hash = raw.indexOf('#');
  const resource = hash < 0 ? raw : raw.slice(0, hash);
  const anchor = hash < 0 ? '' : decodeURIComponent(raw.slice(hash + 1));
  const path = decodeURIComponent(resource);
  const unsafe = allowSharedPaths
    ? /^(?:(?!file:)[a-z][a-z0-9+.-]*:|\/\/|\\\\)/i.test(path)
    : /^(?:[a-z][a-z0-9+.-]*:|\/|\\)/i.test(path) || path.includes('\\');
  if (unsafe || path.includes('\0')) {
    throw new Error('不允许访问授权目录以外的路径');
  }
  return { path, anchor };
}

function snapshotSession(tabs, active, preferences, root, recent) {
  return { version: 1, active: active?.id, preferences, root, recent: recent.slice(0, 20),
    tabs: tabs.map(tab => ({ ref: tab.ref, scroll: tab.scroll,
      ...(tab.dirty ? { draft: tab.content, baseline: tab.savedContent } : {}) })) };
}

module.exports = { createDocument, updateDocument, saveDocument, relativeLink, snapshotSession };
