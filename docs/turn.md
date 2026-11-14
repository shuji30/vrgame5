# TURN(中継)でオンライン対戦をつながりやすくする

直接つながらない回線(スマホのモバイル回線、会社・学校のネットワークなど)でも対戦できるよう、TURN(中継)を使う。
いまは **Metered の Open Relay**(無料枠 毎月 20GB)を使う。Cloudflare Realtime の TURN(無料枠 毎月 1,000GB)に切り替えられるようにもしてある(下)。

- ゲーム側は `web/src/net/ice.js`。`TURN_URL` が空のときや合言葉を取れないときは、これまでどおり PeerJS の既定(Google の STUN と、PeerJS 運営の無保証の TURN)でつなぐ
- URL に `?turn=<URL>` を付けると、その場で試せる(Metered の URL は `?` と `=` を含むので、`encodeURIComponent` したものを付ける)

## Metered の Open Relay(いま使うもの)

**v0.2.26 から有効。** ダッシュボードの「認証情報」で作った認証情報(日本の中継サーバー `jp.relay.metered.ca`)の一覧を、`web/src/net/ice.js` の `TURN_SERVERS` にそのまま書いてある。
認証情報を作り直したら、合言葉の URL を開いて出る一覧(`[{"urls":"stun:..."},{"urls":"turn:...","username":...,"credential":...}, ...]`)で `TURN_SERVERS` を書き換える。

- オンラインの画面の「中継(TURN)を試す」で、その端末から中継サーバーにつながるかを確かめられる(中継だけを使う設定で接続の候補を集める)
- `?turn=off` を付けると中継を使わない(PeerJS の既定)。比べるとき用

以下は最初の設定の手順(参考)。

画面の名前は変わることがある。

1. Metered(metered.ca)の無料アカウントを作る。アプリ名(`<アプリ名>.metered.live`)を決める
2. ダッシュボードの TURN Server の画面で、**API キー**(TURN の合言葉を受け取るためのもの)を確かめる
3. 合言葉の URL は `https://<アプリ名>.metered.live/api/v1/turn/credentials?apiKey=<API キー>`。ブラウザで開いて、`[{"urls":"stun:...`、`{"urls":"turn:...","username":...,"credential":...}` のような一覧が出れば使える
4. この URL を `web/src/net/ice.js` の `TURN_URL` に書いて公開する
   - この API キーは、Metered の作りどおりページから直接使うもので、ページを見れば分かってしまう。悪用されても無料枠(20GB)を使い切られるだけだが、ダッシュボードで使ってよいドメインを絞れるなら `shuji30.github.io` と `localhost` に絞る
   - 使用量はダッシュボードで見られる

---

## Cloudflare Realtime の TURN に切り替える場合

直接つながらない回線(スマホのモバイル回線、会社・学校のネットワークなど)でも対戦できるよう、Cloudflare Realtime の TURN(中継)を使う。無料枠は毎月 1,000 GB(SFU と共通。超えると 1GB あたり $0.05)。

- TURN の API トークンはページに書けないので、Cloudflare Worker(`cloudflare/turn-worker/worker.js`)に預け、ゲームは Worker から 4 時間だけ使える合言葉を受け取る
- Worker は許可したゲームの URL(`ALLOWED_ORIGINS`)からの要求にだけ答える(ほかのサイトに無料枠を使われないように)
- ゲーム側は `web/src/net/ice.js`。`TURN_URL` が空のときや合言葉を取れないときは、これまでどおり PeerJS の既定(Google の STUN と、PeerJS 運営の無保証の TURN)でつなぐ

### 設定の手順(Cloudflare のダッシュボード)

画面の名前は変わることがある。

1. Cloudflare のアカウントを作る(無料)
2. **TURN キーを作る**:ダッシュボードの「Realtime」→「TURN Server」→ 作成。名前は `treadrevolt` など
   - 表示される **Turn Token ID**(キーの ID)と **API Token** を控える。API Token は一度しか表示されない
3. **Worker を作る**:「Workers & Pages」→ 作成 → Worker(Hello World のひな形)→ 名前を `treadrevolt-turn` などにしてデプロイ
   - 「コードを編集」で中身を `cloudflare/turn-worker/worker.js` に置き換えてデプロイ
4. **Worker の設定**:Worker →「設定」→「変数とシークレット」
   - `TURN_KEY_ID`:2 の Turn Token ID(テキスト)
   - `TURN_KEY_API_TOKEN`:2 の API Token(**シークレット**として入れる)
   - `ALLOWED_ORIGINS`(任意):`https://shuji30.github.io,http://localhost:8090`(省略時もこの値)
5. **確かめる**:`https://treadrevolt-turn.<あなたのサブドメイン>.workers.dev/health` を開いて `{"ok":true,"configured":true}` と出れば準備できている
6. ゲームで試す:`https://shuji30.github.io/vrgame2/games/tread-revolt/?turn=https://treadrevolt-turn.<サブドメイン>.workers.dev` を開くと、その Worker を使う。オンラインの画面に「直接つながらない回線では TURN で中継する」と出る
7. うまくいったら `web/src/net/ice.js` の `TURN_URL` に Worker の URL を書いて公開する(末尾に `/ice` を足して呼ぶ)(URL は秘密ではない。API Token は秘密なので、チャットやリポジトリに書かない)

wrangler を使う場合は `cloudflare/turn-worker/wrangler.toml` を使う(`npx wrangler deploy`、`npx wrangler secret put TURN_KEY_API_TOKEN`)。
