const assert = require('assert');
const { isSupportedDocument } = require('../document-support');
const {
  isDirectoryEntry,
  shouldShowWorkspaceEntry,
  sortWorkspaceEntries
} = require('../workspace-support');

const entries = [
  { entry: 'z.c', path: 'C:\\code\\z.c', type: 'FILE' },
  { entry: 'src', path: 'C:\\code\\src', type: 'DIRECTORY' },
  { entry: 'notes.md', path: 'C:\\code\\notes.md', type: 'FILE' },
  { entry: 'assets', path: 'C:\\code\\assets', type: 'DIRECTORY' }
];

assert.strictEqual(isDirectoryEntry(entries[1]), true);
assert.deepStrictEqual(
  sortWorkspaceEntries(entries).map(entry => entry.entry),
  ['assets', 'src', 'notes.md', 'z.c']
);
assert.strictEqual(
  shouldShowWorkspaceEntry({ entry: 'main.c', path: 'C:\\code\\main.c', type: 'FILE' }, isSupportedDocument),
  true
);
assert.strictEqual(
  shouldShowWorkspaceEntry({ entry: 'photo.png', path: 'C:\\code\\photo.png', type: 'FILE' }, isSupportedDocument),
  false
);
assert.strictEqual(
  shouldShowWorkspaceEntry({ entry: 'node_modules', path: 'C:\\code\\node_modules', type: 'DIRECTORY' }, isSupportedDocument),
  false
);

console.log('workspace-support tests passed');
