// Some Markdown authors use C-style escaped quotes inside flowchart labels.
// Mermaid expects its entity syntax instead. Only use this on a failed render;
// the document's source and already valid diagrams must remain unchanged.
function compatibleFlowchartSource(source) {
  if (!/^\s*(?:flowchart|graph)\s/i.test(source)) return source;
  return source.replace(/\\"/g, '#quot;');
}

module.exports = { compatibleFlowchartSource };
