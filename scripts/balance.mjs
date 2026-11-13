// バランスの確認(開発用):操縦役(web/tests/pilot.js)で各ステージを遊ばせ、クリアできるか・残り時間・被撃破を見る
//   node scripts/balance.mjs [ステージ番号,...] [難易度] [車両]
import { Sim } from '../web/src/core/sim.js';
import { campaignStage, STAGE_COUNT } from '../web/src/core/stages.js';
import { makePilot } from '../web/tests/pilot.js';

const only = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2].split(',').map(Number) : [...Array(STAGE_COUNT).keys()];
const diff = process.argv[3] || 'normal';
const veh = process.argv[4] || 'medium';
const runs = Number(process.argv[5] || 1); // 乱数の種を変えて何回遊ばせるか
const DT = 1 / 30;
for (const i of only) for (let run = 0; run < runs; run++) {
  const st = campaignStage(i);
  const sim = new Sim(st, { difficulty: diff, seed: 1000 + run * 77, players: [{ id: 'p1', vehicle: veh, ctrl: 'local' }] });
  const pilot = makePilot(sim);
  let t = 0;
  while (t < (st.time || 300) + 40 && !['done', 'fail'].includes(sim.mission.state)) {
    sim.step(DT, new Map([['p1', pilot(DT)]]));
    sim.events.length = 0;
    t += DT;
  }
  const m = sim.mission;
  const p = sim.byId.get('p1');
  console.log(`${st.id} ${st.name.padEnd(6, ' ')} ${m.state.padEnd(4)} 経過 ${t.toFixed(0)}/${st.time}秒 残り ${Math.max(0, m.timeLeft).toFixed(0)}秒 撃破 ${m.kills} 被撃破 ${m.deaths} 目標 ${m.objectives - m.objectivesLeft}/${m.objectives}${m.state === 'fail' ? ` 理由 ${m.failReason}` : ''}  自機@${p.x.toFixed(0)},${p.z.toFixed(0)}`);
}
