// renderer.js

import { events, filesystem, init as neutralinoInit, os, window as nativeWindow } from '@neutralinojs/lib';
import hljs from 'highlight.js/lib/core';
import cLanguage from 'highlight.js/lib/languages/c';
import cppLanguage from 'highlight.js/lib/languages/cpp';
import javascriptLanguage from 'highlight.js/lib/languages/javascript';
import jsonLanguage from 'highlight.js/lib/languages/json';
import markedKatex from 'marked-katex-extension';
import mermaid from 'mermaid';
import { marked } from 'marked';
import { createOrderedQueue } from './async-lifecycle';
import { getDomElements } from './app-dom';
import { calculateSyncedScrollTop } from './compare-support';
import { confirmAndDisposeTab, createFileWatcherManager, disposeTabResources, saveTab } from './document-lifecycle';
import { classifyLink } from './link-support';
import { setupPreviewLinkHandling } from './link-navigation';
import { createMarkdownRenderer } from './markdown-renderer';
import { normalizeLatexDisplayMath } from './markdown-math';
import { consumeOpenRequestDirectory } from './open-request-queue';
import { highlightTextMatches } from './search-support';
import { createTabState, updateTabContent } from './tab-state';
import {
  applyRefreshedDocumentContent,
  DOCUMENT_TYPES,
  getDocumentType,
  getSupportedPathsFromArguments,
  isDocumentRefreshShortcut,
  isSupportedDocument
} from './document-support';
import {
  isDirectoryEntry,
  shouldShowWorkspaceEntry,
  sortWorkspaceEntries
} from './workspace-support';

neutralinoInit();
hljs.registerLanguage('c', cLanguage);
hljs.registerLanguage('cpp', cppLanguage);
hljs.registerLanguage('javascript', javascriptLanguage);
hljs.registerLanguage('typescript', javascriptLanguage);
hljs.registerLanguage('json', jsonLanguage);

const path = {
  basename(value) {
    return String(value).replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '';
  },
  dirname(value) {
    const normalized = String(value).replace(/\//g, '\\').replace(/\\+$/, '');
    const separatorIndex = normalized.lastIndexOf('\\');
    return separatorIndex > 2 ? normalized.slice(0, separatorIndex) : normalized.slice(0, separatorIndex + 1);
  },
  extname(value) {
    const basename = this.basename(value);
    const dotIndex = basename.lastIndexOf('.');
    return dotIndex > 0 ? basename.slice(dotIndex) : '';
  },
  isAbsolute(value) {
    return /^(?:[a-z]:[\\/]|\\\\|\/)/i.test(String(value));
  },
  resolve(...values) {
    let combined = '';
    for (const value of values) {
      const normalized = String(value).replace(/\//g, '\\');
      combined = this.isAbsolute(normalized)
        ? normalized
        : `${combined.replace(/\\+$/, '')}\\${normalized}`;
    }

    const prefixMatch = combined.match(/^(?:[a-z]:\\|\\\\[^\\]+\\[^\\]+\\?)/i);
    const prefix = prefixMatch ? prefixMatch[0] : '';
    const segments = combined.slice(prefix.length).split(/\\+/);
    const resolvedSegments = [];
    for (const segment of segments) {
      if (!segment || segment === '.') continue;
      if (segment === '..') {
        resolvedSegments.pop();
      } else {
        resolvedSegments.push(segment);
      }
    }
    return prefix + resolvedSegments.join('\\');
  }
};

// DOM Elements
const {
  viewer, zoomSurface, container, editorSurface, editorHighlight, editor,
  compareSurface, compareViewer, filename: filenameSpan, editBtn, compareBtn,
  openBtn, openFolderBtn, backBtn, forwardBtn, darkModeBtn, searchBtn,
  searchPanel, searchInput, searchPrev, searchNext, searchClose, searchCount,
  tocBtn, tocSidebar, tocContent, tocCloseBtn, recentFiles: recentFilesSelect,
  tabsBar, exportBtn, layoutWidthBtn, zoomModeBtn, zoomResetBtn, diagramLightbox,
  diagramContent, diagramZoomOut, diagramZoomReset, diagramZoomIn, diagramClose,
  workspaceSidebar, workspaceName, workspaceTree, workspaceCloseBtn, appNotification
} = getDomElements(document);

// State
let currentFile = null;
let isEditMode = false;
let viewMode = 'preview';
let openTabs = [];
let activeTabId = null;
let history = [];
let historyIndex = -1;
let searchMatches = [];
let currentSearchIndex = -1;
let recentFiles = JSON.parse(localStorage.getItem('recentFiles') || '[]');
let contentZoom = Number(localStorage.getItem('contentZoom') || '1');
let zoomMode = localStorage.getItem('zoomMode') === 'vector' ? 'vector' : 'text';
let layoutWidthMode = localStorage.getItem('layoutWidthMode') || 'standard';
let diagramZoom = 1;
let currentWorkspacePath = null;
let notificationTimer = null;

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.1;
const LAYOUT_WIDTHS = {
  compact: 900,
  standard: 1100,
  wide: 1400
};
let markedConfigured = false;

function configureMarked() {
  if (markedConfigured || typeof marked === 'undefined') {
    return;
  }

  marked.use(markedKatex({
    throwOnError: false,
    nonStandard: true
  }));

  marked.setOptions({
    gfm: true,
    breaks: true,
    highlight: function(code, lang) {
      if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(code, { language: lang }).value;
        } catch (err) {
          console.error('Highlight error:', err);
        }
      }
      return code;
    }
  });

  markedConfigured = true;
}

