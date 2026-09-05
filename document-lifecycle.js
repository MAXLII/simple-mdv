const { needsCloseConfirmation, updateTabContent } = require('./tab-state');

async function saveTab(tab, content, writeFile) {
  updateTabContent(tab, content);
  await writeFile(tab.filePath, content);
  tab.savedContent = content;
  tab.dirty = tab.content !== tab.savedContent;
  return true;
}

async function disposeTabResources(tab, removeWatcher, revokeObjectUrl) {
  let watcherError = null;
  if (tab.watcher !== null && tab.watcher !== undefined) {
    const watcher = tab.watcher;
    tab.watcher = null;
    try {
      await removeWatcher(watcher);
    } catch (error) {
      watcherError = error;
    }
  }

  for (const url of tab.objectUrls) {
    revokeObjectUrl(url);
  }
  tab.objectUrls.clear();
  if (watcherError) throw watcherError;
}

async function confirmAndDisposeTab(tab, confirmClose, dispose) {
  if (needsCloseConfirmation(tab) && !confirmClose(tab)) {
    return false;
  }
  await dispose(tab);
  return true;
}

function createFileWatcherManager({ events, filesystem, path, getOpenTabs, applyContent, onReload, onError }) {
  async function setup(tab) {
    try {
      const watcher = await filesystem.createWatcher(path.dirname(tab.filePath));
      if (!getOpenTabs().includes(tab)) {
        await filesystem.removeWatcher(watcher);
        return;
      }
      tab.watcher = watcher;
    } catch (error) {
      onError('Error setting up file watcher', error);
    }
  }

  events.on('watchFile', async event => {
    if (event.detail.action !== 'modified') return;
    const changedPath = path.resolve(event.detail.dir, event.detail.filename);
    const matchingTabs = getOpenTabs().filter(tab =>
      tab.watcher === event.detail.id &&
      tab.filePath.toLowerCase() === changedPath.toLowerCase() &&
      !tab.dirty
    );

    for (const tab of matchingTabs) {
      try {
        const watcher = tab.watcher;
        const content = await filesystem.readFile(tab.filePath);
        if (!getOpenTabs().includes(tab) || tab.watcher !== watcher || tab.dirty) continue;
        applyContent(tab, content);
        await onReload(tab, content);
      } catch (error) {
        onError('Error reloading file', error);
      }
    }
  });

  return { setup };
}

module.exports = {
  confirmAndDisposeTab,
  createFileWatcherManager,
  disposeTabResources,
  saveTab
};
