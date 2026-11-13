# フェーズ0 作業1:ffb-bridge 接続テスト

Unity から vrgame2 の ffb-bridge に接続し、ハンコンの入力を受け取って FFB を出せるかを確かめる。

## 入っているもの

| ファイル | 役割 |
| --- | --- |
| `Assets/TreadRevolt/Scripts/Bridge/FfbBridgeMessages.cs` | ブリッジとやり取りする JSON の型 |
| `Assets/TreadRevolt/Scripts/Bridge/FfbBridgeClient.cs` | WebSocket で接続し、入力の受信と FFB の送信を行う(自動再接続、60 回/秒の FFB 送信) |
| `Assets/TreadRevolt/Scripts/Bridge/FfbBridgeTestHud.cs` | テスト用の画面表示(PC のゲームビュー) |
| `Assets/TreadRevolt/Scripts/Editor/FfbBridgeTestMenu.cs` | メニューからテスト用の GameObject を置く |

## 準備

1. **Unity プロジェクトを作る**:Unity Hub で最新 LTS を選び、このリポジトリのフォルダに「Universal 3D(URP)」のプロジェクトを作る。すでに作ってあればそのままでよい
2. **スクリプトを入れる**:この ZIP の `Assets/TreadRevolt` を、プロジェクトの `Assets` の下に置く
3. **ffb-bridge に Origin を許可する**:ffb-bridge の exe と同じフォルダにある `origins.txt` に、次の 1 行を追加する

   ```
   app://vrgame5
   ```

   ブリッジのプログラムは変えない(下位互換)。Origin のない接続や、許可していない Origin は 403 で拒否される
4. **ffb-bridge を起動する**:`start.bat` を起動し、「接続を許可するゲームの URL」に `app://vrgame5` が含まれていることを確かめる

## 手順

1. 新しいシーンを開き、メニュー「TreadRevolt > ffb-bridge 接続テストを配置」を選ぶ
2. Play を押す(VR は不要。ゲームビューに表示が出る)
3. 画面の番号どおりに確かめる

| 確認 | 合格の目安 |
| --- | --- |
| 1. 接続 | 「Connected」と表示される |
| 2. 入力の受信 | 回数が 2 回/秒以上。ハンドルやペダルを動かすと増える |
| 3. 値の表示 | ハンドル、ペダル、シフター、ハンドブレーキを動かすと、対応する軸・ボタンが黄色く光る |
| 4. FFB | 「ブリッジ内蔵テスト」の左・右でハンドルが回る。「ゲームから送信する」をオンにし、constant や spring を動かすと力が変わる |

## 結果を記録すること

あとで入力変換層(割り当て)を作るときに使うので、次を控えておく。

- 機器ごとの名前(画面の ■ の行)
- どの軸が、ハンドル、クラッチ、ブレーキ、アクセル、ハンドブレーキか
- どのボタンが、左右のパドル、親指ボタン、Hシフターの各ギア、シーケンシャルの押し・引きか
- 軸の向き(踏んだときに -1 → 1 か、1 → -1 か)

## うまくいかないとき

| 表示 | 原因と対処 |
| --- | --- |
| 接続を拒否されました(403) | `origins.txt` に `app://vrgame5` がない、またはブリッジを再起動していない。Unity が Origin ヘッダーを送れていない場合も同じ表示になる。その場合は、ブリッジに「Origin のない 127.0.0.1 からの接続を許可する」オプションを足す(下位互換を保って vrgame2 側で対応) |
| ffb-bridge が起動していないようです | `start.bat` を起動する。ほかのブリッジ(vrgame2 の自動起動など)が動いているなら、それに `origins.txt` の行を追加する |
| デバイスが見つからない | 「デバイスを探し直す」を押す。USB を挿し直してから押す |
| FFB が弱い | ブリッジの最大出力が頭打ちされている(自動起動時は 30%)。テスト時は `start.bat` で起動する |

## 事前の確認(参考)

ブリッジの `--mock` モードで、Origin の扱いを確かめてある。

- Origin なし → 403 で拒否
- `app://vrgame5`(origins.txt に追加) → 接続でき、status が返り、ffb と stop を受け付ける
- 許可していない Origin → 403 で拒否

残る確認は、Unity の ClientWebSocket が Origin ヘッダーを実際に送れるか。これがこのテストの一番の目的。
