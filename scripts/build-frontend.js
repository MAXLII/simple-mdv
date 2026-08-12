const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const resources = path.join(root, 'resources');

fs.mkdirSync(resources, { recursive: true });

for (const file of ['index.html', 'styles.css', 'icon.png', 'icon.ico']) {
  fs.copyFileSync(path.join(root, file), path.join(resources, file));
}

const katexRoot = path.join(root, 'node_modules', 'katex', 'dist');
const katexCss = fs.readFileSync(path.join(katexRoot, 'katex.min.css'), 'utf8')
  .replace(/,url\(fonts\/[^)]+\.(?:woff|ttf)\) format\("(?:woff|truetype)"\)/g, '');
fs.writeFileSync(path.join(resources, 'katex.css'), katexCss, 'utf8');

const fontsDir = path.join(resources, 'fonts');
fs.mkdirSync(fontsDir, { recursive: true });
for (const font of fs.readdirSync(path.join(katexRoot, 'fonts'))) {
  if (font.endsWith('.woff2')) {
    fs.copyFileSync(path.join(katexRoot, 'fonts', font), path.join(fontsDir, font));
  }
}

esbuild.buildSync({
  entryPoints: [path.join(root, 'renderer.js')],
  outfile: path.join(resources, 'app.js'),
  bundle: true,
  minify: true,
  platform: 'browser',
  format: 'iife',
  target: ['chrome100'],
  legalComments: 'none',
  treeShaking: true
});

const sizes = ['app.js', 'index.html', 'styles.css', 'katex.css', 'icon.png', 'icon.ico']
  .map(file => ({ file, bytes: fs.statSync(path.join(resources, file)).size }));
console.table(sizes);
