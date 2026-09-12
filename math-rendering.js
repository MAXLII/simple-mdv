const katex = require('katex');

// Parse math with Marked, but defer its generated layout until Markdown HTML
// has been sanitized. User HTML never gets permission to keep inline styles.
function createMathExtension(markedKatex) {
  const extension = markedKatex({ nonStandard: true });
  for (const rule of extension.extensions) {
    rule.renderer = token => {
      const source = encodeURIComponent(token.text).replace(/'/g, '%27');
      return `<span data-mdv-math="${source}" data-mdv-display="${token.displayMode ? 'block' : 'inline'}"></span>` +
        (rule.level === 'block' ? '\n' : '');
    };
  }
  return extension;
}

function renderMathElements(target) {
  for (const placeholder of target.querySelectorAll('[data-mdv-math]')) {
    try {
      const source = decodeURIComponent(placeholder.getAttribute('data-mdv-math'));
      placeholder.innerHTML = katex.renderToString(source, {
        displayMode: placeholder.getAttribute('data-mdv-display') === 'block',
        throwOnError: false,
        trust: false,
        maxExpand: 1000
      });
    } catch (error) {
      placeholder.textContent = '公式无法解析';
      placeholder.title = String(error.message || error);
    }
    placeholder.removeAttribute('data-mdv-math');
    placeholder.removeAttribute('data-mdv-display');
  }
}

module.exports = { createMathExtension, renderMathElements };
