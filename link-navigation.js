function setupPreviewLinkHandling({ roots, classifyLink, getCurrentFile, isSupportedDocument,
  loadFile, openExternal, path, safeDecodeUri, scrollToAnchor, notify }) {
  const handleClick = async event => {
    const root = event.currentTarget;
    const link = event.target.closest('a');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;
    event.preventDefault();

    const target = classifyLink(href);
    if (target.kind === 'anchor') {
      scrollToAnchor(target.fragment, root);
      return;
    }
    if (target.kind === 'external') {
      try {
        await openExternal(target.target);
      } catch (error) {
        notify(`Unable to open link: ${error.message}`);
      }
      return;
    }

    const currentFile = getCurrentFile();
    if (target.kind !== 'local' || !currentFile) {
      notify('This link type is not supported.');
      return;
    }

    const decodedTarget = safeDecodeUri(target.target);
    const targetPath = path.isAbsolute(decodedTarget)
      ? decodedTarget
      : path.resolve(path.dirname(currentFile), decodedTarget);
    if (!isSupportedDocument(targetPath)) {
      notify(`Unsupported document type: ${path.basename(targetPath)}`);
      return;
    }

    if (await loadFile(targetPath)) {
      scrollToAnchor(target.fragment);
    }
  };

  roots.forEach(root => root.addEventListener('click', handleClick));
}

module.exports = { setupPreviewLinkHandling };