const markdownRenderer = createMarkdownRenderer({
  window,
  marked,
  mermaid,
  hljs,
  filesystem,
  path,
  normalizeLatexDisplayMath,
  configureMarked,
  isRenderAllowed: tab => openTabs.includes(tab) && tab.id === activeTabId,
  onRendered(targetElement, updateToc) {
    if (updateToc) generateTableOfContents();
    if (targetElement === viewer) updateZoomSurfaceSize();
  }
});

const renderDocument = (content, targetElement = viewer, tab = getActiveTab(), updateToc = targetElement === viewer) =>
  markdownRenderer.renderDocument(content, targetElement, tab, updateToc);
const renderMarkdownInto = (content, targetElement, updateToc = false, tab = getActiveTab()) =>
  markdownRenderer.renderMarkdownInto(content, targetElement, tab, updateToc);

const fileWatchers = createFileWatcherManager({
  events,
  filesystem,
  path,
  getOpenTabs: () => openTabs,
  applyContent: (tab, content) => applyRefreshedDocumentContent(openTabs, tab.id, content),
  async onReload(tab, content) {
    if (tab.id === activeTabId && viewMode === 'preview') {
      editor.dataset.raw = content;
      editor.value = content;
      await renderDocument(content, viewer, tab, true);
    }
  },
  onError(message, error) {
    console.error(`${message}:`, error);
  }
});

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function setLayoutWidthMode(mode) {
  layoutWidthMode = Object.prototype.hasOwnProperty.call(LAYOUT_WIDTHS, mode) ? mode : 'standard';
  document.body.style.setProperty('--reader-width', `${LAYOUT_WIDTHS[layoutWidthMode]}px`);
  localStorage.setItem('layoutWidthMode', layoutWidthMode);

  if (layoutWidthBtn) {
    const labels = {
      compact: 'Width Compact',
      standard: 'Width Standard',
      wide: 'Width Wide'
    };
    layoutWidthBtn.textContent = labels[layoutWidthMode];
  }

  updateZoomSurfaceSize();
}

function cycleLayoutWidthMode() {
  const modes = ['compact', 'standard', 'wide'];
  const currentIndex = modes.indexOf(layoutWidthMode);
  setLayoutWidthMode(modes[(currentIndex + 1) % modes.length]);
}

function setContentZoom(value) {
  contentZoom = clamp(Number(value) || 1, ZOOM_MIN, ZOOM_MAX);
  document.body.style.setProperty('--content-zoom', contentZoom.toFixed(2));
  localStorage.setItem('contentZoom', contentZoom.toFixed(2));
  updateZoomModeButton();
  updateZoomSurfaceSize();
}

function updateZoomModeButton() {
  if (!zoomModeBtn) return;

  const percent = `${Math.round(contentZoom * 100)}%`;
  zoomModeBtn.textContent = zoomMode === 'vector' ? `Vector ${percent}` : `Text ${percent}`;
  zoomModeBtn.classList.toggle('active', zoomMode === 'vector');

  if (zoomResetBtn) {
    zoomResetBtn.textContent = percent;
  }
}

function setZoomMode(mode) {
  zoomMode = mode === 'vector' ? 'vector' : 'text';
  document.body.classList.toggle('vector-zoom', zoomMode === 'vector');
  localStorage.setItem('zoomMode', zoomMode);
  updateZoomModeButton();
  updateZoomSurfaceSize();
}

function updateZoomSurfaceSize() {
  if (!zoomSurface) return;

  if (zoomMode !== 'vector' || zoomSurface.style.display === 'none') {
    zoomSurface.style.width = '';
    zoomSurface.style.height = '';
    return;
  }

  requestAnimationFrame(() => {
    const width = viewer.offsetWidth;
    const height = viewer.offsetHeight;
    zoomSurface.style.width = `${width * contentZoom}px`;
    zoomSurface.style.height = `${height * contentZoom}px`;
  });
}

setZoomMode(zoomMode);
setLayoutWidthMode(layoutWidthMode);
setContentZoom(contentZoom);

if (typeof ResizeObserver !== 'undefined') {
  const zoomResizeObserver = new ResizeObserver(updateZoomSurfaceSize);
  zoomResizeObserver.observe(viewer);
}

layoutWidthBtn.addEventListener('click', cycleLayoutWidthMode);

