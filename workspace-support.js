const IGNORED_DIRECTORY_NAMES = new Set([
  '.git',
  '.svn',
  '.hg',
  'node_modules',
  'dist',
  'out',
  'build',
  '.cache'
]);

function isDirectoryEntry(entry) {
  return String(entry && entry.type || '').toLowerCase().includes('directory');
}

function shouldShowWorkspaceEntry(entry, isSupportedDocument) {
  if (!entry || !entry.entry) return false;
  if (isDirectoryEntry(entry)) {
    return !IGNORED_DIRECTORY_NAMES.has(String(entry.entry).toLowerCase());
  }
  return isSupportedDocument(entry.path || entry.entry);
}

function sortWorkspaceEntries(entries) {
  return entries.slice().sort((left, right) => {
    const directoryOrder = Number(isDirectoryEntry(right)) - Number(isDirectoryEntry(left));
    if (directoryOrder !== 0) return directoryOrder;
    return String(left.entry).localeCompare(String(right.entry), undefined, {
      numeric: true,
      sensitivity: 'base'
    });
  });
}

module.exports = {
  IGNORED_DIRECTORY_NAMES,
  isDirectoryEntry,
  shouldShowWorkspaceEntry,
  sortWorkspaceEntries
};
