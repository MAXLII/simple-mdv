function getDomElements(document) {
  const ids = [
    'viewer', 'zoomSurface', 'container', 'editorSurface', 'editorHighlight', 'editor',
    'compareSurface', 'compareViewer', 'filename', 'editBtn', 'compareBtn', 'openBtn',
    'openFolderBtn', 'backBtn', 'forwardBtn', 'darkModeBtn', 'searchBtn', 'searchPanel',
    'searchInput', 'searchPrev', 'searchNext', 'searchClose', 'searchCount', 'tocBtn',
    'tocSidebar', 'tocContent', 'tocCloseBtn', 'recentFiles', 'tabsBar', 'exportBtn',
    'layoutWidthBtn', 'zoomModeBtn', 'zoomResetBtn', 'diagramLightbox', 'diagramContent',
    'diagramZoomOut', 'diagramZoomReset', 'diagramZoomIn', 'diagramClose', 'workspaceSidebar',
    'workspaceName', 'workspaceTree', 'workspaceCloseBtn', 'appNotification'
  ];
  return Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
}

module.exports = { getDomElements };
