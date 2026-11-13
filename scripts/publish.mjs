// vrgame2(ゲーム選択画面のリポジトリ)の games/tread-revolt/ へコピーする(vrgame4 の publish.mjs と同じ方式)
//   node scripts/publish.mjs [vrgame2 のフォルダ]   (既定: ../vrgame2)
// コピーした後、vrgame2 で commit / push すると GitHub Pages に公開される
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
// 直前のプログラムのフォルダ (js-*) は、新しいもの 2 つまで残す
mkdirSync(dst, { recursive: true });
const oldJs = readdirSync(dst).filter((n) => n.startsWith('js-'))
  .sort((a, b) => statSync(join(dst, b)).mtimeMs - statSync(join(dst, a)).mtimeMs);
for (const n of readdirSync(dst)) {
  if (n.startsWith('js-') && oldJs.indexOf(n) < 2) continue;
  rmSync(join(dst, n), { recursive: true, force: true });
}
let commit = '';
try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* git の履歴なし */ }
// プログラムは毎回ちがう名前のフォルダ (js-<コミット>/) に置く。GitHub Pages は 10 分ほどキャッシュさせるので、
// 同じ名前だと公開直後に新旧のファイルが混ざって動かなくなることがあるため
const jsDir = `js-${commit ? `${commit}-` : ''}${Date.now().toString(36)}`;
cpSync(join(web, 'src'), join(dst, jsDir), { recursive: true });
cpSync(join(web, 'vendor'), join(dst, 'vendor'), { recursive: true });
// BGM(scripts/render-bgm.mjs で書き出した WAV)
if (existsSync(join(web, 'assets'))) cpSync(join(web, 'assets'), join(dst, 'assets'), { recursive: true });
const html = readFileSync(join(web, 'index.html'), 'utf8');
if (!html.includes('./src/main.js')) throw new Error('index.html に ./src/main.js が見つかりません');
writeFileSync(join(dst, 'index.html'), html.replace('./src/main.js', `./${jsDir}/main.js`));
const version = readFileSync(join(web, 'src', 'version.js'), 'utf8').match(/VERSION = '([^']+)'/)?.[1] || '';
const info = { version, commit, deployed: new Date().toISOString() };
writeFileSync(join(dst, 'version.json'), JSON.stringify(info) + '\n');
console.log(`コピーしました: ${dst}  (v${version} ${commit} ${info.deployed}, ${jsDir}/)`);