zoomModeBtn.addEventListener('click', () => {
  setZoomMode(zoomMode === 'vector' ? 'text' : 'vector');
});

zoomResetBtn.addEventListener('click', () => {
  setContentZoom(1);
});

function getActiveTab() {
  return openTabs.find(tab => tab.id === activeTabId) || null;
}

function persistActiveEditorContent() {
  const activeTab = getActiveTab();
  if (!activeTab || viewMode === 'preview') return;

  updateTabContent(activeTab, editor.value);
}

function updateFileActions() {
  const activeTab = getActiveTab();
  const hasFile = !!activeTab;
  const isMarkdown = activeTab && activeTab.documentType.kind === 'markdown';
  editBtn.style.display = hasFile ? 'inline-block' : 'none';
  compareBtn.style.display = isMarkdown ? 'inline-block' : 'none';
  exportBtn.style.display = isMarkdown ? 'inline-block' : 'none';
  tocBtn.style.display = isMarkdown ? 'inline-block' : 'none';
  if (!isMarkdown) {
    tocSidebar.classList.add('hidden');
  }
}

function updateModeButtons() {
  editBtn.textContent = viewMode === 'edit' ? 'Preview' : 'Edit';
  compareBtn.textContent = viewMode === 'compare' ? 'Preview' : 'Compare';
}

function renderTabs() {
  tabsBar.innerHTML = '';
  tabsBar.style.display = openTabs.length > 0 ? 'flex' : 'none';

  openTabs.forEach(tab => {
    const tabButton = document.createElement('button');
    tabButton.className = `file-tab${tab.id === activeTabId ? ' active' : ''}`;
    tabButton.title = tab.filePath;
    tabButton.type = 'button';

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = `${path.basename(tab.filePath)}${tab.dirty ? ' *' : ''}`;

    const close = document.createElement('span');
    close.className = 'tab-close';
    close.textContent = 'x';
    close.title = 'Close';

    close.addEventListener('click', async (e) => {
      e.stopPropagation();
      await closeTab(tab.id);
    });

    tabButton.addEventListener('click', () => {
      activateTab(tab.id);
    });

    tabButton.appendChild(title);
    tabButton.appendChild(close);
    tabsBar.appendChild(tabButton);
  });
}

function activateTab(tabId) {
  if (activeTabId === tabId) return;

  clearTimeout(compareRenderTimer);
  persistActiveEditorContent();
  activeTabId = tabId;
  viewMode = 'preview';
  syncActiveTabToView();
}

async function closeTab(tabId) {
  const closeIndex = openTabs.findIndex(tab => tab.id === tabId);
  if (closeIndex === -1) return false;

  const tab = openTabs[closeIndex];
  clearTimeout(compareRenderTimer);
  if (tab.id === activeTabId) persistActiveEditorContent();
  const shouldClose = await confirmAndDisposeTab(
    tab,
    item => window.confirm(`Close ${path.basename(item.filePath)} without saving your changes?`),
    async item => {
      markdownRenderer.releaseTab(item);
      try {
        await disposeTabResources(
          item,
          watcher => filesystem.removeWatcher(watcher),
          url => URL.revokeObjectURL(url)
        );
      } catch (error) {
        console.error('Unable to fully release tab resources:', error);
        showAppNotification(`Unable to release file watcher: ${error.message}`);
      }
    }
  );
  if (!shouldClose) return false;

  openTabs.splice(closeIndex, 1);

  if (activeTabId === tabId) {
    const nextTab = openTabs[Math.min(closeIndex, openTabs.length - 1)];
    activeTabId = nextTab ? nextTab.id : null;
    viewMode = 'preview';
  }

  await syncActiveTabToView();
  return true;
}

async function syncActiveTabToView() {
  const activeTab = getActiveTab();
  currentFile = activeTab ? activeTab.filePath : null;
  updateWorkspaceSelection();
  filenameSpan.textContent = activeTab ? path.basename(activeTab.filePath) : '';
  editor.dataset.raw = activeTab ? activeTab.content : '';
  editor.value = activeTab ? activeTab.content : '';
  updateEditorHighlight();
  updateFileActions();
  updateModeButtons();
  renderTabs();
  clearSearch();

  if (!activeTab) {
    markdownRenderer.invalidate(viewer);
    markdownRenderer.invalidate(compareViewer);
    viewer.innerHTML = '';
    compareViewer.innerHTML = '';
    markdownRenderer.releaseTargetResources(viewer);
    markdownRenderer.releaseTargetResources(compareViewer);
    setViewMode('preview');
    return;
  }

  markdownRenderer.invalidate(viewer);
  markdownRenderer.invalidate(compareViewer);
  markdownRenderer.releaseTargetResources(viewer);
  markdownRenderer.releaseTargetResources(compareViewer);
  viewer.replaceChildren();
  compareViewer.replaceChildren();
  await renderDocument(activeTab.content, viewer, activeTab, true);
  if (viewMode === 'compare') {
    await renderMarkdownInto(activeTab.content, compareViewer, false);
  }
  setViewMode(viewMode);
}

