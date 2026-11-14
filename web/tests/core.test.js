// 中核ロジックのテスト(node --test web/tests/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/core/sim.js';
import { campaignStage, STAGE_COUNT, STAGE_INFO, trainingStage, arenaStage, ARENA_LIST } from '../src/core/stages.js';
import { solvePitch, G, lobSpeed, LOB_ANGLE, LOB_G, spreadDeg } from '../src/core/ballistics.js';
import { wheelToActions, defaultWheelConfig } from '../src/core/tankmap.js';
import { mapSteer } from '../src/core/inputmap.js';
import { FfbModel } from '../src/core/ffbmodel.js';

const run = (sim, sec, cmd = {}) => {
  const inp = new Map([['p1', cmd]]);
  for (let i = 0; i < sec * 60; i++) sim.step(1 / 60, inp);
};

test('左右の履帯:同じ向きで前進、逆向きでその場で回る(超信地旋回)', () => {
  const sim = new Sim(trainingStage(), { mode: 'training' });
  run(sim, 3); // 投下を待つ
  const p = sim.byId.get('p1');
  const z0 = p.z, x0 = p.x;
  run(sim, 2, { left: 1, right: 1 });
  assert.ok(p.z - z0 > 10, `前進していない ${p.z - z0}`);
  run(sim, 2, { left: 0, right: 0 });
  const x1 = p.x, z1 = p.z, yaw1 = p.yaw;
  run(sim, 2, { left: -1, right: 1 });
  assert.ok(Math.hypot(p.x - x1, p.z - z1) < 3, '超信地旋回で大きく動いた');
  assert.ok(Math.abs(p.yaw - yaw1) > 1, '旋回していない');
  assert.ok(p.w > 0, '右を前・左を後ろで左へ回る');
  void x0;
});

test('自動仰角:計算した角度で撃つと目標の距離に届く', () => {
  for (const [dx, dy] of [[50, 0], [120, 0], [100, 5], [80, -6]]) {
    const v = 95;
    const th = solvePitch(dx, dy, v);
    const t = dx / (v * Math.cos(th));
    const y = v * Math.sin(th) * t - 0.5 * G * t * t;
    assert.ok(Math.abs(y - dy) < 0.05, `${dx},${dy} → ${y}`);
  }
  // 曲射:距離の式
  const r = 100, v = lobSpeed(r);
  assert.ok(Math.abs((v * v * Math.sin(2 * LOB_ANGLE)) / LOB_G - r) < 0.01);
});

test('停車射撃は走行中よりばらつきが小さい', () => {
  assert.ok(spreadDeg(0, 10, 0) < 0.2);
  assert.ok(spreadDeg(8, 10, 0) > 2);
});

test('ハンコン:パドルを押している間だけ逆転。左右の入れ替えでパドルも連動', () => {
  const cfg = defaultWheelConfig();
  const w = { steer: 0, clutch: 0.8, throttle: 0.5, brake: 0, paddleL: true, paddleR: false, hasShifter: false, hasHandbrake: false };
  let a = wheelToActions(w, cfg, {});
  assert.equal(a.left, -0.8);
  assert.equal(a.right, 0.5);
  a = wheelToActions({ ...w, paddleL: false }, cfg, {});
  assert.equal(a.left, 0.8); // 離せば前進(トグルではない)
  a = wheelToActions(w, { ...cfg, swap: true }, {});
  assert.equal(a.left, 0.5);
  assert.equal(a.right, -0.8); // 左パドルは右の履帯へ
  assert.equal(a.gear, 2); // シフターなしは常に2速
});

test('ハンコン:ブレーキの踏み込みが閾値を超えた瞬間に1発', () => {
  const cfg = defaultWheelConfig();
  const st = {};
  const base = { steer: 0, clutch: 0, throttle: 0, hasShifter: false, hasHandbrake: false };
  let shots = 0;
  for (const b of [0, 0.3, 0.7, 0.9, 1, 0.8, 0.2, 0, 0.9]) if (wheelToActions({ ...base, brake: b }, cfg, st).fire) shots++;
  assert.equal(shots, 2);
});

