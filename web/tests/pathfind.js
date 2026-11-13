// テスト用の経路探索:4m の格子で、障害物・水・場外を避ける A*(閉じた門は通れない)
const CELL = 4;

export class PathGrid {
  constructor(sim, radius = 2.6) {
    this.sim = sim;
    this.r = radius;
    this.version = -1;
  }

  build() {
    const t = this.sim.terrain;
    this.nx = Math.floor((t.hw * 2) / CELL);
    this.nz = Math.floor((t.hd * 2) / CELL);
    this.block = new Uint8Array(this.nx * this.nz);
    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        const x = -t.hw + (i + 0.5) * CELL, z = -t.hd + (j + 0.5) * CELL;
        let b = !t.inBounds(x, z, this.r) || t.isWater(x, z, this.r * 0.6);
        if (!b) for (const o of this.sim.obstacles.near(x, z, this.r + 2)) {
          if (o.passable) continue;
          const dx = Math.abs(x - o.x), dz = Math.abs(z - o.z);
          if (o.shape === 'box' && !o.rot) { if (dx < o.w / 2 + this.r && dz < o.d / 2 + this.r) { b = true; break; } }
          else if (Math.hypot(dx, dz) < o.br + this.r * 0.8) { b = true; break; }
        }
        this.block[j * this.nx + i] = b ? 1 : 0;
      }
    }
    this.version = this.sim.obstacles.list.filter((o) => o.alive).length;
  }

  cell(x, z) {
    const t = this.sim.terrain;
    return [Math.max(0, Math.min(this.nx - 1, Math.floor((x + t.hw) / CELL))), Math.max(0, Math.min(this.nz - 1, Math.floor((z + t.hd) / CELL)))];
  }

  center(i, j) {
    const t = this.sim.terrain;
    return { x: -t.hw + (i + 0.5) * CELL, z: -t.hd + (j + 0.5) * CELL };
  }

  // 次に向かう地点(経路が見つからなければ null)
  next(fx, fz, tx, tz) {
    if (this.version !== this.sim.obstacles.list.filter((o) => o.alive).length) this.build();
    const [si, sj] = this.cell(fx, fz), [gi, gj] = this.cell(tx, tz);
    const N = this.nx * this.nz, start = sj * this.nx + si, goal = gj * this.nx + gi;
    const g = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1);
    const open = [[0, start]];
    g[start] = 0;
    const h = (k) => Math.hypot((k % this.nx) - gi, Math.floor(k / this.nx) - gj);
    let found = false, iter = 0;
    while (open.length && iter++ < 20000) {
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
      const [, cur] = open.splice(bi, 1)[0];
      if (cur === goal) { found = true; break; }
      const ci = cur % this.nx, cj = Math.floor(cur / this.nx);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= this.nx || nj >= this.nz) continue;
        const nk = nj * this.nx + ni;
        if (this.block[nk] && nk !== goal) continue;
        if (di && dj && (this.block[cj * this.nx + ni] || this.block[nj * this.nx + ci])) continue;
        const ng = g[cur] + (di && dj ? 1.414 : 1);
        if (ng < g[nk]) { g[nk] = ng; came[nk] = cur; open.push([ng + h(nk), nk]); }
      }
    }
    if (!found) return null;
    const path = [];
    for (let k = goal; k !== -1 && k !== start; k = came[k]) path.push(k);
    path.reverse();
    const k = path[Math.min(2, path.length - 1)];
    if (k == null) return { x: tx, z: tz };
    return this.center(k % this.nx, Math.floor(k / this.nx));
  }
}
