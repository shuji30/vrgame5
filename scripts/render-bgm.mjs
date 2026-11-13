// BGM を WAV に書き出す(つなぎ目なしの 1 周、44.1 kHz・16 bit・ステレオ)。vrgame4 の render-bgm.mjs と同じ考え方
// ゲームの曲の仕組み(web/src/music.js)を、ヘッドレスの Chrome の OfflineAudioContext で計算する(リアルタイムでないので途切れない)
// 曲は 16 小節で 1 周し、最初の 1 周だけ前奏があるので、3 周分を計算して残響の入った 2 周目を切り出す
//   先に npm start(http://localhost:8090/)を動かしておく
//   node scripts/render-bgm.mjs [曲の id ...]   (省略するとすべて)→ web/assets/bgm/<id>.wav
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = join(root, 'web', 'assets', 'bgm');
mkdirSync(outDir, { recursive: true });
const SR = 44100;
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => existsSync(p));
const port = 9500 + Math.floor(Math.random() * 300);
const chrome = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'trbgm-'))}`, '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
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

try {
  await send('Page.enable');
  await send('Page.navigate', { url: 'http://localhost:8090/vendor/three.module.js' }); // 同じオリジンの軽いページ
  await sleep(800);
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : await ev(`import('/src/music.js').then((m) => Object.keys(m.TRACKS))`);
  for (const id of ids) {
    const t0 = Date.now();
    // 3 周を計算して、2 周目を 16bit の PCM(base64)で返す
    const res = await ev(`(async () => {
      const { MusicPlayer, TRACKS } = await import('/src/music.js');
      const tr = TRACKS[${JSON.stringify(id)}];
      const SR = ${SR};
      const step = 60 / tr.bpm / 4;
      const cycle = 16 * 16 * step;           // 16 小節
      const total = cycle * 3 + 2;
      const ctx = new OfflineAudioContext(2, Math.ceil(SR * total), SR);
      const noise = ctx.createBuffer(1, SR * 2, SR);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const bus = ctx.createGain();
      bus.connect(ctx.destination);
      const mp = new MusicPlayer(ctx, bus, noise);
      mp._start = () => {};                     // リアルタイムの予約は使わない
      mp.play(${JSON.stringify(id)}, 0.01);
      const s = mp.cur;
      s.next = 0;
      // 一度に全部を予約すると音が抜けるので、2 秒ずつ計算を止めて、その先の音を予約する
      const schedule = (until) => { while (s.next < Math.min(until, cycle * 3)) { mp._step(s, s.step, s.next); s.step++; s.next += step; } };
      schedule(3);
      for (let t = 2; t < total - 1; t += 2) ctx.suspend(t).then(() => { schedule(t + 3); ctx.resume(); });
      const buf = await ctx.startRendering();
      const a = Math.round(cycle * SR), len = Math.round(cycle * SR);
      const L = buf.getChannelData(0).subarray(a, a + len), R = buf.getChannelData(1).subarray(a, a + len);
      let peak = 0;
      for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
      const gain = peak > 0.98 ? 0.98 / peak : 1;   // 音割れしないよう、必要なら下げる
      const pcm = new Int16Array(len * 2);
      for (let i = 0; i < len; i++) {
        pcm[i * 2] = Math.max(-1, Math.min(1, L[i] * gain)) * 32767;
        pcm[i * 2 + 1] = Math.max(-1, Math.min(1, R[i] * gain)) * 32767;
      }
      const bytes = new Uint8Array(pcm.buffer);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return { b64: btoa(bin), sec: cycle, peak, gain };
    })()`);
    const data = Buffer.from(res.b64, 'base64');
    const head = Buffer.alloc(44);
    head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8);
    head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22);
    head.writeUInt32LE(SR, 24); head.writeUInt32LE(SR * 4, 28); head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34);
    head.write('data', 36); head.writeUInt32LE(data.length, 40);
    const file = join(outDir, `${id}.wav`);
    writeFileSync(file, Buffer.concat([head, data]));
    console.log(`${id}: ${res.sec.toFixed(2)} 秒、ピーク ${res.peak.toFixed(2)}${res.gain < 1 ? `(${res.gain.toFixed(2)} 倍に下げた)` : ''} → ${file} (${(data.length / 1e6).toFixed(1)} MB、${((Date.now() - t0) / 1000).toFixed(0)} 秒で計算)`);
  }
} finally {
  ws.close();
  chrome.kill();
}
process.exit(0);
