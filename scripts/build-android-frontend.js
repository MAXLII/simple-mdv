const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const destination = path.join(root, 'android/app/src/main/assets');
fs.mkdirSync(destination, { recursive: true });
for (const name of ['index.html', 'mobile.css']) fs.copyFileSync(path.join(root, 'android/web', name), path.join(destination, name));
const katex = path.join(root, 'node_modules/katex/dist');
fs.copyFileSync(path.join(katex, 'katex.min.css'), path.join(destination, 'katex.css'));
fs.cpSync(path.join(katex, 'fonts'), path.join(destination, 'fonts'), { recursive: true });
fs.copyFileSync(path.join(root, 'node_modules/highlight.js/styles/github.css'), path.join(destination, 'highlight.css'));
esbuild.buildSync({ entryPoints: [path.join(root, 'android/web/app.js')], outfile: path.join(destination, 'app.js'),
  bundle: true, minify: true, platform: 'browser', format: 'iife', target: ['chrome100'], legalComments: 'eof' });
console.log('Android frontend bundled:', fs.statSync(path.join(destination, 'app.js')).size, 'bytes');
