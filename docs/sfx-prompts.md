# 効果音の差し替え:優先順と AI 生成用プロンプト

効果音は `web/assets/sfx/<名前>.wav`(無ければ `.m4a`)を置き換えると、合成の代わりにそのファイルが鳴る。仕組みは `docs/web.md` の「効果音」を参照。

優先順は「よく聞くか」と「本物らしさの差が出やすいか」で決めた。プロンプトは AI の効果音生成(ElevenLabs Sound Effects、Stable Audio など)向けに英語で書いてある。

## 作るときの共通の注意

- **モノラルにする**:ゲームが位置に合わせて左右に振る。AI はステレオで出力することが多いので変換する
- **頭の無音を削る**:無音があると、撃ってから音が鳴るまで遅れる
- **残響を入れない**:車内のこもりや距離による減衰はゲームが付ける
- **音量を元のファイルに揃える**:元のファイルと並べて聞き、大きさを合わせる

変換の例(ステレオをモノラルにし、頭の無音を削る):

```
ffmpeg -i in.wav -ac 1 -af "silenceremove=start_periods=1:start_threshold=-50dB" out.wav
```

### ループの素材の速さ

`loop-engine` と `loop-clank` は、ゲーム側で次の速さを基準に再生速度を変えて鳴らす(`web/src/audio.js` の `FIRE_RATE` と `CLANK_RATE`)。

- `loop-engine`:1 秒に 30 回の爆発
- `loop-clank`:1 秒に 48 枚の板が当たる

AI で作った音はこの速さに合わないことが多い。走る速さと音が合わないときは、素材を作り直すより、`FIRE_RATE` と `CLANK_RATE` を素材に合わせて変えるほうが早い。

---

## A. 最優先(常に聞こえる、または毎回聞く音)

### 1. `loop-engine.wav`:自車と敵のエンジン(常に鳴っている)

1.0 秒の継ぎ目のないループにする。回転数はゲームが再生速度で変える。

```
Heavy military tank diesel engine running at steady low RPM, deep rhythmic throbbing exhaust pulses, mechanical, close mic on engine deck, dry, no reverb, no music, constant RPM, seamless loop
```

### 2. `loop-clank.wav`:キャタピラの板が当たる音(走っている間ずっと鳴る)

2.0 秒の継ぎ目のないループにする。速めの走行で、カチャカチャと板が連続して当たる音。

```
Steel tank tracks clanking at medium-high speed, metal track links hitting road wheels and drive sprocket, rapid continuous metallic rattling, no engine sound, dry, close perspective, constant speed, seamless loop
```

### 3. `cannon.wav`:自車の主砲(約 1.9 秒)

```
Tank main gun firing heard from inside the turret, massive low boom with sharp crack, heavy recoil thump, short metallic rattle of the breech and spent shell casing falling, no music, no reverb tail
```

### 4. `explosion.wav`:着弾、撃破(約 2.1 秒)

```
Large explosion of an armored vehicle at medium distance, deep blast with debris and metal fragments scattering, short rumble tail, no music
```

### 5. `hit.wav`:自車が被弾したとき(約 1 秒)

```
Shell impact on thick tank armor heard from inside, violent metallic clang with low thud, ringing steel, short and punchy, no music
```

## B. 優先(戦闘中によく聞く音)

### 6. `loop-missile.wav`:ミサイルが飛んでいる間の噴射音

2.0 秒の継ぎ目のないループにする。近づく・離れるときの音程の変化(ドップラー)はゲームが付ける。

```
Rocket motor burning continuously, roaring hiss with crackling flame, steady thrust, no doppler, no fly-by, dry, seamless loop
```

### 7. `missile.wav`:ミサイルの点火と発射(約 1.4 秒)

```
Anti-tank missile launch, sharp ignition pop followed by an aggressive whoosh of rocket exhaust, short, no music
```

### 8. `impactGround.wav`:弾が地面に当たる音(約 0.7 秒)

```
Tank shell hitting dirt ground, dull heavy thump with spray of soil and gravel, short, no music
```

### 9. `cannonEnemy.wav`:敵戦車の砲撃(約 1 秒)

```
Distant tank cannon firing, deep boom with sharp report, heard from 100 meters away, short, no music
```

