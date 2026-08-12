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
import { normalizeLatexDisplayMath } from './markdown-math';
import {
  DOCUMENT_TYPES,
  getDocumentType,
  getSupportedPathsFromArguments,
  isSupportedDocument
} from './document-support';

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
const viewer = document.getElementById('viewer');
const zoomSurface = document.getElementById('zoomSurface');
const container = document.getElementById('container');
const editorSurface = document.getElementById('editorSurface');
const editorHighlight = document.getElementById('editorHighlight');
const editor = document.getElementById('editor');
const compareSurface = document.getElementById('compareSurface');
const compareViewer = document.getElementById('compareViewer');
const filenameSpan = document.getElementById('filename');
const editBtn = document.getElementById('editBtn');
const compareBtn = document.getElementById('compareBtn');
const openBtn = document.getElementById('openBtn');
const backBtn = document.getElementById('backBtn');
const forwardBtn = document.getElementById('forwardBtn');
const darkModeBtn = document.getElementById('darkModeBtn');
const searchBtn = document.getElementById('searchBtn');
const searchPanel = document.getElementById('searchPanel');
const searchInput = document.getElementById('searchInput');
const searchPrev = document.getElementById('searchPrev');
const searchNext = document.getElementById('searchNext');
const searchClose = document.getElementById('searchClose');
const searchCount = document.getElementById('searchCount');
const tocBtn = document.getElementById('tocBtn');
const tocSidebar = document.getElementById('tocSidebar');
const tocContent = document.getElementById('tocContent');
const tocCloseBtn = document.getElementById('tocCloseBtn');
const recentFilesSelect = document.getElementById('recentFiles');
const tabsBar = document.getElementById('tabsBar');
const exportBtn = document.getElementById('exportBtn');
const layoutWidthBtn = document.getElementById('layoutWidthBtn');
const zoomModeBtn = document.getElementById('zoomModeBtn');
const zoomResetBtn = document.getElementById('zoomResetBtn');
const diagramLightbox = document.getElementById('diagramLightbox');
const diagramContent = document.getElementById('diagramContent');
const diagramZoomOut = document.getElementById('diagramZoomOut');
const diagramZoomReset = document.getElementById('diagramZoomReset');
const diagramZoomIn = document.getElementById('diagramZoomIn');
const diagramClose = document.getElementById('diagramClose');

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

  activeTab.content = editor.value;
  activeTab.dirty = activeTab.content !== activeTab.savedContent;
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

    close.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(tab.id);
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

  persistActiveEditorContent();
  activeTabId = tabId;
  viewMode = 'preview';
  syncActiveTabToView();
}

function closeTab(tabId) {
  const closeIndex = openTabs.findIndex(tab => tab.id === tabId);
  if (closeIndex === -1) return;

  const tab = openTabs[closeIndex];
  openTabs.splice(closeIndex, 1);

  if (activeTabId === tabId) {
    const nextTab = openTabs[Math.min(closeIndex, openTabs.length - 1)];
    activeTabId = nextTab ? nextTab.id : null;
    viewMode = 'preview';
  }

  syncActiveTabToView();
}

async function syncActiveTabToView() {
  const activeTab = getActiveTab();
  currentFile = activeTab ? activeTab.filePath : null;
  filenameSpan.textContent = activeTab ? path.basename(activeTab.filePath) : '';
  editor.dataset.raw = activeTab ? activeTab.content : '';
  editor.value = activeTab ? activeTab.content : '';
  updateEditorHighlight();
  updateFileActions();
  updateModeButtons();
  renderTabs();
  clearSearch();

  if (!activeTab) {
    viewer.innerHTML = '';
    compareViewer.innerHTML = '';
    setViewMode('preview');
    return;
  }

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
      securityLevel: 'loose'
    });
  }

  configureMarked();

  // Setup link handling
  setupLinkHandling();
  setupDiagramLightbox();

  // Load recent files
  updateRecentFilesList();
});

function openFilesFromArguments(args) {
  getSupportedPathsFromArguments(args).forEach(filePath => loadFile(filePath));
}

