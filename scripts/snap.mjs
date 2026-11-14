// ヘッドレス Chrome でページを開き、コンソールのエラーとスクリーンショットを取る(開発用)
//   node scripts/snap.mjs "<url>" out.png [待つ秒数] [実行するJS]
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [url, out = 'snap.png', waitS = '6', evalJs = ''] = process.argv.slice(2);
// Windows の Chrome / Edge。クラウドの作業環境(Linux)では入っている Chromium を使う。CHROME で指定もできる
const chromes = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/opt/pw-browsers/chromium/chrome-linux64/chrome',
  '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',
];
const exe = chromes.find((p) => p && existsSync(p));
const port = 9300 + Math.floor(Math.random() * 500);
const prof = mkdtempSync(join(tmpdir(), 'trsnap-'));
const proc = spawn(exe, [
  '--headless=new', ...(process.platform === 'linux' ? ['--no-sandbox'] : []), `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--window-size=1280,720',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--mute-audio', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
for (let i = 0; i < 50; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const page = list.find((t) => t.type === 'page');
    if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; }
  } catch { /* 起動待ち */ }
  await sleep(200);
}
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
const logs = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.consoleAPICalled') logs.push(`[${m.params.type}] ${m.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
  if (m.method === 'Runtime.exceptionThrown') logs.push(`[EXCEPTION] ${m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text}`);
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') logs.push(`[log] ${m.params.entry.text} ${m.params.entry.url || ''}`);
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Page.navigate', { url });
await sleep(Number(waitS) * 1000);
if (evalJs) {
  const r = await send('Runtime.evaluate', { expression: evalJs, returnByValue: true, awaitPromise: true });
  console.log('eval:', JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description ?? r.result));
  await sleep(1500);
}
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log(logs.slice(0, 40).join('\n') || '(console: なし)');
ws.close();
proc.kill();
process.exit(0);
