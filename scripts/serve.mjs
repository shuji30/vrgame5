// 依存なしの静的ファイルサーバー: node scripts/serve.mjs [port]
// 既定のポート 8090 は ffb-bridge の既定の許可リスト(http://localhost:8090)に入っている
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../web', import.meta.url)));
const port = Number(process.argv[2] || process.env.PORT || 8090);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  // 開発用:ブラウザから送ったスクリーンショットを .snapshots/ に保存する(PUT /__snap?name=xxx)
  if (req.method === 'PUT' && req.url.startsWith('/__snap')) {
    const name = (new URL(req.url, 'http://x').searchParams.get('name') || 'snap').replace(/[^\w-]/g, '');
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const dir = resolve(root, '..', '.snapshots');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${name}.jpg`), Buffer.concat(chunks));
    res.writeHead(200).end('ok');
    return;
  }
  try {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = normalize(join(root, url));
    if (!file.startsWith(root)) throw new Error('forbidden');
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, () => console.log(`http://localhost:${port}/`));