function setViewMode(mode) {
  viewMode = mode;
  isEditMode = viewMode !== 'preview';
  document.body.classList.toggle('compare-mode', viewMode === 'compare');

  if (viewMode === 'preview') {
    editorSurface.style.display = 'none';
    compareSurface.style.display = 'none';
    zoomSurface.style.display = 'block';
  } else if (viewMode === 'edit') {
    zoomSurface.style.display = 'none';
    compareSurface.style.display = 'none';
    editorSurface.style.display = 'block';
  } else {
    zoomSurface.style.display = 'none';
    editorSurface.style.display = 'block';
    compareSurface.style.display = 'block';
  }

  updateModeButtons();
  updateZoomSurfaceSize();
}

// Wait for libraries to load
window.addEventListener('load', () => {
  console.log('Marked available:', typeof marked !== 'undefined');
  console.log('Mermaid available:', typeof mermaid !== 'undefined');
  console.log('Highlight.js available:', typeof hljs !== 'undefined');

  // Initialize mermaid
  if (typeof mermaid !== 'undefined') {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'strict'
    });
  }

  configureMarked();

  // Setup link handling
  setupLinkHandling();
  setupDiagramLightbox();
  setupWebViewNavigationGuard();

  // Load recent files
  updateRecentFilesList();
});

const enqueueOpenFile = createOrderedQueue(({ filePath, addToHistoryFlag = true }) =>
  loadFile(filePath, addToHistoryFlag));

async function openFilesInOrder(filePaths) {
  for (const filePath of filePaths.filter(isSupportedDocument)) {
    await enqueueOpenFile({ filePath });
  }
}

async function openFilesFromArguments(args) {
  await openFilesInOrder(getSupportedPathsFromArguments(args));
}

async function initializeNativeOpenHandling() {
  await openFilesFromArguments(window.NL_ARGS || []);

  const queueArgument = (window.NL_ARGS || []).find(arg => arg.startsWith('--open-queue-dir='));
  if (!queueArgument) return;

  const queueDirectory = queueArgument.slice('--open-queue-dir='.length);
  let consumingRequests = false;
  setInterval(async () => {
    if (consumingRequests) return;
    consumingRequests = true;
    try {
      await consumeOpenRequestDirectory(queueDirectory, {
        readDirectory: directory => filesystem.readDirectory(directory, { recursive: false }),
        readFile: requestPath => filesystem.readFile(requestPath),
        removeFile: requestPath => filesystem.removeFile(requestPath),
        resolve: (...parts) => path.resolve(...parts)
      }, openFilesInOrder);
    } catch (err) {
      console.error('Unable to consume open requests:', err);
    } finally {
      consumingRequests = false;
    }
  }, 350);
}

events.on('ready', initializeNativeOpenHandling);

// ==================== Navigation History ====================

function addToHistory(filePath) {
  // If we're not at the end of history, remove everything after current position
  if (historyIndex < history.length - 1) {
    history = history.slice(0, historyIndex + 1);
  }

  // Add new file to history
  history.push(filePath);
  historyIndex = history.length - 1;

  updateNavigationButtons();
}

function updateNavigationButtons() {
  backBtn.disabled = historyIndex <= 0;
  forwardBtn.disabled = historyIndex >= history.length - 1;
}

function navigateBack() {
  if (historyIndex > 0) {
    historyIndex--;
    loadFile(history[historyIndex], false);
  }
}

function navigateForward() {
  if (historyIndex < history.length - 1) {
    historyIndex++;
    loadFile(history[historyIndex], false);
  }
}

backBtn.addEventListener('click', navigateBack);
forwardBtn.addEventListener('click', navigateForward);

// ==================== Recent Files ====================

function addToRecentFiles(filePath) {
  // Remove if already exists
  recentFiles = recentFiles.filter(f => f !== filePath);

  // Add to beginning
  recentFiles.unshift(filePath);

  // Keep only last 10
  recentFiles = recentFiles.slice(0, 10);

  // Save to localStorage
  localStorage.setItem('recentFiles', JSON.stringify(recentFiles));

  updateRecentFilesList();
}

function updateRecentFilesList() {
  // Clear existing options (except the first one)
  while (recentFilesSelect.options.length > 1) {
    recentFilesSelect.remove(1);
  }

  // Add recent files
  recentFiles.forEach(filePath => {
    const option = document.createElement('option');
    option.value = filePath;
    option.textContent = path.basename(filePath);
    recentFilesSelect.appendChild(option);
  });
}

recentFilesSelect.addEventListener('change', (e) => {
  const filePath = e.target.value;
  if (filePath) {
    loadFile(filePath);
    e.target.value = ''; // Reset to "Recent Files"
  }
});

// ==================== File Operations ====================

function updateWorkspaceSelection() {
  workspaceTree.querySelectorAll('.workspace-file.active').forEach(element => {
    element.classList.remove('active');
  });
  if (!currentFile) return;

  workspaceTree.querySelectorAll('.workspace-file').forEach(element => {
    if (element.dataset.path.toLowerCase() === currentFile.toLowerCase()) {
      element.classList.add('active');
    }
  });
}