async function initializeNativeOpenHandling() {
  openFilesFromArguments(window.NL_ARGS || []);

  const queueArgument = (window.NL_ARGS || []).find(arg => arg.startsWith('--open-queue='));
  if (!queueArgument) return;

  const queuePath = queueArgument.slice('--open-queue='.length);
  setInterval(async () => {
    try {
      const requests = await filesystem.readFile(queuePath);
      if (!requests.trim()) return;

      await filesystem.writeFile(queuePath, '');
      requests.split(/\r?\n/).filter(isSupportedDocument).forEach(filePath => loadFile(filePath));
    } catch (err) {
      // The launcher creates the queue lazily when a second file is opened.
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
  selectedPaths.forEach(filePath => loadFile(filePath));
});

// Edit button toggle
editBtn.addEventListener('click', () => {
  if (!currentFile) return;

  if (viewMode === 'edit') {
    saveActiveFile();
    setViewMode('preview');
    renderDocument(editor.value);
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
    saveActiveFile();
    setViewMode('preview');
    await renderMarkdown(editor.value);
  } else {
    persistActiveEditorContent();
    editor.value = getActiveTab().content;
    await renderMarkdownInto(editor.value, compareViewer, false);
    setViewMode('compare');
  }
});

let compareRenderTimer = null;

editor.addEventListener('input', () => {
  const activeTab = getActiveTab();
  if (!activeTab) return;

  activeTab.content = editor.value;
  activeTab.dirty = activeTab.content !== activeTab.savedContent;
  updateEditorHighlight();
  renderTabs();

  if (viewMode === 'compare') {
    clearTimeout(compareRenderTimer);
    compareRenderTimer = setTimeout(() => {
      renderMarkdownInto(editor.value, compareViewer, false);
    }, 200);
  }
});

editor.addEventListener('scroll', syncEditorHighlightScroll);

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
      return;
    }

    const content = await filesystem.readFile(resolvedPath);
    const tab = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      filePath: resolvedPath,
      documentType,
      content,
      savedContent: content,
      dirty: false,
      watcher: null
    };

    persistActiveEditorContent();
    openTabs.push(tab);
    activeTabId = tab.id;
    currentFile = resolvedPath;
    viewMode = 'preview';

    syncActiveTabToView();

    // Add to history
    if (addToHistoryFlag) {
      addToHistory(resolvedPath);
    } else {
      updateNavigationButtons();
    }

    // Add to recent files
    addToRecentFiles(resolvedPath);

    // Setup file watcher
    setupFileWatcher(tab);

  } catch (err) {
    console.error('Error loading file:', err);
    viewer.innerHTML = `<div class="error">Error loading file: ${err.message}</div>`;
  }
}

async function saveActiveFile() {
  const activeTab = getActiveTab();
  if (!activeTab || !currentFile) return;

  activeTab.content = editor.value;
  activeTab.savedContent = editor.value;
  activeTab.dirty = false;
  editor.dataset.raw = editor.value;
  await filesystem.writeFile(currentFile, editor.value);
  renderTabs();
}

async function renderMarkdown(markdown) {
  await renderDocument(markdown);
}

async function renderDocument(content, targetElement = viewer, tab = getActiveTab(), updateToc = targetElement === viewer) {
  if (!tab) return;

  if (tab.documentType.kind === 'markdown') {
    await renderMarkdownInto(content, targetElement, updateToc);
    return;
  }

  renderTextInto(content, targetElement, tab.documentType);
  if (updateToc) {
    tocContent.innerHTML = '';
    updateZoomSurfaceSize();
  }
}

