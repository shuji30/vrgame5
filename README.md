# TREAD REVOLT 〜履帯の反攻〜

左右の履帯を別々に操る、マルチプレイVRの戦車バトル(個人制作、開発コード vrgame5)。

- 対象:PCVR(OpenXR)。検証機は Pimax 8KX、目標60fps
- エンジン:Unity(着手時点の最新 LTS に固定)、描画は URP
- 入力:VRコントローラー、仮想レバー、ハンコン(vrgame2 の ffb-bridge 経由)
- モデル・テクスチャ・音はすべて自作

## ブラウザ版

Three.js + WebXR で作ったブラウザ版を `web/` に置いている。遊び方・構成・公開の手順は `docs/web.md`。

- 公開先:https://shuji30.github.io/vrgame2/games/tread-revolt/
- 手元:`npm start` → http://localhost:8090/

## 設計書

設計書(Claude Doc)が正。リポジトリには `docs/design.md` として書き出したものを置く。

## 初回セットアップ

1. Git LFS を入れる:`git lfs install`
2. Unity Hub で最新 LTS を入れ、このフォルダに URP のプロジェクトを作る
3. Package Manager で OpenXR Plugin、XR Interaction Toolkit、Input System、ProBuilder を入れる
4. ハンコンを使う場合は、vrgame2 の ffb-bridge(ZIP)を展開し、`origins.txt` に `app://vrgame5` を追加してから start.bat を起動する(詳しくは `docs/phase0-ffb-test.md`)

## 開発の進め方

フェーズ0(操作プロトタイプ)→ 1(MVP)→ 2(VRならではの体験)→ 3(コンテンツ拡充)。
各フェーズの終わりのゲート(楽しいか、酔わないか)を通らなければ次へ進まない。