function createWorkspaceFile(entry, filePath) {
  const item = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'workspace-entry workspace-file';
  button.dataset.path = filePath;
  button.title = filePath;
  button.innerHTML = '<span class="workspace-entry-icon">◇</span>';

  const label = document.createElement('span');
  label.textContent = entry.entry;
  button.appendChild(label);
  button.addEventListener('click', () => loadFile(filePath));

  item.appendChild(button);
  return item;
}

function createWorkspaceDirectory(entry, directoryPath) {
  const item = document.createElement('li');
  item.className = 'workspace-directory';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'workspace-entry workspace-folder';
  button.title = directoryPath;
  button.innerHTML = '<span class="workspace-arrow">›</span><span class="workspace-folder-icon">▱</span>';

  const label = document.createElement('span');
  label.textContent = entry.entry;
  button.appendChild(label);

  const children = document.createElement('ul');
  children.className = 'workspace-children hidden';
  button.addEventListener('click', async () => {
    const willOpen = children.classList.contains('hidden');
    children.classList.toggle('hidden', !willOpen);
    item.classList.toggle('expanded', willOpen);
    if (willOpen && !children.dataset.loaded) {
      await loadWorkspaceDirectory(directoryPath, children);
    }
  });

  item.appendChild(button);
  item.appendChild(children);
  return item;
}

async function loadWorkspaceDirectory(directoryPath, target) {
  target.innerHTML = '<li class="workspace-status">Loading…</li>';
  try {
    const entries = await filesystem.readDirectory(directoryPath, { recursive: false });
    const visibleEntries = sortWorkspaceEntries(
      entries.filter(entry => shouldShowWorkspaceEntry(entry, isSupportedDocument))
    );
    target.innerHTML = '';
    target.dataset.loaded = 'true';

    if (visibleEntries.length === 0) {
      target.innerHTML = '<li class="workspace-status">No supported files</li>';
      return;
    }

    for (const entry of visibleEntries) {
      const entryPath = path.isAbsolute(entry.path)
        ? path.resolve(entry.path)
        : path.resolve(directoryPath, entry.path || entry.entry);
      target.appendChild(isDirectoryEntry(entry)
        ? createWorkspaceDirectory(entry, entryPath)
        : createWorkspaceFile(entry, entryPath));
    }
    updateWorkspaceSelection();
  } catch (err) {
    console.error('Error reading folder:', err);
    target.innerHTML = '<li class="workspace-status error-text">Unable to read folder</li>';
  }
}

async function openWorkspace(folderPath) {
  if (!folderPath) return;
  currentWorkspacePath = path.resolve(folderPath);
  workspaceName.textContent = path.basename(currentWorkspacePath) || currentWorkspacePath;
  workspaceName.title = currentWorkspacePath;
  workspaceSidebar.classList.remove('hidden');
  workspaceTree.innerHTML = '';

  const root = document.createElement('ul');
  root.className = 'workspace-root';
  workspaceTree.appendChild(root);
  await loadWorkspaceDirectory(currentWorkspacePath, root);
}

openFolderBtn.addEventListener('click', async () => {
  const folderPath = await os.showFolderDialog('Open folder', {
    defaultPath: currentWorkspacePath || undefined
  });
  await openWorkspace(folderPath);
});

workspaceCloseBtn.addEventListener('click', () => {
  currentWorkspacePath = null;
  workspaceTree.innerHTML = '';
  workspaceName.textContent = 'No Folder Open';
  workspaceName.removeAttribute('title');
  workspaceSidebar.classList.add('hidden');
});

// Open file button
openBtn.addEventListener('click', async () => {
  console.log('Open button clicked');
  const selectedPaths = await os.showOpenDialog('Open text files', {
    multiSelections: true,
    filters: [{
      name: 'Text and source files',
      extensions: Object.keys(DOCUMENT_TYPES).map(extension => extension.slice(1))
    }]
  });
  await openFilesInOrder(selectedPaths);
});

// Edit button toggle
editBtn.addEventListener('click', async () => {
  if (!currentFile) return;

  if (viewMode === 'edit') {
    if (!await saveActiveFile()) return;
    setViewMode('preview');
    await renderDocument(editor.value);
  } else {
    persistActiveEditorContent();
    editor.value = getActiveTab().content;
    updateEditorHighlight();
    setViewMode('edit');
  }
});

compareBtn.addEventListener('click', async () => {
  if (!currentFile) return;

  if (viewMode === 'compare') {
    if (!await saveActiveFile()) return;
    setViewMode('preview');
    await renderMarkdown(editor.value);
  } else {
    persistActiveEditorContent();
    editor.value = getActiveTab().content;
    await renderMarkdownInto(editor.value, compareViewer, false);
    setViewMode('compare');
    syncCompareScroll(editor, compareSurface);
  }
});

