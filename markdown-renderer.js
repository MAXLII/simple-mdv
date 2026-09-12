const createDOMPurify = require('dompurify');
const { createRenderCoordinator } = require('./async-lifecycle');

const MAX_MERMAID_SOURCE_LENGTH = 100000;
const { compatibleFlowchartSource } = require('./mermaid-support');
const { renderMathElements } = require('./math-rendering');

function createMarkdownRenderer({ window, marked, mermaid, hljs, filesystem, path,
  normalizeLatexDisplayMath, configureMarked, isRenderAllowed, onRendered, loadLocalImage }) {
  const purifier = createDOMPurify(window);
  if (loadLocalImage) {
    purifier.addHook('uponSanitizeAttribute', (node, attribute) => {
      // Preserve file-image references as inert metadata, never as WebView file URLs.
      if (node.tagName === 'IMG' && attribute.attrName === 'src' && /^file:\/\//i.test(attribute.attrValue)) {
        node.setAttribute('data-mdv-file-src', attribute.attrValue);
        attribute.keepAttr = false;
      }
    });
  }
  const coordinator = createRenderCoordinator();
  const targetResources = new Map();
  const targetOwners = new Map();
  let diagramSequence = 0;

  function revokeUrls(urls, tab) {
    for (const url of urls) {
      URL.revokeObjectURL(url);
      if (tab) tab.objectUrls.delete(url);
    }
  }

  function releaseTargetResources(targetElement) {
    const resource = targetResources.get(targetElement);
    if (!resource) return;
    revokeUrls(resource.urls, resource.tab);
    targetResources.delete(targetElement);
  }

  function releaseTab(tab) {
    for (const [target, owner] of targetOwners.entries()) {
      if (owner === tab) {
        coordinator.invalidate(target);
        releaseTargetResources(target);
        targetOwners.delete(target);
      }
    }
  }

  function isCurrent(token, tab) {
    return coordinator.isCurrent(token) && targetOwners.get(token.target) === tab &&
      isRenderAllowed(tab, token.target);
  }

  function commitDraft(targetElement, draft, tab, urls) {
    releaseTargetResources(targetElement);
    targetElement.replaceChildren(...Array.from(draft.childNodes));
    urls.forEach(url => tab.objectUrls.add(url));
    targetResources.set(targetElement, { tab, urls });
  }

  async function renderDocument(content, targetElement, tab, updateToc = false) {
    if (!tab) return false;
    if (tab.documentType.kind === 'markdown') {
      return renderMarkdownInto(content, targetElement, tab, updateToc);
    }

    const token = coordinator.begin(targetElement);
    targetOwners.set(targetElement, tab);
    const draft = window.document.createElement('div');
    const pre = window.document.createElement('pre');
    const code = window.document.createElement('code');
    pre.className = 'source-preview';
    if (tab.documentType.language && hljs.getLanguage(tab.documentType.language)) {
      code.className = `language-${tab.documentType.language}`;
      code.innerHTML = hljs.highlight(content, { language: tab.documentType.language }).value;
    } else {
      code.textContent = content;
    }
    pre.appendChild(code);
    draft.appendChild(pre);
    if (!isCurrent(token, tab)) return false;
    commitDraft(targetElement, draft, tab, new Set());
    onRendered(targetElement, updateToc);
    return true;
  }

  async function renderMarkdownInto(markdown, targetElement, tab, updateToc = false) {
    const token = coordinator.begin(targetElement);
    targetOwners.set(targetElement, tab);
    const urls = new Set();
    configureMarked();

    const draft = window.document.createElement('div');
    const unsafeHtml = marked.parse(normalizeLatexDisplayMath(markdown));
    draft.innerHTML = purifier.sanitize(unsafeHtml, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed'],
      FORBID_ATTR: ['srcdoc', 'style']
    });
    renderMathElements(draft);
    await normalizeImageSources(draft, tab, urls);
    if (!isCurrent(token, tab)) {
      revokeUrls(urls);
      return false;
    }

    for (const code of draft.querySelectorAll('pre > code')) {
      const language = [...code.classList].find(name => name.startsWith('language-'))?.slice(9);
      if (language && language !== 'mermaid' && hljs.getLanguage(language)) {
        code.innerHTML = hljs.highlight(code.textContent, { language }).value;
        code.classList.add('hljs');
      }
    }

    const mermaidBlocks = Array.from(draft.querySelectorAll('code.language-mermaid'));
    for (const block of mermaidBlocks) {
      const source = block.textContent;
      if (source.length > MAX_MERMAID_SOURCE_LENGTH) {
        block.textContent = 'Mermaid diagram is too large to render safely.';
        continue;
      }
      try {
        let result;
        try {
          result = await mermaid.render(`mermaid-${++diagramSequence}`, source);
        } catch (error) {
          const compatible = compatibleFlowchartSource(source);
          if (compatible === source || !isCurrent(token, tab)) throw error;
          result = await mermaid.render(`mermaid-${++diagramSequence}`, compatible);
        }
        const { svg } = result;
        if (!isCurrent(token, tab)) {
          revokeUrls(urls);
          return false;
        }
        const wrapper = window.document.createElement('div');
        wrapper.className = 'mermaid-wrapper';
        wrapper.innerHTML = purifier.sanitize(svg, {
          USE_PROFILES: { svg: true, svgFilters: true },
          FORBID_TAGS: ['script', 'foreignObject'],
          FORBID_ATTR: ['style']
        });
        // Mermaid puts fill:none in inline CSS on sequence message paths.
        // Sanitization removes that CSS; restore only this fixed presentation
        // attribute so self-call curves remain open, without allowing raw styles.
        for (const message of wrapper.querySelectorAll('path.messageLine0, path.messageLine1')) {
          message.setAttribute('fill', 'none');
        }
        block.parentElement.replaceWith(wrapper);
      } catch (error) {
        console.error('Mermaid rendering error:', error);
        const details = window.document.createElement('details');
        details.className = 'mermaid-error';
        const summary = window.document.createElement('summary');
        summary.textContent = '图表无法解析，点击查看原因和源码';
        const reason = window.document.createElement('pre');
        reason.textContent = String(error.message || error).slice(0, 2000);
        const original = block.parentElement;
        original.replaceWith(details);
        details.append(summary, reason, original);
      }
    }

    if (!isCurrent(token, tab)) {
      revokeUrls(urls);
      return false;
    }
    commitDraft(targetElement, draft, tab, urls);
    onRendered(targetElement, updateToc);
    return true;
  }

  async function normalizeImageSources(targetElement, tab, urls) {
    const baseDir = loadLocalImage ? null : path.dirname(tab.filePath);
    const images = Array.from(targetElement.querySelectorAll('img'));
    await Promise.all(images.map(async image => {
      const rawSrc = (loadLocalImage && image.getAttribute('data-mdv-file-src')) || image.getAttribute('src');
      image.removeAttribute('data-mdv-file-src');
      if (loadLocalImage) image.removeAttribute('srcset');
      if (!rawSrc) return;
      if (loadLocalImage) {
        // The mobile adapter resolves document URIs; never apply desktop path rules.
        if (/^(?:https?:|data:image\/|blob:)/i.test(rawSrc)) return;
        image.removeAttribute('src');
        image.removeAttribute('srcset');
        try {
          const url = await loadLocalImage(tab, rawSrc);
          urls.add(url);
          image.src = url;
        } catch (error) {
          image.alt = `${image.alt || rawSrc}（${error.message}）`;
          image.title = error.message;
        }
        return;
      }
      if (isExternalResource(rawSrc)) return;

      const decodedSrc = safeDecodeUri(rawSrc);
      const absolutePath = path.isAbsolute(decodedSrc)
        ? decodedSrc
        : path.resolve(baseDir, decodedSrc);
      try {
        const data = await filesystem.readBinaryFile(absolutePath);
        const mimeTypes = {
          '.gif': 'image/gif', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg',
          '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp'
        };
        const mimeType = mimeTypes[path.extname(absolutePath).toLowerCase()] || 'application/octet-stream';
        const url = URL.createObjectURL(new Blob([data], { type: mimeType }));
        urls.add(url);
        image.src = url;
      } catch (error) {
        console.error('Unable to load local image:', absolutePath, error);
      }
    }));
  }

  function isExternalResource(src) {
    if (path.isAbsolute(src)) return false;
    return /^(?:[a-z][a-z0-9+.-]*:|#)/i.test(src);
  }

  function safeDecodeUri(value) {
    try {
      return decodeURI(value);
    } catch (error) {
      return value;
    }
  }

  return {
    invalidate(target) {
      coordinator.invalidate(target);
      targetOwners.delete(target);
    },
    releaseTab,
    releaseTargetResources,
    renderDocument,
    renderMarkdownInto
  };
}

module.exports = { createMarkdownRenderer, MAX_MERMAID_SOURCE_LENGTH };
