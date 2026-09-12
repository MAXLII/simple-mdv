const EXTERNAL_LINK_PATTERN = /^(?:https?|mailto):/i;
const PROTOCOL_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[a-z]:[\\/]/i;
// Data formats that can be delegated to a desktop application. Executables,
// shortcuts and scripts must not become runnable through a document link.
const DEFAULT_APP_EXTENSIONS = new Set([
  'pdf', 'epub', 'djvu', 'doc', 'docx', 'odt', 'rtf', 'xls', 'xlsx', 'ods',
  'ppt', 'pptx', 'odp', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg',
  'tif', 'tiff', 'ico', 'mp3', 'wav', 'flac', 'ogg', 'm4a', 'mp4', 'mkv',
  'avi', 'mov', 'webm', 'zip', '7z', 'rar'
]);

function canOpenWithDefaultApp(filePath) {
  const name = String(filePath).split(/[\\/]/).pop();
  const dot = name.lastIndexOf('.');
  return dot > 0 && DEFAULT_APP_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

function classifyLink(href) {
  const value = String(href || '').trim();
  if (!value) return { kind: 'invalid' };

  if (value.startsWith('#')) {
    return { kind: 'anchor', fragment: value.slice(1) };
  }

  if (EXTERNAL_LINK_PATTERN.test(value)) {
    return { kind: 'external', target: value };
  }

  if (PROTOCOL_PATTERN.test(value) && !WINDOWS_ABSOLUTE_PATH_PATTERN.test(value)) {
    return { kind: 'unsupported-protocol', target: value };
  }

  const hashIndex = value.indexOf('#');
  const fragment = hashIndex === -1 ? '' : value.slice(hashIndex + 1);
  const pathAndQuery = hashIndex === -1 ? value : value.slice(0, hashIndex);
  const queryIndex = pathAndQuery.indexOf('?');
  const target = queryIndex === -1 ? pathAndQuery : pathAndQuery.slice(0, queryIndex);

  return target
    ? { kind: 'local', target, fragment }
    : { kind: 'invalid' };
}

module.exports = {
  canOpenWithDefaultApp,
  classifyLink
};
