// vrgame2(ゲーム選択画面のリポジトリ)の games/tread-revolt/ へコピーする(vrgame4 の publish.mjs と同じ方式)
//   node scripts/publish.mjs [vrgame2 のフォルダ]   (既定: ../vrgame2)
// コピーした後、vrgame2 で commit / push すると GitHub Pages に公開される
import { cpSync, existsSync, mkdirSync, openSync, readSync, closeSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const web = join(root, 'web');
const site = resolve(process.argv[2] || join(root, '..', 'vrgame2'));
if (!existsSync(join(site, 'games'))) {
  console.error(`vrgame2 が見つかりません: ${site}`);
  process.exit(1);
}
const dst = join(site, 'games', 'tread-revolt');
// 消したファイルが残らないよう毎回作り直す。ただし、キャッシュされた古い index.html から読まれる
// 直前のプログラムのフォルダ (js-*) は、新しいもの 2 つまで残す。
// 新しさはフォルダ名の末尾(公開した時刻の 36 進数)で決める。クローンした直後は更新日時がそろっていて当てにならないため
mkdirSync(dst, { recursive: true });
const jsTime = (n) => {
  const t = parseInt(n.split('-').pop(), 36);
  return Number.isFinite(t) ? t : statSync(join(dst, n)).mtimeMs;
};
const oldJs = readdirSync(dst).filter((n) => n.startsWith('js-')).sort((a, b) => jsTime(b) - jsTime(a));
for (const n of readdirSync(dst)) {
  if (n.startsWith('js-') && oldJs.indexOf(n) < 2) continue;
  if (n === 'assets') continue; // 下で中身をそろえる
  rmSync(join(dst, n), { recursive: true, force: true });
}
let commit = '';
try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* git の履歴なし */ }
// プログラムは毎回ちがう名前のフォルダ (js-<コミット>/) に置く。GitHub Pages は 10 分ほどキャッシュさせるので、
// 同じ名前だと公開直後に新旧のファイルが混ざって動かなくなることがあるため
const jsDir = `js-${commit ? `${commit}-` : ''}${Date.now().toString(36)}`;
cpSync(join(web, 'src'), join(dst, jsDir), { recursive: true });
cpSync(join(web, 'vendor'), join(dst, 'vendor'), { recursive: true });
// 音(web/assets/)。Git LFS の実体を取ってきていないクローンでは、音のファイルが中身のないポインタ(数百バイト)になっている。
// それで公開先の本物を上書きしないよう、ポインタは写さず、公開先にあるものをそのまま残す
const isLfsPointer = (file) => {
  if (statSync(file).size > 1024) return false;
  const buf = Buffer.alloc(40);
  const fd = openSync(file, 'r');
  try { readSync(fd, buf, 0, 40, 0); } finally { closeSync(fd); }
  return buf.toString('utf8').startsWith('version https://git-lfs');
};
const skipped = [];
const syncAssets = (src, out, rel = '') => {
  mkdirSync(out, { recursive: true });
  const names = new Set(readdirSync(src));
  // 元から消したものは公開先からも消す
  for (const n of readdirSync(out)) if (!names.has(n)) rmSync(join(out, n), { recursive: true, force: true });
  for (const n of names) {
    const from = join(src, n), to = join(out, n);
    if (statSync(from).isDirectory()) { syncAssets(from, to, `${rel}${n}/`); continue; }
    if (isLfsPointer(from)) { skipped.push(`${rel}${n}${existsSync(to) ? '' : '(公開先にもない)'}`); continue; }
    cpSync(from, to);
  }
};
if (existsSync(join(web, 'assets'))) syncAssets(join(web, 'assets'), join(dst, 'assets'));
else rmSync(join(dst, 'assets'), { recursive: true, force: true });
if (skipped.length) {
  console.warn(`Git LFS のポインタのままのファイル ${skipped.length} 個は写さず、公開先のものを残しました(git lfs pull で実体を取れます):`);
  for (const f of skipped) if (f.endsWith(')')) console.warn(`  ${f}`);
}
const html = readFileSync(join(web, 'index.html'), 'utf8');
if (!html.includes('./src/main.js')) throw new Error('index.html に ./src/main.js が見つかりません');
writeFileSync(join(dst, 'index.html'), html.replace('./src/main.js', `./${jsDir}/main.js`));
const version = readFileSync(join(web, 'src', 'version.js'), 'utf8').match(/VERSION = '([^']+)'/)?.[1] || '';
const info = { version, commit, deployed: new Date().toISOString() };
writeFileSync(join(dst, 'version.json'), JSON.stringify(info) + '\n');
console.log(`コピーしました: ${dst}  (v${version} ${commit} ${info.deployed}, ${jsDir}/)`);