### 10. `mg.wav`:自車の機銃の 1 発(約 0.3 秒)

連射は、この 1 発をゲームがくり返して鳴らす。

```
Single shot of a heavy machine gun mounted on a tank, sharp short bang, no echo, one shot only
```

### 11. `mgEnemy.wav`:敵の機銃の 1 発(約 0.3 秒)

```
Single distant machine gun shot, sharp crack, heard from far away, one shot only
```

### 12. `ricochet.wav`:弾が跳ね返る音(約 0.7 秒)

```
Bullet ricochet off steel armor, sharp metallic ping with a whizzing zing, short
```

### 13. `bigExplosion.wav`:ボスや大物の撃破(約 3.4 秒)

```
Huge explosion of a giant war machine, massive deep blast, secondary explosions, heavy metal debris falling, long rumbling tail, no music
```

### 14. `smallExplosion.wav`:小さな爆発(約 0.8 秒)

```
Small explosion, grenade-sized blast, short sharp pop with dirt, no music
```

## C. あると良い(特定の操作や場面の音)

### 15. `lob.wav`:逆立ちしての曲射(約 0.8 秒)

```
Mortar firing, hollow thump launch with short whoosh of the shell leaving the tube
```

### 16. `trackBreak.wav`:履帯が切れる(約 0.8 秒)

```
Tank track snapping, loud metallic bang followed by heavy chain links clattering to the ground
```

### 17. `reload.wav`:主砲の装填(約 1 秒)

```
Tank cannon reloading, heavy shell sliding into the breech and the breech block slamming shut, metallic clunk, inside the turret
```

### 18. `gear.wav`:変速(約 0.4 秒)

```
Heavy vehicle gear shift, mechanical clunk of a gearbox lever, short
```

### 19. `land.wav`:着地(約 0.9 秒)

```
Heavy tank landing on the ground after a drop, massive thud with suspension creak and metal rattle
```

### 20. `splash.wav`:水に着弾(約 1.4 秒)

```
Shell hitting water, big splash with spray falling back down, no music
```

### 21. `bigCannon.wav`:ボスの大砲(約 2.8 秒)

```
Gigantic artillery cannon firing, earth-shaking deep boom with long rumble, heard from medium distance
```

## D. ボスの音(場面は限られるが印象に残る)

### 22. `stomp.wav`:多脚ボスの足音(約 1 秒)

```
Giant mechanical walker footstep, heavy metal foot slamming the ground, deep thud with hydraulic hiss
```

### 23. `bossRoar.wav`:ボスの登場(約 3.3 秒)

```
Huge mining machine powering up, deep mechanical roar, grinding gears and hydraulic hiss, menacing, no animal or voice
```

### 24. `drill.wav`:掘削機ボスのドリル(約 2.6 秒)

```
Giant industrial drill spinning up, harsh grinding metal whine with rock crushing
```

## E. 余裕があれば

| ファイル | 場面 | プロンプト |
|---|---|---|
| `gateOpen.wav` | 門が開く | `Heavy steel gate sliding open, grinding metal and chains, industrial` |
| `elevator.wav` | エレベーター | `Large industrial freight elevator moving, motor hum and metal clanks` |
| `crunch.wav` | 物を踏み潰す | `Tank crushing a wooden crate, wood splintering under heavy weight` |
| `smoke.wav` | 煙幕 | `Smoke grenade launcher firing, short pop then hissing smoke release` |
| `mine.wav` | 地雷 | `Landmine trigger click, short metallic click` |
| `repair.wav` | 修理 | `Mechanic repairing metal with wrench, short ratchet and clank` |

## 置き換えなくてよい音(合成のままがおすすめ)

`ui`、`uiOk`、`uiBack`、`click`、`countdown`、`countdownGo`、`objective`、`bonus`、`capture`、`flag`、`alarm`、`drop`、`wake`

メニュー、カウントダウン、通知などの合図の音。本物らしさより聞き分けやすさが大事なので、今の電子音で十分。

## ファイルにしていない音

転輪のゴロゴロ、砂利、超信地旋回の軋み、メカのサーボ音、無線のピッという音は合成のまま(`web/src/audio.js`)。ファイルでは置き換えられない。