test('ハンコン:ハンドルは砲塔の旋回速度(右に切ると右へ回る)', () => {
  const a = wheelToActions({ steer: 0.5, clutch: 0, throttle: 0, brake: 0 }, defaultWheelConfig(), {});
  assert.equal(a.turret, -0.5);
});

test('FFB:反動と被弾の力は範囲内、センタースプリングを出す', () => {
  const f = new FfbModel();
  f.recoil(1);
  f.hit(-1, 1);
  const o = f.update({ dt: 0.016, speed01: 0.5, rough: 0.3, roadHz: 14, turretWeight: 0.25, turretLimit: 0 });
  for (const k of ['c', 'd', 's', 'r']) assert.ok(o[k] >= -1 && o[k] <= 1, k);
  assert.ok(o.s > 0);
});

test('全ステージ・試験場・対戦の戦場が例外なく動く', () => {
  for (let i = 0; i < STAGE_COUNT; i++) {
    const sim = new Sim(campaignStage(i), {});
    run(sim, 8, { left: 1, right: 0.8, fire: true, sub: true });
    assert.ok(sim.mission.objectives > 0, `${i} の目標がない`);
  }
  for (const a of ARENA_LIST) {
    for (const rule of ['dm', 'dom', 'ctf']) {
      const sim = new Sim(arenaStage(a.id), { mode: 'versus', versus: { rule }, players: [{ id: 'p1', vehicle: 'medium', team: 0 }, { id: 'b', ctrl: 'bot', vehicle: 'mech', team: 1 }] });
      run(sim, 5);
    }
  }
});

test('区画制圧:部屋の敵を全滅させると次の門が開く', () => {
  const sim = new Sim(campaignStage(8), {});
  const g1 = sim.gates.find((g) => g.gate === 'r1');
  assert.ok(g1 && g1.alive);
  for (const u of sim.ents) if (u.group === 'r1') sim.kill(u, 'p1');
  sim.mission.state = 'play';
  sim.step(1 / 60, new Map());
  assert.equal(g1.alive, false);
  // 次の門はまだ閉じている
  assert.ok(sim.gates.find((g) => g.gate === 'r2').alive);
});

test('目標をすべて壊すとクリアして、穴へ降りると終わる', () => {
  const sim = new Sim(campaignStage(0), {});
  run(sim, 3);
  for (const u of sim.ents) if (u.objective) sim.kill(u, 'p1');
  run(sim, 0.1);
  assert.equal(sim.mission.state, 'clear');
  assert.ok(sim.mission.timeBonus > 0);
  const p = sim.byId.get('p1');
  p.x = sim.exit.x; p.z = sim.exit.z;
  run(sim, 4);
  assert.equal(sim.mission.state, 'done');
});

test('発射台は曲射でしか壊れない', () => {
  const sim = new Sim(campaignStage(5), {});
  const l = sim.ents.find((e) => e.type === 'launcher');
  const hp = l.hp;
  sim.damage(l, 50, { team: 0, owner: 'p1', x: l.x, z: l.z - 10, lob: false });
  assert.equal(l.hp, hp);
  sim.damage(l, 50, { team: 0, owner: 'p1', x: l.x, z: l.z - 10, lob: true });
  assert.ok(l.hp < hp);
});

