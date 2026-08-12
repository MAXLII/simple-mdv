const assert = require('assert');
const { marked } = require('marked');
const markedKatex = require('marked-katex-extension');
const { normalizeLatexDisplayMath } = require('../markdown-math');

marked.use(markedKatex({
  throwOnError: false,
  nonStandard: true
}));

const latexDisplay = String.raw`Before

\[
40\times10^{-6}=0.00004
\]

After`;
const normalized = normalizeLatexDisplayMath(latexDisplay);
const rendered = marked.parse(normalized);

assert.match(normalized, /^\$\$$/m);
assert.doesNotMatch(normalized, /^\\[\[\]]$/m);
assert.match(rendered, /class="katex-display"/);
assert.match(rendered, /<mo>×<\/mo>/);
assert.doesNotMatch(rendered, /<p>\[/);

const fencedCode = String.raw`~~~markdown
\[
x^2
\]
~~~`;

assert.strictEqual(normalizeLatexDisplayMath(fencedCode), fencedCode);

const indentedCode = String.raw`    \[
    x^2
    \]`;

assert.strictEqual(normalizeLatexDisplayMath(indentedCode), indentedCode);

console.log('Markdown math normalization tests passed.');
