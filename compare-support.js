function calculateSyncedScrollTop(source, target) {
  const sourceScrollRange = Math.max(0, source.scrollHeight - source.clientHeight);
  const targetScrollRange = Math.max(0, target.scrollHeight - target.clientHeight);
  if (sourceScrollRange === 0 || targetScrollRange === 0) return 0;

  const progress = Math.min(Math.max(source.scrollTop / sourceScrollRange, 0), 1);
  return progress * targetScrollRange;
}

module.exports = {
  calculateSyncedScrollTop
};
