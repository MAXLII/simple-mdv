const { canOpenWithDefaultApp } = require('./link-support');

function setupPreviewLinkHandling({ roots, classifyLink, getCurrentFile, isSupportedDocument,
  loadFile, openExternal, getFileStats, path, safeDecodeUri, scrollToAnchor, notify }) {
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

    let decodedTarget;
    try {
      // The query and fragment are already separated; decode filename characters too.
      decodedTarget = decodeURIComponent(target.target);
    } catch (error) {
      decodedTarget = safeDecodeUri(target.target);
    }
    const targetPath = path.isAbsolute(decodedTarget)
      ? decodedTarget
      : path.resolve(path.dirname(currentFile), decodedTarget);
    if (!isSupportedDocument(targetPath)) {
      if (!canOpenWithDefaultApp(targetPath)) {
        notify(`Unsupported document type: ${path.basename(targetPath)}`);
        return;
      }
      try {
        const stats = await getFileStats(targetPath);
        if (!stats.isFile) {
          notify(`不是可打开的文件：${path.basename(targetPath)}`);
          return;
        }
      } catch (error) {
        notify(`无法访问文件：${path.basename(targetPath)}（${error.message || error.code || '文件不存在或没有访问权限'}）`);
        return;
      }
      try {
        await openExternal(targetPath);
      } catch (error) {
        notify(`无法使用默认软件打开：${path.basename(targetPath)}（${error.message || error.code || '请检查系统默认应用设置'}）`);
      }
      return;
    }

    if (await loadFile(targetPath)) {
      scrollToAnchor(target.fragment);
    }
  };

  roots.forEach(root => root.addEventListener('click', handleClick));
}

module.exports = { setupPreviewLinkHandling };