test('ボス:決まった手順で倒せる', async () => {
  const { partVulnerable } = await import('../src/core/boss.js');
  const shell = { lob: false, vy: 0, dmg: 9999, owner: 'p1' };
  const lob = { lob: true, vy: -20, dmg: 9999, owner: 'p1' };
  const bossOf = (i) => { const sim = new Sim(campaignStage(i), {}); return { sim, b: sim.ents.find((e) => e.type === 'boss') }; };
  const part = (b, n) => b.parts.find((p) => p.name === n);
  // 移動要塞:後ろの機関部はいつでも撃てる
  {
    const { sim, b } = bossOf(2);
    assert.ok(partVulnerable(b, part(b, 'core'), shell));
    sim.damagePart(b, part(b, 'core'), shell);
    assert.equal(b.alive, false);
  }
  // 多脚:腹の動力炉は脚を2本折るまで撃てない
  {
    const { sim, b } = bossOf(4);
    assert.equal(partVulnerable(b, part(b, 'core'), shell), false);
    sim.damagePart(b, part(b, 'k1'), shell);
    assert.equal(partVulnerable(b, part(b, 'core'), shell), false);
    sim.damagePart(b, part(b, 'k2'), shell);
    assert.ok(partVulnerable(b, part(b, 'core'), shell));
    sim.damagePart(b, part(b, 'core'), shell);
    assert.equal(b.alive, false);
  }
  // 浚渫要塞:吸気口を壊すまで動力炉は撃てない。壊した後も上からの弾(曲射)だけ
  {
    const { sim, b } = bossOf(7);
    b.sub = 0;
    assert.equal(partVulnerable(b, part(b, 'core'), lob), false);
    sim.damagePart(b, part(b, 'v1'), shell);
    sim.damagePart(b, part(b, 'v2'), shell);
    assert.equal(partVulnerable(b, part(b, 'core'), shell), false);
    assert.ok(partVulnerable(b, part(b, 'core'), lob));
    // 潜っている間は撃てない
    b.sub = 1;
    assert.equal(partVulnerable(b, part(b, 'core'), lob), false);
    b.sub = 0;
    sim.damagePart(b, part(b, 'core'), lob);
    assert.equal(b.alive, false);
  }
  // 掘削機:正面のドリルには効かない。後ろの動力炉で倒す
  {
    const { sim, b } = bossOf(10);
    assert.equal(partVulnerable(b, part(b, 'drill'), shell), false);
    sim.damagePart(b, part(b, 'core'), shell);
    assert.equal(b.alive, false);
    assert.equal(sim.mission.objectivesLeft >= 0, true);
  }
});

test('主砲は砲身2本:左右交互に2連射し、1 発ずつ装填する(ゲージが半分で 1 発撃てる)', () => {
  const sim = new Sim(trainingStage(), { mode: 'training' });
  run(sim, 3);
  const p = sim.byId.get('p1');
  const per = p.spec.reload * 0.7; // 1 発ぶんの装填時間(2 発で reload×1.4)
  let shots = 0;
  const step = (sec, fire) => { for (let i = 0; i < Math.round(sec * 60); i++) { sim.step(1 / 60, new Map([['p1', { fire }]])); shots += sim.events.filter((e) => e.t === 'fire' && e.id === 'p1' && e.kind === 'cannon').length; sim.events.length = 0; } };
  step(0.5, true);
  assert.equal(shots, 2, '0.5 秒で 2 発');
  assert.equal(p.ammo, 0);
  step(per - 0.6, true);
  assert.equal(shots, 2, '1 発ぶんの装填が終わるまでは撃てない');
  step(0.3, false);
  assert.equal(p.ammo, 1, '1 発ぶんで 1 発撃てる');
  step(1 / 60, true);
  assert.equal(shots, 3);
  // 撃たずに待てば、2 発までたまる
  step(per * 2 + 0.2, false);
  assert.equal(p.ammo, 2);
  step(0.5, true);
  assert.equal(shots, 5);
});

