// オンラインの確認(開発用):ヘッドレス Chrome の2つのタブを「同じPCで試す」でつなぎ、ホストが出撃して状態が同期するか見る
//   node scripts/nettest.mjs [base url] [mode coop|versus]
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = process.argv[2] || 'http://localhost:8090/';
const mode = process.argv[3] || 'coop';
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => existsSync(p));
const port = 9400 + Math.floor(Math.random() * 400);
const proc = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'trnet-'))}`, '--window-size=1000,600', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tab(url) {
  let t;
  for (let i = 0; i < 50 && !t; i++) {
    try { t = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json(); } catch { await sleep(200); }
  }
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pend = new Map();
  const logs = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') logs.push(`[EXC] ${m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text}`);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push(`[err] ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable');
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
  const shot = async (file) => { await send('Page.bringToFront'); await sleep(800); const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(file, Buffer.from(s.result.data, 'base64')); };
  return { ev, logs, shot, send };
}

const A = await tab(`${base}?nolock`);
const B = await tab(`${base}?nolock`);
await sleep(4000);
const click = (sel) => `document.querySelector(${JSON.stringify(sel)}).click()`;
await A.ev(`${click('[data-go=online]')}; document.querySelector('#on-local').click(); 1`);
await A.ev(`${click('#on-host')}; 1`);
await sleep(800);
const code = await A.ev('__tr.game.app.online?.code || document.querySelector("#online-card h2 b")?.textContent');
console.log('code', code);
await B.ev(`${click('[data-go=online]')}; document.querySelector('#on-local').click(); document.querySelector('#on-code').value=${JSON.stringify(code)}; ${click('#on-join')}; 1`);
await sleep(1500);
console.log('lobby A', await A.ev('document.querySelector("#online-card table").innerText.replace(/\\s+/g," ")'));
console.log('lobby B', await B.ev('document.querySelector("#online-card table")?.innerText.replace(/\\s+/g," ")'));
if (mode === 'versus') { await A.ev(`${click('[data-mode=versus]')}; 1`); await sleep(500); }
await A.ev(`${click('#lb-start')}; 1`);
await sleep(9000);
// B を前進させる
await B.ev(`__tr.input.keys.add('KeyW'); __tr.input.keys.add('KeyI'); 1`);
await sleep(6000);
const st = `(()=>{const g=__tr.game,s=g.sim;if(!s)return 'no sim';return {mode:s.mode,auth:s.authority,state:s.mission.state,t:s.mission.timeLeft.toFixed(1),me:g.me.id,ents:s.ents.filter(e=>e.isPlayer).map(e=>e.id+'@'+e.x.toFixed(0)+','+e.z.toFixed(0)+(e.alive?'':'(dead)')).join(' '),units:s.ents.filter(e=>!e.isPlayer&&e.ctrl!=='bot').slice(0,3).map(e=>e.id+'@'+e.x.toFixed(0)+','+e.z.toFixed(0)).join(' '),shots:s.shots.length}})()`;
console.log('A', JSON.stringify(await A.ev(st)));
console.log('B', JSON.stringify(await B.ev(st)));
await A.shot(join(process.argv[4] || '.', 'netA.png'));
await B.shot(join(process.argv[4] || '.', 'netB.png'));
console.log('logs A', A.logs.slice(0, 10));
console.log('logs B', B.logs.slice(0, 10));
proc.kill();
process.exit(0);
