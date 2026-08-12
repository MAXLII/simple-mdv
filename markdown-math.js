function normalizeLatexDisplayMath(markdown) {
  const lines = String(markdown).split(/(\r?\n)/);
  let fenceMarker = null;

  for (let i = 0; i < lines.length; i += 2) {
    const line = lines[i];
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/);

    if (fenceMarker === null && fenceMatch) {
      fenceMarker = fenceMatch[1];
      continue;
    }

    if (fenceMarker !== null) {
      const closingFence = new RegExp(`^\\s{0,3}${fenceMarker[0]}{${fenceMarker.length},}\\s*$`);
      if (closingFence.test(line)) {
        fenceMarker = null;
      }
      continue;
    }

    if (/^ {0,3}\\\[\s*$/.test(line)) {
      lines[i] = line.replace('\\[', () => '$$');
    } else if (/^ {0,3}\\\]\s*$/.test(line)) {
      lines[i] = line.replace('\\]', () => '$$');
    }
  }

  return lines.join('');
}

module.exports = {
  normalizeLatexDisplayMath
};
