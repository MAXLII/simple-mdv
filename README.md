# simple-mdv

A lightweight desktop Markdown, plain-text, and source-code viewer built with Neutralinojs and the Windows WebView2 runtime. It supports reading, editing, and navigating documents in one tabbed window.

This repository is based on the upstream project [KrunchMuffin/simple-markdown-viewer](https://github.com/KrunchMuffin/simple-markdown-viewer). The upstream project is licensed under the MIT License, which permits modification and redistribution when the original copyright and license notice are retained.

![Simple Markdown Viewer](screenshot.png)

## Features

### 📖 **Rich Markdown Support**
- GitHub-flavored Markdown (GFM)
- Mermaid diagram rendering
- Syntax highlighting for Markdown code blocks and C/C++/JavaScript/JSON source files
- Live preview with smooth rendering

### 🧭 **Smart Navigation**
- **Browser-like history** - Navigate back and forward between documents
- **Recent files** - Quick access to your last 10 opened files
- **Link navigation** - Click between linked .md files seamlessly
- **Table of Contents** - Auto-generated sidebar from document headings

### 🔍 **Powerful Search**
- Find text within documents (Ctrl+F)
- Real-time match highlighting
- Navigate through results with keyboard shortcuts
- Match counter showing current position

### ✏️ **Editing Made Easy**
- Built-in editor with live preview toggle
- C/C++ syntax highlighting in both preview and edit modes
- Auto-save functionality
- File watcher for external changes
- Preserves formatting and styling

### 🎨 **Beautiful Interface**
- Light and dark mode with auto-switching syntax themes
- GitHub-inspired design
- Responsive layout
- Smooth animations and transitions

### ⚡ **Productivity Features**
- Export to PDF
- VS Code-style folder explorer with on-demand directory expansion
- Drag-and-drop file loading
- Comprehensive keyboard shortcuts
- Command-line file opening
- Files opened from Explorer are forwarded to the already-running app

## Installation

### Android tablet edition

The Android edition provides a Simplified Chinese tablet interface with offline
reading, folder access, Markdown rendering, editing, and recovery drafts. See
[Android build and usage instructions](docs/android.md) and
[device validation results](docs/android-validation.md).

### Download Pre-built Binary
Download the latest release from the [Releases](https://github.com/MAXLII/simple-mdv/releases) page.

The Windows setup wizard installs the app for the current user, can create a
desktop shortcut, and can associate `.md` files with Simple Markdown Viewer so
they open by double-clicking. The Windows installer is approximately 3 MB because
the app uses the system WebView2 runtime instead of bundling Chromium and Node.js.

### Build from Source

**Prerequisites:**
- Node.js 18 or higher
- npm

**Steps:**

```bash
# Clone the repository
git clone https://github.com/MAXLII/simple-mdv.git
cd simple-mdv

# Install dependencies
npm install

# Run in development mode
npm start

# Build for production (Windows 64-bit)
npm run build
```

The built application will be in the `dist/` directory.

## Usage

### Opening Files

- **Click "Open File"** button in the toolbar
- **Click "Open Folder"** to browse a project from the Explorer sidebar
- **Drag and drop** Markdown, text, or supported source files into the window
- **Windows Explorer**: Double-click an associated .md file
- **Command line**: `simple-markdown-viewer file.md` or `simple-markdown-viewer source.c`
- **Recent files** dropdown for quick access

Supported text and source extensions include `.txt`, `.c`, `.h`, `.cpp`, `.hpp`,
`.js`, `.ts`, `.json`, `.css`, `.html`, `.xml`, `.py`, `.java`, `.sh`, `.ps1`,
`.ini`, `.yaml`, `.toml`, `.csv`, and related variants. Markdown-only actions such
as Compare, TOC, and Export PDF are hidden for ordinary text and source files.

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+O` | Open file |
| `Ctrl+Shift+O` | Open folder |
| `Ctrl+E` | Toggle edit mode |
| `Ctrl+S` | Save file (in edit mode) |
| `Ctrl+F` | Open search |
| `Ctrl+Left` | Navigate back |
| `Ctrl+Right` | Navigate forward |
| `Esc` | Exit edit mode / Close search |

### Navigation

- Click on links to other .md files to navigate
- Use the ← and → buttons to go back and forward
- Recent files dropdown shows your last 10 opened files

### Search

1. Press `Ctrl+F` or click the 🔍 Search button
2. Type your search query
3. Use ↑ and ↓ buttons to navigate matches
4. Press `Esc` to close search

### Table of Contents

- Click the 📑 TOC button to open the sidebar
- Click any heading to jump to that section
- Automatically generated from H1-H4 headings

### Editing

1. Click the "Edit" button to switch to edit mode
2. Make your changes in the text editor
3. Click "Preview" to see the rendered result
4. Press `Ctrl+S` to save your changes

### Dark Mode

Click the 🌙/☀️ button in the toolbar to toggle between light and dark mode. Your preference is automatically saved.

## Supported Markdown Features

- **Headers** (H1-H6)
- **Emphasis** (bold, italic, strikethrough)
- **Lists** (ordered, unordered, task lists)
- **Links** (internal, external, anchor)
- **Images**
- **Code blocks** with syntax highlighting
- **Inline code**
- **Blockquotes**
- **Tables**
- **Horizontal rules**
- **Mermaid diagrams** (flowcharts, sequence diagrams, etc.)

## Technology Stack

- **Neutralinojs** - Lightweight desktop framework using the system WebView2 runtime
- **Marked.js** - Markdown parser
- **Mermaid.js** - Diagram rendering
- **Highlight.js** - Syntax highlighting
- Pure HTML, CSS, and JavaScript - No heavy frameworks

## Development

### Project Structure

```
simple-markdown-viewer/
├── index.html          # Main HTML structure
├── renderer.js         # Application logic
├── document-support.js # File-type and launch-argument handling
├── neutralino.config.json # Neutralino native/runtime configuration
├── styles.css          # Styling and themes
├── scripts/            # Frontend bundler, launcher, and installer sources
├── package.json        # Dependencies and config
└── README.md          # This file
```

### Adding Features

See [CLAUDE.md](CLAUDE.md) for detailed architecture documentation and development guidelines.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Upstream Source

This project is derived from [KrunchMuffin/simple-markdown-viewer](https://github.com/KrunchMuffin/simple-markdown-viewer), originally published by Derek Bowes / SubsKeepr Inc. under the MIT License. The MIT License allows reuse, modification, publication, distribution, sublicensing, and sale of copies of the software, provided that the copyright notice and permission notice are included in copies or substantial portions of the software.

## Author

**Derek Bowes**
SubsKeepr Inc.
[derek@subskeepr.com](mailto:derek@subskeepr.com)

## Acknowledgments

- [Marked.js](https://marked.js.org/) - Fast Markdown parser
- [Mermaid.js](https://mermaid.js.org/) - Diagram and charting tool
- [Highlight.js](https://highlightjs.org/) - Syntax highlighter
- [Neutralinojs](https://neutralino.js.org/) - Lightweight desktop application platform

## Support

If you encounter any issues or have questions, please [open an issue](https://github.com/MAXLII/simple-mdv/issues) on GitHub.

---

Made with ❤️ by Derek Bowes at SubsKeepr Inc.