let compareRenderTimer = null;
let isSyncingCompareScroll = false;

function syncCompareScroll(source, target) {
  if (viewMode !== 'compare' || isSyncingCompareScroll) return;

  isSyncingCompareScroll = true;
  target.scrollTop = calculateSyncedScrollTop(source, target);
  requestAnimationFrame(() => {
    isSyncingCompareScroll = false;
  });
}

editor.addEventListener('input', () => {
  const activeTab = getActiveTab();
  if (!activeTab) return;

  updateTabContent(activeTab, editor.value);
  updateEditorHighlight();
  renderTabs();

  if (viewMode === 'compare') {
    clearTimeout(compareRenderTimer);
    compareRenderTimer = setTimeout(async () => {
      await renderMarkdownInto(editor.value, compareViewer, false);
      syncCompareScroll(editor, compareSurface);
    }, 200);
  }
});

editor.addEventListener('scroll', () => {
  syncEditorHighlightScroll();
  syncCompareScroll(editor, compareSurface);
});

compareSurface.addEventListener('scroll', () => {
  syncCompareScroll(compareSurface, editor);
});

async function loadFile(filePath, addToHistoryFlag = true) {
  console.log('Loading file:', filePath);

  try {
    const resolvedPath = path.resolve(filePath);
    const documentType = getDocumentType(resolvedPath);
    if (!documentType) {
      throw new Error('Unsupported file type');
    }
    const existingTab = openTabs.find(tab => tab.filePath === resolvedPath);
    if (existingTab) {
      activateTab(existingTab.id);
      return true;
    }

    const content = await filesystem.readFile(resolvedPath);
    const tab = createTabState({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      filePath: resolvedPath,
      documentType,
      content
    });

    persistActiveEditorContent();
    openTabs.push(tab);
    activeTabId = tab.id;
    currentFile = resolvedPath;
    viewMode = 'preview';

    await syncActiveTabToView();

    // Add to history
    if (addToHistoryFlag) {
      addToHistory(resolvedPath);
    } else {
      updateNavigationButtons();
    }

    // Add to recent files
    addToRecentFiles(resolvedPath);

    // Setup file watcher
    await fileWatchers.setup(tab);

    return true;

  } catch (err) {
    console.error('Error loading file:', err);
    showAppNotification(`Unable to open ${path.basename(filePath)}: ${err.message}`);
    return false;
  }
}

async function saveActiveFile() {
  const activeTab = getActiveTab();
  if (!activeTab || !currentFile) return false;

  const content = editor.value;
  try {
    await saveTab(activeTab, content, (filePath, value) => filesystem.writeFile(filePath, value));
    editor.dataset.raw = content;
    renderTabs();
    return true;
  } catch (error) {
    updateTabContent(activeTab, content);
    renderTabs();
    console.error('Unable to save file:', error);
    showAppNotification(`Unable to save ${path.basename(activeTab.filePath)}: ${error.message}`);
    return false;
  }
}

async function refreshActiveDocument() {
  const activeTab = getActiveTab();
  if (!activeTab) return;

  persistActiveEditorContent();

  try {
    if (!activeTab.dirty) {
      const content = await filesystem.readFile(activeTab.filePath);
      applyRefreshedDocumentContent(openTabs, activeTab.id, content);
    }

    if (activeTab.id === activeTabId) {
      await syncActiveTabToView();
    }
  } catch (err) {
    console.error('Error refreshing active document:', err);
  }
}

async function renderMarkdown(markdown) {
  await renderDocument(markdown);
}

function updateEditorHighlight() {
  const activeTab = getActiveTab();
  const code = editorHighlight.querySelector('code');
  const language = activeTab && activeTab.documentType.kind === 'code'
    ? activeTab.documentType.language
    : null;

  editorSurface.classList.toggle('syntax-editor', !!language);
  if (language && hljs.getLanguage(language)) {
    code.className = `language-${language}`;
    code.innerHTML = `${hljs.highlight(editor.value, { language }).value}\n`;
  } else {
    code.className = '';
    code.textContent = `${editor.value}\n`;
  }

  syncEditorHighlightScroll();
}

function syncEditorHighlightScroll() {
  editorHighlight.scrollTop = editor.scrollTop;
  editorHighlight.scrollLeft = editor.scrollLeft;
}


function safeDecodeUri(value) {
  try {
    return decodeURI(value);
  } catch (err) {
    return value;
  }
}

// ==================== Link Handling ====================

function showAppNotification(message) {
  clearTimeout(notificationTimer);
  appNotification.textContent = message;
  appNotification.title = message;
  appNotification.classList.remove('hidden');
  notificationTimer = setTimeout(() => {
    appNotification.classList.add('hidden');
  }, 5000);
}

function scrollToDocumentAnchor(fragment, root = viewer) {
  if (!fragment) return;

  const anchorId = safeDecodeUri(fragment);
  const target = Array.from(root.querySelectorAll('[id]')).find(element => element.id === anchorId);
  if (target) {
    target.scrollIntoView({ behavior: 'smooth' });
  }
}

