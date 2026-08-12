const DOCUMENT_TYPES = {
  '.md': { kind: 'markdown', language: null },
  '.markdown': { kind: 'markdown', language: null },
  '.txt': { kind: 'text', language: null },
  '.text': { kind: 'text', language: null },
  '.log': { kind: 'text', language: null },
  '.c': { kind: 'code', language: 'c' },
  '.h': { kind: 'code', language: 'c' },
  '.cc': { kind: 'code', language: 'cpp' },
  '.cpp': { kind: 'code', language: 'cpp' },
  '.cxx': { kind: 'code', language: 'cpp' },
  '.hpp': { kind: 'code', language: 'cpp' },
  '.hxx': { kind: 'code', language: 'cpp' },
  '.inl': { kind: 'code', language: 'cpp' },
  '.js': { kind: 'code', language: 'javascript' },
  '.ts': { kind: 'code', language: 'typescript' },
  '.json': { kind: 'code', language: 'json' },
  '.css': { kind: 'code', language: 'css' },
  '.html': { kind: 'code', language: 'xml' },
  '.htm': { kind: 'code', language: 'xml' },
  '.xml': { kind: 'code', language: 'xml' },
  '.py': { kind: 'code', language: 'python' },
  '.java': { kind: 'code', language: 'java' },
  '.sh': { kind: 'code', language: 'bash' },
  '.ps1': { kind: 'code', language: 'powershell' },
  '.bat': { kind: 'code', language: 'dos' },
  '.cmd': { kind: 'code', language: 'dos' },
  '.ini': { kind: 'code', language: 'ini' },
  '.cfg': { kind: 'code', language: 'ini' },
  '.yaml': { kind: 'code', language: 'yaml' },
  '.yml': { kind: 'code', language: 'yaml' },
  '.toml': { kind: 'code', language: 'ini' },
  '.csv': { kind: 'text', language: null }
};

function getDocumentType(filePath) {
  const basename = String(filePath).split(/[\\/]/).pop();
  const dotIndex = basename.lastIndexOf('.');
  const extension = dotIndex > 0 ? basename.slice(dotIndex).toLowerCase() : '';
  return DOCUMENT_TYPES[extension] || null;
}

function isSupportedDocument(filePath) {
  return getDocumentType(filePath) !== null;
}

function splitCommandLine(commandLine) {
  if (Array.isArray(commandLine)) {
    return commandLine.slice();
  }

  const args = [];
  const pattern = /"((?:\\"|[^"])*)"|(\S+)/g;
  let match;
  while ((match = pattern.exec(String(commandLine || ''))) !== null) {
    args.push((match[1] !== undefined ? match[1] : match[2]).replace(/\\"/g, '"'));
  }
  return args;
}

function getSupportedPathsFromArguments(commandLine) {
  return splitCommandLine(commandLine)
    .filter(arg => !String(arg).startsWith('-'))
    .filter(isSupportedDocument);
}

module.exports = {
  DOCUMENT_TYPES,
  getDocumentType,
  getSupportedPathsFromArguments,
  isSupportedDocument,
  splitCommandLine
};
