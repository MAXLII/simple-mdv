const assert = require('assert');
const { classifyLink } = require('../link-support');
const { isSupportedDocument } = require('../document-support');

assert.deepStrictEqual(classifyLink('#section-1'), {
  kind: 'anchor',
  fragment: 'section-1'
});
assert.deepStrictEqual(classifyLink('https://example.com/docs'), {
  kind: 'external',
  target: 'https://example.com/docs'
});
assert.deepStrictEqual(classifyLink('../core/bootloader_core.h'), {
  kind: 'local',
  target: '../core/bootloader_core.h',
  fragment: ''
});
assert.strictEqual(isSupportedDocument(classifyLink('../core/bootloader_core.h').target), true);
assert.deepStrictEqual(classifyLink('guide.md?mode=preview#setup'), {
  kind: 'local',
  target: 'guide.md',
  fragment: 'setup'
});
assert.deepStrictEqual(classifyLink('javascript:alert(1)'), {
  kind: 'unsupported-protocol',
  target: 'javascript:alert(1)'
});
assert.deepStrictEqual(classifyLink(''), { kind: 'invalid' });

console.log('link support tests passed');
