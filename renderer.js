// renderer.js

// Load highlight.js as a Node module
const hljs = require('highlight.js');
const markedKatex = require('marked-katex-extension');
const { pathToFileURL } = require('url');

// DOM Elements
const viewer = document.getElementById('viewer');
const zoomSurface = document.getElementById('zoomSurface');
const container = document.getElementById('container');
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
let fileWatcher = null;
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
  const hasFile = !!getActiveTab();
  editBtn.style.display = hasFile ? 'inline-block' : 'none';
  compareBtn.style.display = hasFile ? 'inline-block' : 'none';
  exportBtn.style.display = hasFile ? 'inline-block' : 'none';
}

function updateModeButtons() {
  editBtn.textContent = viewMode === 'edit' ? 'Preview' : 'Edit';
  compareBtn.textContent = viewMode === 'compare' ? 'Preview' : 'Compare';
}

function renderTabs() {
  const path = require('path');
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
  if (tab.watcher) {
    tab.watcher.close();
  }

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
  filenameSpan.textContent = activeTab ? require('path').basename(activeTab.filePath) : '';
  editor.dataset.raw = activeTab ? activeTab.content : '';
  editor.value = activeTab ? activeTab.content : '';
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

  await renderMarkdown(activeTab.content);
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
    editor.style.display = 'none';
    compareSurface.style.display = 'none';
    zoomSurface.style.display = 'block';
  } else if (viewMode === 'edit') {
    zoomSurface.style.display = 'none';
    compareSurface.style.display = 'none';
    editor.style.display = 'block';
  } else {
    zoomSurface.style.display = 'none';
    editor.style.display = 'block';
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

// Handle file opening from command line
if (nw.App.argv.length > 0) {
  const filePath = nw.App.argv[0];
  if (filePath.endsWith('.md')) {
    loadFile(filePath);
  }
}

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
  const path = require('path');

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
openBtn.addEventListener('click', () => {
  console.log('Open button clicked');

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.md,.markdown';
  input.multiple = true;

  input.addEventListener('change', function () {
    const files = Array.from(this.files || []);
    if (files.length > 0) {
      files.forEach(file => {
        const filePath = file.path || file.name;
        console.log('File selected:', filePath);
        if (filePath) {
          loadFile(filePath);
        }
      });
    }
  });

  input.click();
});

// Edit button toggle
editBtn.addEventListener('click', () => {
  if (!currentFile) return;

  if (viewMode === 'edit') {
    saveActiveFile();
    setViewMode('preview');
    renderMarkdown(editor.value);
  } else {
    persistActiveEditorContent();
    editor.value = getActiveTab().content;
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
  renderTabs();

  if (viewMode === 'compare') {
    clearTimeout(compareRenderTimer);
    compareRenderTimer = setTimeout(() => {
      renderMarkdownInto(editor.value, compareViewer, false);
    }, 200);
  }
});

function loadFile(filePath, addToHistoryFlag = true) {
  const fs = require('fs');
  const path = require('path');

  console.log('Loading file:', filePath);

  try {
    const resolvedPath = path.resolve(filePath);
    const existingTab = openTabs.find(tab => tab.filePath === resolvedPath);
    if (existingTab) {
      activateTab(existingTab.id);
      return;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const tab = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      filePath: resolvedPath,
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

function saveActiveFile() {
  const activeTab = getActiveTab();
  if (!activeTab || !currentFile) return;

  const fs = require('fs');
  activeTab.content = editor.value;
  activeTab.savedContent = editor.value;
  activeTab.dirty = false;
  editor.dataset.raw = editor.value;
  fs.writeFileSync(currentFile, editor.value, 'utf8');
  renderTabs();
}

async function renderMarkdown(markdown) {
  await renderMarkdownInto(markdown, viewer, true);
}

async function renderMarkdownInto(markdown, targetElement, updateToc = false) {
  console.log('Rendering markdown');

  if (typeof marked === 'undefined') {
    targetElement.innerHTML = '<div class="error">Marked.js not loaded</div>';
    return;
  }
  configureMarked();

  // First pass: render markdown
  const html = marked.parse(markdown);
  targetElement.innerHTML = html;
  normalizeImageSources(targetElement);

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

function normalizeImageSources(targetElement) {
  const activeTab = getActiveTab();
  if (!activeTab) return;

  const path = require('path');
  const baseDir = path.dirname(activeTab.filePath);
  const images = targetElement.querySelectorAll('img');

  images.forEach(img => {
    const rawSrc = img.getAttribute('src');
    if (!rawSrc || isExternalResource(rawSrc)) {
      return;
    }

    const decodedSrc = safeDecodeUri(rawSrc).replace(/\\/g, path.sep);
    const absolutePath = path.isAbsolute(decodedSrc)
      ? decodedSrc
      : path.resolve(baseDir, decodedSrc);

    img.src = pathToFileURL(absolutePath).href;
  });
}

function isExternalResource(src) {
  const path = require('path');
  if (path.win32.isAbsolute(src) || path.posix.isAbsolute(src)) {
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

      const path = require('path');
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
      require('nw.gui').Shell.openExternal(href);
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
  const lightTheme = document.getElementById('hljs-light');
  const darkTheme = document.getElementById('hljs-dark');

  if (lightTheme && darkTheme) {
    lightTheme.disabled = isDark;
    darkTheme.disabled = !isDark;
  }
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

exportBtn.addEventListener('click', () => {
  if (!currentFile) return;

  const path = require('path');
  const fs = require('fs');

  // Get the directory and filename
  const dir = path.dirname(currentFile);
  const basename = path.basename(currentFile, path.extname(currentFile));
  const pdfPath = path.join(dir, `${basename}.pdf`);

  // Use NW.js window print API
  const win = nw.Window.get();

  // Create a temporary print-friendly view
  const printWindow = window.open('', '', 'width=800,height=600');
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${basename}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
        h1 { border-bottom: 2px solid #333; }
        h2 { border-bottom: 1px solid #666; }
        code { background: #f5f5f5; padding: 2px 4px; }
        pre { background: #f5f5f5; padding: 12px; overflow-x: auto; }
      </style>
    </head>
    <body>${viewer.innerHTML}</body>
    </html>
  `);
  printWindow.document.close();

  // Wait a bit for content to load, then print
  setTimeout(() => {
    printWindow.print();
  }, 500);
});

// ==================== File Watcher ====================

function setupFileWatcher(tab) {
  const fs = require('fs');

  try {
    if (tab.watcher) {
      tab.watcher.close();
    }

    tab.watcher = fs.watch(tab.filePath, (eventType, filename) => {
      if (eventType === 'change') {
        console.log('File changed, reloading...', tab.filePath);

        if (tab.dirty) {
          return;
        }

        try {
          const content = fs.readFileSync(tab.filePath, 'utf8');
          tab.content = content;
          tab.savedContent = content;

          if (tab.id === activeTabId && viewMode === 'preview') {
            editor.dataset.raw = content;
            editor.value = content;
            renderMarkdown(content);
          }
        } catch (err) {
          console.error('Error reloading file:', err);
        }
      }
    });

    console.log('File watcher set up for:', tab.filePath);
  } catch (err) {
    console.error('Error setting up file watcher:', err);
  }
}

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
      renderMarkdown(editor.value);
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

document.addEventListener('dragover', (e) => {
  e.preventDefault();
});

document.addEventListener('drop', (e) => {
  e.preventDefault();
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    Array.from(files).forEach(file => {
      if (file.path && file.path.endsWith('.md')) {
        loadFile(file.path);
      }
    });
  }
});

console.log('Renderer loaded');
