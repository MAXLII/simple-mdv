const assert = require('assert');
const { calculateSyncedScrollTop } = require('../compare-support');

assert.strictEqual(calculateSyncedScrollTop(
  { scrollTop: 0, scrollHeight: 1000, clientHeight: 200 },
  { scrollHeight: 1800, clientHeight: 200 }
), 0);

assert.strictEqual(calculateSyncedScrollTop(
  { scrollTop: 400, scrollHeight: 1000, clientHeight: 200 },
  { scrollHeight: 1800, clientHeight: 200 }
), 800);

assert.strictEqual(calculateSyncedScrollTop(
  { scrollTop: 800, scrollHeight: 1000, clientHeight: 200 },
  { scrollHeight: 1800, clientHeight: 200 }
), 1600);

assert.strictEqual(calculateSyncedScrollTop(
  { scrollTop: 200, scrollHeight: 200, clientHeight: 200 },
  { scrollHeight: 1800, clientHeight: 200 }
), 0);

console.log('compare support tests passed');
