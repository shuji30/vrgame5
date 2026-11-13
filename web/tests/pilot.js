// テスト用の操縦役:人の遊び方に近い単純な手順でステージを進める(バランスとクリアできるかの確認用)
//   見えている近くの敵を優先 → いなければ目標(区画制圧は開いた部屋から順に)
//   止まって撃つ(停車射撃)。発射台は曲射。ボスは弱点の側へ回り込む。詰まったら横へ回り込む
import { steerTo, avoid } from '../src/core/ai.js';
import { wrapAngle, yawTo, dist } from '../src/core/util.js';
import { partPos, partVulnerable } from '../src/core/boss.js';
import { PathGrid } from './pathfind.js';

export function makePilot(sim, id = 'p1') {
  const st = { stuck: 0, last: null, detour: null, detourT: 0, pathT: 0, wp: null };
  const grid = new PathGrid(sim);
  return function pilot(dt) {
    const p = sim.byId.get(id);
    const cmd = { gear: 2 };
    if (!p.alive || p.drop > 0) return cmd;
    const m = sim.mission;
    let goal = null, aim = null, lob = false, standoff = 45;
    if (m.state === 'clear' && sim.exit) {
      goal = { x: sim.exit.x, z: sim.exit.z };
    } else {
      const foes = sim.ents.filter((e) => e.team !== p.team && e.alive && !e.hidden && e.type !== 'truck' && e.type !== 'skyFortress' && e.type !== 'mine');
      // 区画制圧:一番小さい番号の門の部屋の敵から
      const groups = sim.gates.filter((g) => g.alive).map((g) => Number(String(g.gate).replace(/\D/g, ''))).filter((n) => n > 0);
      const nextRoom = groups.length ? `r${Math.min(...groups)}` : null;
      const pool = nextRoom ? foes.filter((e) => e.group === nextRoom || !e.group || e.group === 'r9' && !groups.length) : foes;
      const near = pool.filter((e) => e.type !== 'boss' && dist(e.x, e.z, p.x, p.z) < 60 && sim.canSee(p, e)).sort((a, b) => dist(a.x, a.z, p.x, p.z) - dist(b.x, b.z, p.x, p.z))[0];
      const boss = pool.find((e) => e.type === 'boss');
      let T = near || pool.filter((e) => e.objective && e.type !== 'boss').sort((a, b) => dist(a.x, a.z, p.x, p.z) - dist(b.x, b.z, p.x, p.z))[0] || (boss && !near ? boss : null) || pool.sort((a, b) => dist(a.x, a.z, p.x, p.z) - dist(b.x, b.z, p.x, p.z))[0];
      if (!T) return cmd;
      if (T.type === 'boss') {
        // 撃てる部位(弱点を優先)へ、外側から回り込む
        const shot = { lob: false, vy: 0 };
        const parts = T.parts.filter((q) => q.alive && !q.armored);
        let part = parts.find((q) => q.stunOnly && partVulnerable(T, q, shot)) || parts.find((q) => q.core && partVulnerable(T, q, q.topOnly ? { lob: true, vy: -20 } : shot)) || parts.find((q) => q.weak && partVulnerable(T, q, shot)) || parts.find((q) => partVulnerable(T, q, shot)) || parts.find((q) => q.topOnly);
        if (!part) part = parts[0];
        const pp = partPos(T, part);
        const out = Math.atan2(pp.x - T.x, pp.z - T.z);
        const r = part.topOnly ? 70 : 34;
        goal = { x: pp.x + Math.sin(out) * r, z: pp.z + Math.cos(out) * r };
        // 上からしか撃てない部位:いまいる側(岸)に 70m 離れて曲射
        if (part.topOnly) { const side = Math.atan2(p.x - T.x, p.z - T.z); goal = { x: T.x + Math.sin(side) * r, z: T.z + Math.cos(side) * r }; }
        aim = pp;
        lob = !!part.topOnly;
        standoff = 6;
        if (dist(p.x, p.z, goal.x, goal.z) > 70) aim = null;
        // 胴体に弾かれる位置からは撃たない(排気口が開いているか、ボスの後ろにいるときだけ)
        const behind = (p.x - T.x) * Math.sin(T.yaw) + (p.z - T.z) * Math.cos(T.yaw) < -4;
        if (T.boss === 'driller' && !part.stunOnly && !behind) cmd.fireOk = false;
        // 近くて見えていれば止まって撃つ(停車射撃)
        else if (!part.topOnly && dist(p.x, p.z, pp.x, pp.z) < 55 && !sim.obstacles.blocked(p.x, p.y + 2, p.z, pp.x, pp.y, pp.z)) goal = null;
        // 装填中と、突進の構えを見たら横へ動く(回避)
        if (part.topOnly) {
          const d = dist(p.x, p.z, T.x, T.z);
          if (d > 45 && d < 120) goal = null;
        }
        const charging = T.phase === 'windup' || T.phase === 'charge';
        if (!part.topOnly && (charging || p.reload > 0.8)) {
          st.side ??= 1;
          if (Math.random() < 0.01) st.side = -st.side;
          const toB = Math.atan2(T.x - p.x, T.z - p.z) + (Math.PI / 2) * st.side;
          goal = { x: p.x + Math.sin(toB) * 25, z: p.z + Math.cos(toB) * 25 };
          standoff = 3;
          if (charging) aim = null;
        }
      } else {
        aim = { x: T.x, y: T.y + 1, z: T.z };
        lob = !!T.spec?.lobOnly;
        standoff = lob ? 80 : T.objective ? 50 : 40;
        const d = dist(p.x, p.z, T.x, T.z);
        const see = lob || sim.canSee(p, T);
        goal = see && d < standoff + 10 ? null : { x: T.x, z: T.z };
        if (!see) standoff = 8; // 見えていなければ、見える所まで近づく
        cmd.fireOk = see;
        if (lob && d < 40) goal = { x: p.x - (T.x - p.x), z: p.z - (T.z - p.z) }; // 近すぎたら下がる
      }
    }
    if (aim) {
      const want = yawTo(p.x, p.z, aim.x, aim.z);
      cmd.turretYaw = wrapAngle(want - p.yaw);
      const err = Math.abs(wrapAngle(want - p.yaw - p.turret));
      const d = dist(p.x, p.z, aim.x, aim.z);
      if (lob) {
        if (!goal || dist(p.x, p.z, goal.x, goal.z) < standoff + 4) { cmd.lob = true; cmd.lobAnalog = false; if (p.wheelie > 0.6 && p.reload <= 0 && err < 0.05) cmd.fire = true; }
      } else if ((p.ammo > 0 || p.reload <= 0) && p.cycle <= 0 && err < 0.03 && d < 110 && cmd.fireOk !== false) cmd.fire = true;
      cmd.sub = d < 35;
    }
    // 屋内の区画:目標が壁の向こうなら、開いた門を経由する
    if (goal && sim.gates.length) {
      const open = sim.gates.filter((g) => !g.alive && !st.passed?.has(g.id));
      const dT = dist(p.x, p.z, goal.x, goal.z);
      if (sim.obstacles.blocked(p.x, 2, p.z, goal.x, 2, goal.z)) {
        const via = open.filter((g) => dist(g.x, g.z, goal.x, goal.z) < dT).sort((a, b) => dist(p.x, p.z, a.x, a.z) + dist(a.x, a.z, goal.x, goal.z) - dist(p.x, p.z, b.x, b.z) - dist(b.x, b.z, goal.x, goal.z))[0];
        if (via) {
          if (dist(p.x, p.z, via.x, via.z) < 5) (st.passed ||= new Set()).add(via.id);
          else { goal = { x: via.x, z: via.z }; standoff = 2; }
        }
      }
    }
    const arrived = !goal || dist(p.x, p.z, goal.x, goal.z) < standoff;
    if (!arrived && !cmd.lob) {
      if (st.detour) { st.detourT -= dt; if (st.detourT <= 0 || dist(p.x, p.z, st.detour.x, st.detour.z) < 5) st.detour = null; }
      // 見通せないときは経路探索(0.5 秒ごとに引き直す)
      st.pathT -= dt;
      if (st.pathT <= 0) {
        st.pathT = 0.5;
        st.wp = sim.obstacles.blocked(p.x, p.y + 1.5, p.z, goal.x, p.y + 1.5, goal.z) || dist(p.x, p.z, goal.x, goal.z) > 40 ? grid.next(p.x, p.z, goal.x, goal.z) : null;
      }
      const g = st.detour || st.wp || avoid(p, sim, goal.x, goal.z);
      const s = steerTo(p, g.x, g.z, { arrive: 2 });
      cmd.left = s.left; cmd.right = s.right;
      // 詰まったら横へ
      if (st.last && dist(p.x, p.z, st.last.x, st.last.z) < 0.08) st.stuck += dt; else st.stuck = Math.max(0, st.stuck - dt);
      if (st.stuck > 1.5) {
        const a = p.yaw + (Math.random() < 0.5 ? 1 : -1) * (1.2 + Math.random());
        st.detour = { x: p.x + Math.sin(a) * 22, z: p.z + Math.cos(a) * 22 };
        st.detourT = 4;
        st.stuck = 0;
      }
    }
    // 砲塔の旋回範囲(左右 90°)の外の相手には、その場で車体を回して向ける(超信地旋回)
    if (aim && (cmd.left == null || arrived || cmd.lob)) {
      const rel = wrapAngle(yawTo(p.x, p.z, aim.x, aim.z) - p.yaw);
      if (Math.abs(rel) > (sim.turretRange || Math.PI) - 0.15) {
        const tq = Math.sign(rel);
        cmd.left = -tq; cmd.right = tq;
        cmd.lob = false;
      }
    }
    st.last = { x: p.x, z: p.z };
    return cmd;
  };
}
