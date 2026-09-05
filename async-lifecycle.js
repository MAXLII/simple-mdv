function createRenderCoordinator() {
  const versions = new Map();

  function begin(target) {
    const version = (versions.get(target) || 0) + 1;
    versions.set(target, version);
    return { target, version };
  }

  function isCurrent(token) {
    return versions.get(token.target) === token.version;
  }

  function invalidate(target) {
    versions.set(target, (versions.get(target) || 0) + 1);
  }

  return { begin, invalidate, isCurrent };
}

function createOrderedQueue(worker) {
  let tail = Promise.resolve();
  return function enqueue(value) {
    const result = tail.then(() => worker(value));
    tail = result.catch(() => undefined);
    return result;
  };
}

module.exports = {
  createOrderedQueue,
  createRenderCoordinator
};