test('多脚ボス:近くから膝に向けて撃つと、胴体にさえぎられず膝に当たる', () => {
  const i = STAGE_INFO.findIndex((s) => s.id === '2-B');
  const sim = new Sim(campaignStage(i), { mode: 'campaign' });
  run(sim, 4);
  const p = sim.byId.get('p1');
  const b = sim.ents.find((e) => e.type === 'boss');
  b.x = 0; b.z = 40; b.yaw = Math.PI;
  p.x = 0; p.z = 10; p.yaw = 0; p.turret = 14 * Math.PI / 180; p.spread = 0;
  for (let k = 0; k < 120; k++) sim.computeAim(p, false);
  const hits = [];
  const oe = sim.emit.bind(sim);
  sim.emit = (ev) => { if (ev.t === 'hitPart' || ev.t === 'ricochet') hits.push(ev.part || 'body'); return oe(ev); };
  sim.fireMain(p);
  for (let k = 0; k < 120; k++) sim.updateShots(1 / 60);
  assert.ok(/^k\d$/.test(hits[0] || ''), `膝に当たらない: ${hits[0]}`);
});

test('読み上げの辞書:履帯などを読みに置き換える(多脚の「脚」は二重に置き換えない)', async () => {
  const { toSpeech } = await import('../src/audio.js');
  assert.equal(toSpeech('左の履帯をやられた!'), '左のりたいをやられた!');
  assert.equal(toSpeech('広場に多脚の制圧戦車がいる。脚の関節が光ってる。'), '広場にたきゃくの制圧戦車がいる。あしの関節が光ってる。');
  assert.equal(toSpeech('超信地旋回で曲射'), 'ちょうしんちせんかいできょくしゃ');
});

test('読み上げの声:男性の声があれば選び、なければ女性の声を低くする', async () => {
  const { pickVoice } = await import('../src/audio.js');
  const v = (name, lang = 'ja-JP') => ({ name, lang });
  const list = [v('Microsoft Haruka - Japanese (Japan)'), v('Microsoft Ichiro - Japanese (Japan)'), v('Google US English', 'en-US')];
  assert.equal(pickVoice(list, 'male').voice.name, 'Microsoft Ichiro - Japanese (Japan)');
  assert.equal(pickVoice(list, 'female').voice.name, 'Microsoft Haruka - Japanese (Japan)');
  const noMale = pickVoice([v('Google 日本語')], 'male');
  assert.equal(noMale.voice.name, 'Google 日本語');
  assert.ok(noMale.pitch < 1);
});

test('ハンコン:効く角度 180°(左右 90°)を超えて回すと beyond が 1 を超える', () => {
  const cal = { ...defaultWheelConfig().steer };
  assert.equal(cal.lockDeg, 180);
  assert.equal(cal.wheelDeg, 900);
  const raw = (deg) => deg / 450; // 900° のハンドルで片側 450° が raw 1
  assert.ok(mapSteer(raw(80), cal).beyond < 1);
  assert.ok(Math.abs(mapSteer(raw(90), cal).beyond - 1) < 1e-9);
  assert.ok(mapSteer(raw(95), cal).beyond > 1);
  assert.ok(mapSteer(raw(-95), cal).beyond > 1);
  assert.equal(mapSteer(raw(95), cal).value, 1);
});

test('FFB:ソフトロックは効く角度を超えたときだけ、旋回限界と同じ向き(中央向き)に押し返す', () => {
  const base = { dt: 0.016, speed01: 0, rough: 0, roadHz: 14, turretWeight: 0.2, turretLimit: 0 };
  const f = new FfbModel({ gain: 0.2 });
  // 効く角度の内側では何もしない
  assert.equal(f.update({ ...base, steerBeyond: 0.9, steerSign: 1 }).c, 0);
  assert.equal(f.update({ ...base, steerBeyond: 1, steerSign: 1 }).c, 0);
  // 右に回し過ぎ:右の旋回限界(turretLimit −1。右に切ると砲塔は右 = 負へ回る)と同じ向き
  const limitR = Math.sign(new FfbModel({ gain: 0.2 }).update({ ...base, turretLimit: -1 }).c);
  const r = f.update({ ...base, steerBeyond: 1.2, steerSign: 1 }).c;
  assert.equal(Math.sign(r), limitR);
  assert.ok(Math.abs(r) >= 0.8 - 1e-9, 'ゲインが低くても弱めすぎない');
  const l = f.update({ ...base, steerBeyond: 1.2, steerSign: -1 }).c;
  assert.equal(Math.sign(l), -limitR);
  // 数度(5°/90° ≈ 0.056)超えたところで、もうはっきり効く
  assert.ok(Math.abs(f.update({ ...base, steerBeyond: 1 + 5 / 90, steerSign: 1 }).c) > 0.3);
  // softLock 0 で無効
  const off = new FfbModel({ softLock: 0 });
  assert.equal(off.update({ ...base, steerBeyond: 1.5, steerSign: 1 }).c, 0);
});

