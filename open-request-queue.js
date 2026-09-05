function getEntryName(entry) {
  return entry.entry || String(entry.path || '').split(/[\\/]/).pop();
}

function listAtomicRequestFiles(entries) {
  return entries
    .filter(entry => getEntryName(entry).endsWith('.request'))
    .sort((left, right) => getEntryName(left).localeCompare(getEntryName(right)));
}

async function consumeOpenRequestDirectory(directoryPath, adapter, consumePaths) {
  const entries = listAtomicRequestFiles(await adapter.readDirectory(directoryPath));
  for (const entry of entries) {
    const name = getEntryName(entry);
    const requestPath = adapter.resolve(directoryPath, entry.path || name);
    const content = await adapter.readFile(requestPath);
    const paths = content.split(/\r?\n/).filter(Boolean);
    await consumePaths(paths);
    await adapter.removeFile(requestPath);
  }
  return entries.length;
}

module.exports = {
  consumeOpenRequestDirectory,
  listAtomicRequestFiles
};
