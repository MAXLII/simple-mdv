import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adb = path.join(root, 'cache/android-diagnostics/platform-tools/adb.exe');
const env = { ...process.env, ANDROID_USER_HOME: path.join(root, 'cache/android-diagnostics/android-user') };
const device = process.env.ANDROID_SERIAL || 'd1cb526b';
function command(...args) { return execFileSync(adb, ['-P', '5038', '-s', device, ...args], { env, encoding: 'utf8', timeout: 20000 }); }

const sockets = command('shell', 'cat', '/proc/net/unix');
const pid = command('shell', 'pidof', 'com.maxli.simplemarkdownviewer').trim();
const socket = sockets.split('\n').find(line => line.includes(`webview_devtools_remote_${pid}`))?.trim().split(' ').pop()?.replace(/^@/, '');
if (!socket) throw new Error('Debug WebView socket unavailable; launch the debug APK first.');
command('forward', 'tcp:9223', `localabstract:${socket}`);
const pages = await (await fetch('http://127.0.0.1:9223/json', { signal: AbortSignal.timeout(8000) })).json();
const page = pages.find(page => page.url.startsWith('https://appassets.androidplatform.net/assets/'));
if (!page) throw new Error('Reader page unavailable');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let sequence = 0;
const pending = new Map();
ws.onmessage = event => {
  const message = JSON.parse(event.data);
  if (pending.has(message.id)) { const { resolve, reject } = pending.get(message.id); pending.delete(message.id); message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result); }
};
function send(method, params = {}) {
  return new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
}
const expression = process.argv[2] === '--file' ? fs.readFileSync(process.argv[3], 'utf8') : (process.argv[2] || '({title:document.title,text:document.body.innerText.slice(0,1600),width:innerWidth,height:innerHeight})');
const timeout = setTimeout(() => { console.error('Device evaluation timed out'); process.exit(1); }, 30000);
try {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  const output = JSON.stringify(result.result.value ?? result.result.description, null, 2);
  const outputArgument = process.argv.find(argument => argument.startsWith('--output='));
  if (outputArgument) {
    const destination = path.resolve(root, outputArgument.slice('--output='.length));
    if (!destination.startsWith(root + path.sep)) throw new Error('Report output must stay inside the repository.');
    fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, output);
  }
  console.log(output);
} finally { clearTimeout(timeout); ws.close(); }
