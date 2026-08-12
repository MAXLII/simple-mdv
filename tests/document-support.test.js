const assert = require('assert');
const hljs = require('highlight.js');
const {
  getDocumentType,
  getSupportedPathsFromArguments,
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

const highlightedC = hljs.highlight(
  'static int value = 3; const char *message = "hello"; if (value) { return value; }',
  { language: 'c' }
).value;
assert.match(highlightedC, /hljs-keyword/);
assert.match(highlightedC, /hljs-type/);
assert.match(highlightedC, /hljs-string/);

console.log('document-support tests passed');
