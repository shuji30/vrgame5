// 中核ロジックのテスト(node --test web/tests/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/core/sim.js';
import { campaignStage, STAGE_COUNT, STAGE_INFO, trainingStage, arenaStage, ARENA_LIST } from '../src/core/stages.js';
import { solvePitch, G, lobSpeed, LOB_ANGLE, LOB_G, spreadDeg } from '../src/core/ballistics.js';
import { wheelToActions, defaultWheelConfig } from '../src/core/tankmap.js';
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

test('主砲は砲身2本:左右交互に2連射し、撃ち切ったら2本まとめて装填', () => {
  const sim = new Sim(trainingStage(), { mode: 'training' });
  run(sim, 3);
  const p = sim.byId.get('p1');
  let shots = 0;
  const fireFor = (sec) => { for (let i = 0; i < sec * 60; i++) { sim.step(1 / 60, new Map([['p1', { fire: true }]])); shots += sim.events.filter((e) => e.t === 'fire' && e.id === 'p1' && e.kind === 'cannon').length; sim.events.length = 0; } };
  fireFor(0.5);
  assert.equal(shots, 2, '0.5 秒で 2 発');
  assert.equal(p.ammo, 0);
  fireFor(2);
  assert.equal(shots, 2, '装填中は撃てない');
  fireFor(p.spec.reload * 1.4);
  assert.ok(shots >= 3, '装填が終わるとまた撃てる');
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
