# Contributing to Simple Markdown Viewer

Thank you for your interest in contributing to Simple Markdown Viewer! This document provides guidelines and instructions for contributing.

## Getting Started

### Prerequisites

- Node.js 16 or higher
- npm
- Git
- A code editor (VS Code recommended)

### Setting Up Development Environment

1. Fork the repository on GitHub
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/simple-markdown-viewer.git
   cd simple-markdown-viewer
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run the development version:
   ```bash
   npm start
   ```

## Development Workflow

### Making Changes

1. Create a new branch for your feature or fix:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes in the appropriate files:
   - `index.html` - UI structure
   - `renderer.js` - Application logic
   - `styles.css` - Styling and themes
   - `package.json` - Dependencies and configuration

3. Test your changes thoroughly:
   - Run `npm start` to test in development mode
   - Test in both light and dark modes
   - Test all keyboard shortcuts
   - Test with various Markdown files

4. Commit your changes with clear, descriptive messages:
   ```bash
   git add .
   git commit -m "Add feature: description of your changes"
   ```

### Code Style Guidelines

- Use **2 spaces** for indentation
- Use **semicolons** in JavaScript
- Use **camelCase** for variables and functions
- Add **comments** for complex logic
- Keep functions **small and focused**
- Follow existing code patterns and structure

### Architecture Guidelines

See [CLAUDE.md](CLAUDE.md) for detailed architecture documentation. Key points:

- **Organized by feature**: Code is organized into sections (Navigation, Search, TOC, etc.)
- **Two-pass rendering**: Markdown first, then Mermaid diagrams
- **State management**: Global state variables at the top of renderer.js
- **Event-driven**: Event listeners for all user interactions

## Submitting Changes

### Pull Request Process

1. Push your changes to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

2. Create a Pull Request on GitHub:
   - Go to the original repository
   - Click "New Pull Request"
   - Select your fork and branch
   - Fill out the PR template with details

3. PR Requirements:
   - Clear description of changes
   - Reference any related issues
   - Include screenshots for UI changes
   - Ensure all features work as expected

### PR Checklist

Before submitting, ensure:
- [ ] Code follows style guidelines
- [ ] All features work in development mode
- [ ] No console errors or warnings
- [ ] Dark mode works correctly
- [ ] All keyboard shortcuts work
- [ ] Changes don't break existing features
- [ ] Code is well-commented
- [ ] Commit messages are clear

## Types of Contributions

### Bug Reports

- Use GitHub Issues
- Include steps to reproduce
- Include screenshots if applicable
- Specify your OS and Node.js version

### Feature Requests

- Use GitHub Issues with "enhancement" label
- Clearly describe the feature
- Explain the use case
- Include mockups if applicable

### Code Contributions

Welcome contributions include:
- Bug fixes
- New features
- Performance improvements
- UI/UX enhancements
- Documentation improvements
- Tests

### Documentation

- Fix typos or unclear sections
- Add examples and screenshots
- Improve installation instructions
- Add troubleshooting guides

## Testing

Currently, the project doesn't have automated tests. When testing:

1. **Basic Functionality**
   - Open various .md files
   - Test editing and saving
   - Test drag-and-drop

2. **Navigation**
   - Back/forward buttons
   - Recent files list
   - Link navigation

3. **Search**
   - Search in various documents
   - Test previous/next navigation
   - Test with special characters

4. **Table of Contents**
   - Open/close sidebar
   - Click headings to navigate
   - Test with documents with/without headings

5. **Keyboard Shortcuts**
   - Test all shortcuts listed in README
   - Ensure no conflicts

## Questions?

If you have questions:
- Check [CLAUDE.md](CLAUDE.md) for architecture details
- Review existing code for patterns
- Open a GitHub Discussion
- Contact Derek Bowes at derek@subskeepr.com

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to Simple Markdown Viewer!

Derek Bowes
SubsKeepr Inc.
