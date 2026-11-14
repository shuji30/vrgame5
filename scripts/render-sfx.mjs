// 効果音を WAV に書き出す(44.1 kHz・32 bit float・モノラル)。書き出したファイルは差し替えられる
// ゲームの合成(web/src/audio.js の SFX とループの素材)を、ヘッドレスの Chrome の OfflineAudioContext で計算する
//   先に npm start(http://localhost:8090/)を動かしておく
//   node scripts/render-sfx.mjs [名前 ...]   (省略するとすべて)→ web/assets/sfx/<名前>.wav
//   すでにあるファイルは上書きしない(差し替えた音を守るため)。上書きするときは --force
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = join(root, 'web', 'assets', 'sfx');
mkdirSync(outDir, { recursive: true });
const SR = 44100;
const args = process.argv.slice(2);
const force = args.includes('--force');
const want = args.filter((a) => !a.startsWith('--'));
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => existsSync(p));
const port = 9500 + Math.floor(Math.random() * 300);
const chrome = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'trsfx-'))}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
for (let i = 0; i < 50 && !ws; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const page = list.find((t) => t.type === 'page');
    if (page) ws = new WebSocket(page.webSocketDebuggerUrl);
  } catch { await sleep(200); }
}
await new Promise((r) => ws.addEventListener('open', r));
let n = 0;
const pend = new Map();
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++n; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600));
  return r.result?.result?.value;
};

// 32 bit float・モノラルの WAV(1 を超えても割れずに残る)
function wav(data, sr) {
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8);
  head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(3, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(sr, 24); head.writeUInt32LE(sr * 4, 28); head.writeUInt16LE(4, 32); head.writeUInt16LE(32, 34);
  head.write('data', 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

try {
  await send('Page.enable');
  await send('Page.navigate', { url: 'http://localhost:8090/vendor/three.module.js' }); // 同じオリジンの軽いページ
  await sleep(800);
  const names = want.length ? want : await ev(`import('/src/audio.js').then((m) => m.sfxNames())`);
  let made = 0, kept = 0;
  for (const name of names) {
    const file = join(outDir, `${name}.wav`);
    if (!force && (existsSync(file) || existsSync(join(outDir, `${name}.m4a`)))) { kept++; continue; }
    const res = await ev(`(async () => {
      const m = await import('/src/audio.js');
      const d = await m.renderSfx(${JSON.stringify(name)}, ${SR});
      let peak = 0;
      for (const x of d) peak = Math.max(peak, Math.abs(x));
      const bytes = new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return { b64: btoa(bin), sec: d.length / ${SR}, peak };
    })()`);
    writeFileSync(file, wav(Buffer.from(res.b64, 'base64'), SR));
    made++;
    console.log(`${name}: ${res.sec.toFixed(2)} 秒、ピーク ${res.peak.toFixed(2)} → ${file}`);
  }
  console.log(`書き出し ${made} 件${kept ? `、すでにあるので残した ${kept} 件(上書きは --force)` : ''}`);
} finally {
  ws.close();
  chrome.kill();
}
process.exit(0);
