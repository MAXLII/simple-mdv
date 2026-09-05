function highlightTextMatches(root, query, document) {
  if (!query) return [];
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'gi');
  const nodeFilter = document.defaultView.NodeFilter;
  const walker = document.createTreeWalker(root, nodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const tagName = node.parentElement && node.parentElement.tagName;
      return tagName === 'SCRIPT' || tagName === 'STYLE'
        ? nodeFilter.FILTER_REJECT
        : nodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes = [];
  while (walker.nextNode()) {
    if (regex.test(walker.currentNode.textContent)) nodes.push(walker.currentNode);
    regex.lastIndex = 0;
  }

  const highlights = [];
  for (const node of nodes) {
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const match of node.textContent.matchAll(regex)) {
      fragment.appendChild(document.createTextNode(node.textContent.slice(cursor, match.index)));
      const highlight = document.createElement('span');
      highlight.className = 'search-highlight';
      highlight.textContent = match[0];
      fragment.appendChild(highlight);
      highlights.push(highlight);
      cursor = match.index + match[0].length;
    }
    fragment.appendChild(document.createTextNode(node.textContent.slice(cursor)));
    node.parentNode.replaceChild(fragment, node);
  }
  return highlights;
}

module.exports = { highlightTextMatches };
