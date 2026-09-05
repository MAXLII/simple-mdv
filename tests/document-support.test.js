const assert = require('assert');
const hljs = require('highlight.js');
const {
  applyRefreshedDocumentContent,
  getDocumentType,
  getSupportedPathsFromArguments,
  isDocumentRefreshShortcut,
  isSupportedDocument,
  splitCommandLine
} = require('../document-support');

assert.deepStrictEqual(getDocumentType('demo.C'), { kind: 'code', language: 'c' });
assert.deepStrictEqual(getDocumentType('demo.h'), { kind: 'code', language: 'c' });
assert.deepStrictEqual(getDocumentType('demo.cpp'), { kind: 'code', language: 'cpp' });
assert.deepStrictEqual(getDocumentType('notes.txt'), { kind: 'text', language: null });
assert.deepStrictEqual(getDocumentType('README.md'), { kind: 'markdown', language: null });
assert.strictEqual(isSupportedDocument('image.png'), false);

assert.deepStrictEqual(
  splitCommandLine('"C:\\Program Files\\Viewer\\viewer.exe" "D:\\My Files\\demo.c"'),
  ['C:\\Program Files\\Viewer\\viewer.exe', 'D:\\My Files\\demo.c']
);
assert.deepStrictEqual(
  getSupportedPathsFromArguments('"C:\\Program Files\\Viewer\\viewer.exe" "D:\\My Files\\README.md" D:\\src\\demo.h'),
  ['D:\\My Files\\README.md', 'D:\\src\\demo.h']
);

assert.strictEqual(isDocumentRefreshShortcut({ key: 'F5' }), true);
assert.strictEqual(isDocumentRefreshShortcut({ key: 'r', ctrlKey: true }), true);
assert.strictEqual(isDocumentRefreshShortcut({ key: 'R', ctrlKey: true, shiftKey: true }), true);
assert.strictEqual(isDocumentRefreshShortcut({ key: 'r', metaKey: true }), true);
assert.strictEqual(isDocumentRefreshShortcut({ key: 'r' }), false);
assert.strictEqual(isDocumentRefreshShortcut({ key: 'F5', altKey: true }), false);

const openTabs = [
  { id: 'B', content: 'B before', savedContent: 'B before', dirty: false },
  { id: 'C', content: 'C before', savedContent: 'C before', dirty: false }
];
assert.strictEqual(applyRefreshedDocumentContent(openTabs, 'B', 'B after'), true);
assert.deepStrictEqual(openTabs, [
  { id: 'B', content: 'B after', savedContent: 'B after', dirty: false },
  { id: 'C', content: 'C before', savedContent: 'C before', dirty: false }
]);

openTabs[0].dirty = true;
assert.strictEqual(applyRefreshedDocumentContent(openTabs, 'B', 'discarded'), false);
assert.strictEqual(openTabs[0].content, 'B after');
assert.strictEqual(applyRefreshedDocumentContent(openTabs, 'A', 'reopened'), false);
assert.deepStrictEqual(openTabs.map(tab => tab.id), ['B', 'C']);

const highlightedC = hljs.highlight(
  'static int value = 3; const char *message = "hello"; if (value) { return value; }',
  { language: 'c' }
).value;
assert.match(highlightedC, /hljs-keyword/);
assert.match(highlightedC, /hljs-type/);
assert.match(highlightedC, /hljs-string/);

console.log('document-support tests passed');
