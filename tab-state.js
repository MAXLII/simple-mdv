function createTabState({ id, filePath, documentType, content }) {
  return {
    id,
    filePath,
    documentType,
    content,
    savedContent: content,
    dirty: false,
    watcher: null,
    objectUrls: new Set()
  };
}

function updateTabContent(tab, content) {
  tab.content = content;
  tab.dirty = tab.content !== tab.savedContent;
}

function commitSavedContent(tab, content) {
  tab.content = content;
  tab.savedContent = content;
  tab.dirty = false;
}

function needsCloseConfirmation(tab) {
  return !!(tab && tab.dirty);
}

module.exports = {
  commitSavedContent,
  createTabState,
  needsCloseConfirmation,
  updateTabContent
};
