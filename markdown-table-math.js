const { Lexer, Tokenizer } = require('marked');

// Hide math pipes only while GFM splits table cells. Equal-length replacements
// keep the block's consumed source length unchanged; inline math sees the source.
function tokenizeMathTable(source) {
  const candidate = this.rules.block.table.exec(source);
  if (!candidate) return false;
  let marker = 0xe000;
  while (candidate[0].includes(String.fromCodePoint(marker))) marker++;
  const placeholder = String.fromCodePoint(marker);
  const restore = text => text.replaceAll(placeholder, '|');
  const mathTypes = new Set(['latexInlineMath', 'inlineKatex']);

  function protectToken(token) {
    if (mathTypes.has(token.type)) return token.raw.replaceAll('|', placeholder);
    if (!token.tokens) return token.raw;
    let raw = token.raw;
    let offset = 0;
    for (const child of token.tokens) {
      const index = raw.indexOf(child.raw, offset);
      if (index < 0) continue;
      raw = raw.slice(0, index) + protectToken(child) + raw.slice(index + child.raw.length);
      offset = index + child.raw.length;
    }
    return raw;
  }

  const masked = candidate[0].split('\n').map(line => {
    // Marked stores its active tokenizer in options; don't rebind that instance.
    const lexer = new Lexer({ ...this.options, tokenizer: undefined });
    return lexer.inlineTokens(line).map(protectToken).join('');
  }).join('\n');
  if (masked === candidate[0]) return false;

  const tokenizer = new Tokenizer(this.options);
  tokenizer.rules = this.rules;
  tokenizer.lexer = { inline: text => this.lexer.inline(restore(text)) };
  const table = tokenizer.table(masked);
  if (!table) return false;
  table.raw = restore(table.raw);
  for (const cell of [...table.header, ...table.rows.flat()]) cell.text = restore(cell.text);
  return table;
}

module.exports = { tokenizeMathTable };
