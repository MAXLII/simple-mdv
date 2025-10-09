# Simple Markdown Viewer

A powerful, feature-rich desktop Markdown viewer built with NW.js. Perfect for reading, editing, and navigating through Markdown documentation with ease.

![Simple Markdown Viewer](screenshot.png)

## Features

### 📖 **Rich Markdown Support**
- GitHub-flavored Markdown (GFM)
- Mermaid diagram rendering
- Syntax highlighting for 100+ programming languages
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
- Drag-and-drop file loading
- Comprehensive keyboard shortcuts
- Command-line file opening

## Installation

### Download Pre-built Binary
Download the latest release from the [Releases](https://github.com/yourusername/simple-markdown-viewer/releases) page.

### Build from Source

**Prerequisites:**
- Node.js 16 or higher
- npm

**Steps:**

```bash
# Clone the repository
git clone https://github.com/yourusername/simple-markdown-viewer.git
cd simple-markdown-viewer

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
- **Drag and drop** a .md file into the window
- **Command line**: `simple-markdown-viewer file.md`
- **Recent files** dropdown for quick access

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+O` | Open file |
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

- **NW.js** - Desktop application framework
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
├── styles.css          # Styling and themes
├── package.json        # Dependencies and config
├── CLAUDE.md          # AI development guide
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

## Author

**Derek Bowes**
SubsKeepr Inc.
[derek@subskeepr.com](mailto:derek@subskeepr.com)

## Acknowledgments

- [Marked.js](https://marked.js.org/) - Fast Markdown parser
- [Mermaid.js](https://mermaid.js.org/) - Diagram and charting tool
- [Highlight.js](https://highlightjs.org/) - Syntax highlighter
- [NW.js](https://nwjs.io/) - Desktop application platform

## Support

If you encounter any issues or have questions, please [open an issue](https://github.com/yourusername/simple-markdown-viewer/issues) on GitHub.

---

Made with ❤️ by Derek Bowes at SubsKeepr Inc.