function setupLinkHandling() {
  setupPreviewLinkHandling({
    roots: [viewer, compareViewer],
    classifyLink,
    getCurrentFile: () => currentFile,
    isSupportedDocument,
    loadFile,
    openExternal: target => os.open(target),
    path,
    safeDecodeUri,
    scrollToAnchor: scrollToDocumentAnchor,
    notify: showAppNotification
  });
}

function setupWebViewNavigationGuard() {
  const appHistoryState = { simpleMarkdownViewer: true };
  window.history.replaceState(appHistoryState, '', window.location.href);
  window.history.pushState(appHistoryState, '', window.location.href);

  window.addEventListener('popstate', () => {
    window.history.pushState(appHistoryState, '', window.location.href);
    if (!backBtn.disabled) {
      navigateBack();
    }
  });
}

// ==================== Diagram Lightbox ====================

function setupDiagramLightbox() {
  [viewer, compareViewer].forEach(previewElement => {
    previewElement.addEventListener('click', (e) => {
    const target = e.target.closest('img, .mermaid-wrapper');
    if (!target || target.closest('a')) return;

    e.preventDefault();
    openDiagramLightbox(target);
    });
  });
}

function openDiagramLightbox(sourceNode) {
  diagramContent.innerHTML = '';
  const clone = sourceNode.cloneNode(true);
  clone.removeAttribute('style');
  diagramContent.appendChild(clone);
  diagramZoom = 1;
  applyDiagramZoom();
  diagramLightbox.classList.remove('hidden');
}

function closeDiagramLightbox() {
  diagramLightbox.classList.add('hidden');
  diagramContent.innerHTML = '';
}

function applyDiagramZoom() {
  diagramZoom = clamp(diagramZoom, 0.25, 6);
  diagramContent.style.transform = `scale(${diagramZoom})`;
  diagramZoomReset.textContent = `${Math.round(diagramZoom * 100)}%`;
}

diagramZoomOut.addEventListener('click', () => {
  diagramZoom -= 0.25;
  applyDiagramZoom();
});

diagramZoomIn.addEventListener('click', () => {
  diagramZoom += 0.25;
  applyDiagramZoom();
});

diagramZoomReset.addEventListener('click', () => {
  diagramZoom = 1;
  applyDiagramZoom();
});

diagramClose.addEventListener('click', closeDiagramLightbox);

diagramLightbox.addEventListener('wheel', (e) => {
  if (!e.ctrlKey) return;

  e.preventDefault();
  e.stopPropagation();
  diagramZoom += e.deltaY < 0 ? 0.25 : -0.25;
  applyDiagramZoom();
}, { passive: false });

// ==================== Dark Mode ====================

const isDarkMode = localStorage.getItem('darkMode') === 'true';

// Apply saved preference
if (isDarkMode) {
  document.body.classList.add('dark-mode');
  darkModeBtn.textContent = '☀️';
  toggleHighlightTheme(true);
}

darkModeBtn.addEventListener('click', () => {
  document.body.classList.toggle('dark-mode');
  const isDark = document.body.classList.contains('dark-mode');
  localStorage.setItem('darkMode', isDark);
  darkModeBtn.textContent = isDark ? '☀️' : '🌙';
  toggleHighlightTheme(isDark);
});

function toggleHighlightTheme(isDark) {
  document.body.dataset.highlightTheme = isDark ? 'dark' : 'light';
}

// ==================== Search Functionality ====================

searchBtn.addEventListener('click', () => {
  searchPanel.style.display = searchPanel.style.display === 'none' ? 'flex' : 'none';
  if (searchPanel.style.display === 'flex') {
    searchInput.focus();
  } else {
    clearSearch();
  }
});

searchClose.addEventListener('click', () => {
  searchPanel.style.display = 'none';
  clearSearch();
});

searchInput.addEventListener('input', (e) => {
  performSearch(e.target.value);
});

searchNext.addEventListener('click', () => {
  navigateSearch(1);
});

searchPrev.addEventListener('click', () => {
  navigateSearch(-1);
});