test('移動要塞:甲板の砲塔と迫撃砲を壊すほど遅くなる', async () => {
  const { BOSSES, haulerSpeedK } = await import('../src/core/boss.js');
  const e = { parts: BOSSES.hauler.parts() };
  assert.equal(haulerSpeedK(e), 1);
  e.parts.find((p) => p.name === 't1').alive = false;
  assert.ok(Math.abs(haulerSpeedK(e) - 0.87) < 1e-9);
  for (const p of e.parts) if (!p.core) p.alive = false;
  assert.ok(Math.abs(haulerSpeedK(e) - 0.38) < 1e-9);
});

test('ボスの燃えかす:倒すと遮蔽物になり、脱出の穴をふさぐ位置では当たり判定を足さない', () => {
  const st = campaignStage(2); // 1-B 移動要塞
  const sim = new Sim(st, { seed: 5, players: [{ id: 'p1', vehicle: 'medium', ctrl: 'local' }] });
  const boss = sim.ents.find((e) => e.type === 'boss');
  boss.x = 60; boss.z = 40; boss.yaw = 0.4;
  const n0 = sim.obstacles.list.length;
  sim.kill(boss, 'p1');
  assert.equal(sim.obstacles.list.length, n0 + 1);
  const w = sim.obstacles.list.at(-1);
  assert.equal(w.kind, 'bossWreck');
  assert.ok(sim.obstacles.pointHit(60, sim.terrain.height(60, 40) + 1.5, 40), '弾を止める');
  const pos = { x: 60, z: 40 };
  assert.ok(sim.obstacles.pushOut(pos, 2.4), '車両を押し出す');
  // 脱出の穴の上で倒したとき
  const sim2 = new Sim(st, { seed: 5, players: [{ id: 'p1', vehicle: 'medium', ctrl: 'local' }] });
  const b2 = sim2.ents.find((e) => e.type === 'boss');
  b2.x = sim2.exit.x; b2.z = sim2.exit.z + 5;
  const m0 = sim2.obstacles.list.length;
  sim2.kill(b2, 'p1');
  assert.equal(sim2.obstacles.list.length, m0);
});

test('ハンコン:ハンドルを中央にしていると、砲塔がゆっくり正面へ戻る(撃った直後は戻らない)', () => {
  const st = trainingStage();
  const mk = () => {
    const sim = new Sim(st, { seed: 3, players: [{ id: 'p1', vehicle: 'medium', ctrl: 'local' }] });
    const me = sim.byId.get('p1');
    sim.mission.state = 'play';
    me.drop = 0;
    me.yaw = Math.PI; // 的のない後ろを向く(照準が敵に合わないように)
    me.turret = 0.6;
    return { sim, me };
  };
  const run = (sim, cmd, n) => { for (let i = 0; i < n; i++) sim.step(1 / 60, new Map([['p1', { ...cmd }]])); };
  // 戻る
  let { sim, me } = mk();
  run(sim, { turretCenter: true }, 60);
  assert.equal(me.aim.lock, null);
  assert.ok(me.turret < 0.6 - 0.2, `戻っていない ${me.turret}`);
  run(sim, { turretCenter: true }, 240);
  assert.ok(Math.abs(me.turret) < 1e-6, '正面で止まる');
  // ハンドルを切っている間は戻らない(速度制御のまま)
  ({ sim, me } = mk());
  run(sim, { turretCenter: true, turret: 0.5 }, 30);
  assert.ok(me.turret > 0.6, '切った向きへ回る');
  // 頼まれなければ戻らない
  ({ sim, me } = mk());
  run(sim, {}, 60);
  assert.ok(Math.abs(me.turret - 0.6) < 1e-9);
  // 撃った直後は戻らない
  ({ sim, me } = mk());
  me.fireT = 0.35;
  run(sim, { turretCenter: true }, 60);
  assert.ok(Math.abs(me.turret - 0.6) < 1e-9, '撃った直後に戻った');
});

