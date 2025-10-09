// renderer.js
nw.Window.get().showDevTools();

// Load highlight.js as a Node module
const hljs = require('highlight.js');

// DOM Elements
const viewer = document.getElementById('viewer');
const editor = document.getElementById('editor');
const filenameSpan = document.getElementById('filename');
const editBtn = document.getElementById('editBtn');
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
const exportBtn = document.getElementById('exportBtn');

// State
let currentFile = null;
let isEditMode = false;
let history = [];
let historyIndex = -1;
let searchMatches = [];
let currentSearchIndex = -1;
let fileWatcher = null;
let recentFiles = JSON.parse(localStorage.getItem('recentFiles') || '[]');

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

  // Configure marked with syntax highlighting
  if (typeof marked !== 'undefined') {
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
  }

  // Setup link handling
  setupLinkHandling();

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

  input.addEventListener('change', function () {
    const filePath = this.value;
    console.log('File selected:', filePath);
    if (filePath) {
      loadFile(filePath);
    }
  });

  input.click();
});

// Edit button toggle
editBtn.addEventListener('click', () => {
  isEditMode = !isEditMode;
  if (isEditMode) {
    viewer.style.display = 'none';
    editor.style.display = 'block';
    editor.value = editor.dataset.raw;
    editBtn.textContent = 'Preview';
  } else {
    editor.style.display = 'none';
    viewer.style.display = 'block';
    renderMarkdown(editor.value);
    editBtn.textContent = 'Edit';

    // Save changes
    if (currentFile) {
      const fs = require('fs');
      fs.writeFileSync(currentFile, editor.value, 'utf8');
    }
  }
});

function loadFile(filePath, addToHistoryFlag = true) {
  const fs = require('fs');
  const path = require('path');

  console.log('Loading file:', filePath);

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    currentFile = filePath;
    filenameSpan.textContent = path.basename(filePath);
    editor.dataset.raw = content;
    editBtn.style.display = 'inline-block';
    exportBtn.style.display = 'inline-block';

    renderMarkdown(content);

    // Add to history
    if (addToHistoryFlag) {
      addToHistory(filePath);
    } else {
      updateNavigationButtons();
    }

    // Add to recent files
    addToRecentFiles(filePath);

    // Setup file watcher
    setupFileWatcher(filePath);

    // Clear search
    clearSearch();

  } catch (err) {
    console.error('Error loading file:', err);
    viewer.innerHTML = `<div class="error">Error loading file: ${err.message}</div>`;
  }
}

async function renderMarkdown(markdown) {
  console.log('Rendering markdown');

  if (typeof marked === 'undefined') {
    viewer.innerHTML = '<div class="error">Marked.js not loaded</div>';
    return;
  }

  // First pass: render markdown
  const html = marked.parse(markdown);
  viewer.innerHTML = html;

  // Second pass: render mermaid diagrams
  if (typeof mermaid !== 'undefined') {
    const mermaidBlocks = viewer.querySelectorAll('code.language-mermaid');
    for (let i = 0; i < mermaidBlocks.length; i++) {
      const block = mermaidBlocks[i];
      const code = block.textContent;
      try {
        const { svg } = await mermaid.render(`mermaid-${i}`, code);
        const wrapper = document.createElement('div');
        wrapper.className = 'mermaid-wrapper';
        wrapper.innerHTML = svg;
        block.parentElement.replaceWith(wrapper);
      } catch (err) {
        console.error('Mermaid rendering error:', err);
      }
    }
  }

  // Generate Table of Contents
  generateTableOfContents();
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

function setupFileWatcher(filePath) {
  // Clear existing watcher
  if (fileWatcher) {
    fileWatcher.close();
    fileWatcher = null;
  }

  const fs = require('fs');

  try {
    fileWatcher = fs.watch(filePath, (eventType, filename) => {
      if (eventType === 'change') {
        console.log('File changed, reloading...');

        // Only reload if not in edit mode
        if (!isEditMode) {
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            editor.dataset.raw = content;
            renderMarkdown(content);
          } catch (err) {
            console.error('Error reloading file:', err);
          }
        }
      }
    });

    console.log('File watcher set up for:', filePath);
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
    if (isEditMode && currentFile) {
      const fs = require('fs');
      fs.writeFileSync(currentFile, editor.value, 'utf8');
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
    if (isEditMode) {
      editBtn.click();
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

// ==================== Drag and Drop ====================

document.addEventListener('dragover', (e) => {
  e.preventDefault();
});

document.addEventListener('drop', (e) => {
  e.preventDefault();
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    const file = files[0];
    if (file.path && file.path.endsWith('.md')) {
      loadFile(file.path);
    }
  }
});

console.log('Renderer loaded');