function performSearch(query) {
  // Clear previous search
  clearSearch();

  if (!query) {
    searchCount.textContent = '0/0';
    return;
  }

  const textContent = viewer.innerText;
  const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const matches = [...textContent.matchAll(regex)];

  if (matches.length === 0) {
    searchCount.textContent = '0/0';
    return;
  }

  // Highlight all matches
  highlightSearchMatches(query);

  searchMatches = Array.from(viewer.querySelectorAll('.search-highlight'));
  currentSearchIndex = 0;

  if (searchMatches.length > 0) {
    searchMatches[0].classList.add('active');
    searchMatches[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  updateSearchCount();
}

function highlightSearchMatches(query) {
  highlightTextMatches(viewer, query, document);
}

function navigateSearch(direction) {
  if (searchMatches.length === 0) return;

  // Remove active class from current match
  searchMatches[currentSearchIndex].classList.remove('active');

  // Update index
  currentSearchIndex += direction;

  // Wrap around
  if (currentSearchIndex < 0) {
    currentSearchIndex = searchMatches.length - 1;
  } else if (currentSearchIndex >= searchMatches.length) {
    currentSearchIndex = 0;
  }

  // Add active class and scroll to new match
  searchMatches[currentSearchIndex].classList.add('active');
  searchMatches[currentSearchIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });

  updateSearchCount();
}

function clearSearch() {
  // Remove all highlights
  const highlights = viewer.querySelectorAll('.search-highlight');
  highlights.forEach(highlight => {
    const parent = highlight.parentElement;
    highlight.replaceWith(document.createTextNode(highlight.textContent));
    if (parent) parent.normalize();
  });

  searchMatches = [];
  currentSearchIndex = -1;
  searchCount.textContent = '0/0';
}

function updateSearchCount() {
  if (searchMatches.length > 0) {
    searchCount.textContent = `${currentSearchIndex + 1}/${searchMatches.length}`;
  } else {
    searchCount.textContent = '0/0';
  }
}

// ==================== Table of Contents ====================

tocBtn.addEventListener('click', () => {
  tocSidebar.classList.toggle('hidden');
});

tocCloseBtn.addEventListener('click', () => {
  tocSidebar.classList.add('hidden');
});

function generateTableOfContents() {
  const headings = viewer.querySelectorAll('h1, h2, h3, h4');

  if (headings.length === 0) {
    tocContent.innerHTML = '<p style="padding: 12px; color: #57606a;">No headings found</p>';
    return;
  }

  tocContent.innerHTML = '';

  headings.forEach((heading, index) => {
    // Add id to heading if it doesn't have one
    if (!heading.id) {
      heading.id = `heading-${index}`;
    }

    const item = document.createElement('div');
    item.className = `toc-item toc-${heading.tagName.toLowerCase()}`;
    item.textContent = heading.textContent;

    item.addEventListener('click', () => {
      heading.scrollIntoView({ behavior: 'smooth' });
    });

    tocContent.appendChild(item);
  });
}

// ==================== Export to PDF ====================

exportBtn.addEventListener('click', async () => {
  if (!currentFile) return;
  await nativeWindow.print();
});

// ==================== Keyboard Shortcuts ====================

document.addEventListener('keydown', async (e) => {
  // F5 / Ctrl+R: Refresh only the active document, not the whole application.
  if (isDocumentRefreshShortcut(e)) {
    e.preventDefault();
    refreshActiveDocument();
    return;
  }

  // Ctrl+O: Open file
  if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'o') {
    e.preventDefault();
    openBtn.click();
  }

  // Ctrl+E: Toggle edit mode
  if (e.ctrlKey && e.key === 'e') {
    e.preventDefault();
    if (currentFile) {
      editBtn.click();
    }
  }

  // Ctrl+S: Save (in edit mode)
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    if (currentFile && viewMode !== 'preview') {
      if (!await saveActiveFile()) return;
      console.log('File saved');

      // Show a brief save indicator
      const originalText = editBtn.textContent;
      editBtn.textContent = 'Saved!';
      setTimeout(() => {
        editBtn.textContent = originalText;
      }, 1000);
    }
  }

  // Esc: Exit edit mode or close search
  if (e.key === 'Escape') {
    if (!diagramLightbox.classList.contains('hidden')) {
      closeDiagramLightbox();
    } else if (isEditMode) {
      if (!await saveActiveFile()) return;
      setViewMode('preview');
      await renderDocument(editor.value);
    } else if (searchPanel.style.display !== 'none') {
      searchClose.click();
    }
  }

  // Ctrl+Shift+O: Open folder
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'o') {
    e.preventDefault();
    openFolderBtn.click();
  }

  // Ctrl+F: Open search
  if (e.ctrlKey && e.key === 'f') {
    e.preventDefault();
    searchBtn.click();
  }

  // Ctrl+Left: Back
  if ((e.ctrlKey || e.altKey) && e.key === 'ArrowLeft') {
    e.preventDefault();
    if (!backBtn.disabled) {
      navigateBack();
    }
  }

  // Ctrl+Right: Forward
  if ((e.ctrlKey || e.altKey) && e.key === 'ArrowRight') {
    e.preventDefault();
    if (!forwardBtn.disabled) {
      navigateForward();
    }
  }
});

document.addEventListener('wheel', (e) => {
  if (e.ctrlKey) {
    e.preventDefault();
    const direction = e.deltaY < 0 ? 1 : -1;
    setContentZoom(contentZoom + direction * ZOOM_STEP);
    return;
  }

  if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && container.scrollWidth > container.clientWidth) {
    e.preventDefault();
    container.scrollLeft += e.deltaX;
  }
}, { passive: false });

// ==================== Drag and Drop ====================

events.on('filesDropped', event => {
  openFilesInOrder(event.detail || []);
});

console.log('Renderer loaded');