test('曲射:目標が砲塔の向きから 10° 以内なら、向きを吸いつけて当たる(VR で頭の向きが少しずれても)', async () => {
  const { yawTo, DEG } = await import('../src/core/util.js');
  const sim = new Sim(campaignStage(1), { seed: 9, players: [{ id: 'p1', vehicle: 'medium', ctrl: 'local' }] });
  const me = sim.byId.get('p1');
  sim.mission.state = 'play'; me.drop = 0; me.invuln = 999;
  for (const e of sim.ents) if (e.team === 1 && e.type !== 'launcher') { e.alive = false; e.hidden = true; }
  const L = sim.ents.find((e) => e.type === 'launcher');
  L.hidden = false; L.rise = 1; L.trigger = null;
  me.x = L.x + 20; me.z = L.z - 95; me.yaw = 0;
  me.turret = yawTo(me.x, me.z, L.x, L.z) + 8 * DEG;
  const hp0 = L.hp;
  for (let i = 0; i < 300; i++) sim.step(1 / 60, new Map([['p1', { lob: true, fire: me.wheelie > 0.6 && i % 30 === 0 }]]));
  for (let i = 0; i < 400; i++) sim.step(1 / 60, new Map([['p1', {}]]));
  assert.ok(L.hp < hp0, '外れた');
});

test('歩行メカ:主砲のボタンで、拳の届く所の敵は炸薬パンチで殴る(遠ければ主砲)', () => {
  const sim = new Sim(campaignStage(0), { seed: 4, players: [{ id: 'p1', vehicle: 'mech', ctrl: 'local' }] });
  run(sim, 4); // 降下して着地するまで
  const me = sim.byId.get('p1');
  me.invuln = 999;
  const foe = sim.ents.find((e) => e.type === 'lightTank' && e.alive);
  for (const e of sim.ents) if (e.team === 1 && e !== foe) { e.alive = false; e.hidden = true; }
  foe.ai.state = 'sleep';
  me.yaw = 0; me.turret = 0;
  foe.x = me.x; foe.z = me.z + 5.5; foe.y = me.y;
  const hp0 = foe.hp;
  sim.events.length = 0;
  const evs = [];
  const step = (cmd, n = 1) => { for (let i = 0; i < n; i++) { sim.step(1 / 60, new Map([['p1', { ...cmd }]])); evs.push(...sim.events); sim.events.length = 0; } };
  step({ fire: true }); step({}, 20);
  assert.ok(evs.some((e) => e.t === 'punch'), 'パンチした');
  assert.ok(!evs.some((e) => e.t === 'fire' && e.kind === 'cannon'), '近くでは主砲を撃たない');
  assert.ok(foe.hp < hp0 - 50 || !foe.alive, `当たっていない ${foe.hp}`);
  // 遠い敵には主砲
  const sim2 = new Sim(campaignStage(0), { seed: 4, players: [{ id: 'p1', vehicle: 'mech', ctrl: 'local' }] });
  run(sim2, 4);
  sim2.events.length = 0;
  const ev2 = [];
  sim2.step(1 / 60, new Map([['p1', { fire: true }]])); ev2.push(...sim2.events);
  assert.ok(!ev2.some((e) => e.t === 'punch'));
  assert.ok(ev2.some((e) => e.t === 'fire' && e.kind === 'cannon'));
});