function renderTextInto(content, targetElement, documentType) {
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  pre.className = 'source-preview';

  if (documentType.language && hljs.getLanguage(documentType.language)) {
    code.className = `language-${documentType.language}`;
    code.innerHTML = hljs.highlight(content, { language: documentType.language }).value;
  } else {
    code.textContent = content;
  }

  pre.appendChild(code);
  targetElement.innerHTML = '';
  targetElement.appendChild(pre);
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

async function renderMarkdownInto(markdown, targetElement, updateToc = false) {
  console.log('Rendering markdown');

  if (typeof marked === 'undefined') {
    targetElement.innerHTML = '<div class="error">Marked.js not loaded</div>';
    return;
  }
  configureMarked();

  // First pass: render markdown
  const html = marked.parse(normalizeLatexDisplayMath(markdown));
  targetElement.innerHTML = html;
  await normalizeImageSources(targetElement);

  // Second pass: render mermaid diagrams
  if (typeof mermaid !== 'undefined') {
    const mermaidBlocks = targetElement.querySelectorAll('code.language-mermaid');
    for (let i = 0; i < mermaidBlocks.length; i++) {
      const block = mermaidBlocks[i];
      const code = block.textContent;
      try {
        const { svg } = await mermaid.render(`mermaid-${Date.now()}-${i}`, code);
        const wrapper = document.createElement('div');
        wrapper.className = 'mermaid-wrapper';
        wrapper.innerHTML = svg;
        block.parentElement.replaceWith(wrapper);
      } catch (err) {
        console.error('Mermaid rendering error:', err);
      }
    }
  }

  if (updateToc) {
    // Generate Table of Contents
    generateTableOfContents();
    updateZoomSurfaceSize();
  }
}

async function normalizeImageSources(targetElement) {
  const activeTab = getActiveTab();
  if (!activeTab) return;

  const baseDir = path.dirname(activeTab.filePath);
  const images = targetElement.querySelectorAll('img');

  await Promise.all(Array.from(images).map(async img => {
    const rawSrc = img.getAttribute('src');
    if (!rawSrc || isExternalResource(rawSrc)) {
      return;
    }

    const decodedSrc = safeDecodeUri(rawSrc);
    const absolutePath = path.isAbsolute(decodedSrc)
      ? decodedSrc
      : path.resolve(baseDir, decodedSrc);

    try {
      const data = await filesystem.readBinaryFile(absolutePath);
      const mimeTypes = {
        '.gif': 'image/gif',
        '.jpeg': 'image/jpeg',
        '.jpg': 'image/jpeg',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp'
      };
      const mimeType = mimeTypes[path.extname(absolutePath).toLowerCase()] || 'application/octet-stream';
      img.src = URL.createObjectURL(new Blob([data], { type: mimeType }));
    } catch (err) {
      console.error('Unable to load local image:', absolutePath, err);
    }
  }));
}

function isExternalResource(src) {
  if (path.isAbsolute(src)) {
    return false;
  }

  return /^(?:[a-z][a-z0-9+.-]*:|#)/i.test(src);
}

function safeDecodeUri(value) {
  try {
    return decodeURI(value);
  } catch (err) {
    return value;
  }
}

// ==================== Link Handling ====================

function setupLinkHandling() {
  viewer.addEventListener('click', (e) => {
    // Check if clicked element is a link
    const link = e.target.closest('a');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;

    // Handle .md files
    if (href.endsWith('.md') || href.endsWith('.markdown')) {
      e.preventDefault();

      let targetPath;

      // Handle relative paths
      if (!path.isAbsolute(href)) {
        const currentDir = path.dirname(currentFile);
        targetPath = path.resolve(currentDir, href);
      } else {
        targetPath = href;
      }

      console.log('Loading linked file:', targetPath);
      loadFile(targetPath);
    }
    // Let external links open normally
    else if (href.startsWith('http://') || href.startsWith('https://')) {
      e.preventDefault();
      os.open(href);
    }
    // Handle anchor links (headings)
    else if (href.startsWith('#')) {
      e.preventDefault();
      const target = document.querySelector(href);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      }
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
  const walker = document.createTreeWalker(
    viewer,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function(node) {
        // Skip script and style elements
        if (node.parentElement.tagName === 'SCRIPT' ||
            node.parentElement.tagName === 'STYLE') {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  const nodesToReplace = [];
  const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (regex.test(node.textContent)) {
      nodesToReplace.push(node);
    }
  }

  nodesToReplace.forEach(node => {
    const span = document.createElement('span');
    span.innerHTML = node.textContent.replace(regex, match =>
      `<span class="search-highlight">${match}</span>`
    );
    node.parentNode.replaceChild(span, node);
  });
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
    if (parent && parent.tagName === 'SPAN') {
      // Replace the wrapper span with its text content
      const textNode = document.createTextNode(parent.textContent);
      parent.parentNode.replaceChild(textNode, parent);
    }
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

// ==================== File Watcher ====================

async function setupFileWatcher(tab) {
  try {
    tab.watcher = await filesystem.createWatcher(path.dirname(tab.filePath));
    console.log('File watcher set up for:', tab.filePath);
  } catch (err) {
    console.error('Error setting up file watcher:', err);
  }
}

events.on('watchFile', async event => {
  if (event.detail.action !== 'modified') return;

  const changedPath = path.resolve(event.detail.dir, event.detail.filename);
  const matchingTabs = openTabs.filter(tab =>
    tab.watcher === event.detail.id &&
    tab.filePath.toLowerCase() === changedPath.toLowerCase() &&
    !tab.dirty
  );

  for (const tab of matchingTabs) {
    try {
      const content = await filesystem.readFile(tab.filePath);
      tab.content = content;
      tab.savedContent = content;
      if (tab.id === activeTabId && viewMode === 'preview') {
        editor.dataset.raw = content;
        editor.value = content;
        await renderDocument(content);
      }
    } catch (err) {
      console.error('Error reloading file:', err);
    }
  }
});

// ==================== Keyboard Shortcuts ====================

document.addEventListener('keydown', (e) => {
  // Ctrl+O: Open file
  if (e.ctrlKey && e.key === 'o') {
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
      saveActiveFile();
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
      saveActiveFile();
      setViewMode('preview');
      renderDocument(editor.value);
    } else if (searchPanel.style.display !== 'none') {
      searchClose.click();
    }
  }

  // Ctrl+F: Open search
  if (e.ctrlKey && e.key === 'f') {
    e.preventDefault();
    searchBtn.click();
  }

  // Ctrl+Left: Back
  if (e.ctrlKey && e.key === 'ArrowLeft') {
    e.preventDefault();
    if (!backBtn.disabled) {
      navigateBack();
    }
  }

  // Ctrl+Right: Forward
  if (e.ctrlKey && e.key === 'ArrowRight') {
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
  (event.detail || []).forEach(filePath => {
    if (isSupportedDocument(filePath)) {
      loadFile(filePath);
    }
  });
});

console.log('Renderer loaded');
