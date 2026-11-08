import { describe, expect, it } from 'vitest';
import { createCharacter } from '../src/sim/character';
import { Simulation } from '../src/sim/sim';
import { BLOCKING, FLOOR_H, floorLevel, moveWithCollision, Tile, type GameMap } from '../src/sim/world/map';
import { REGION_IDS, buildRegion } from '../src/sim/world/regions';

/** Componentes caminháveis (vizinhança de 4), com o tamanho de cada um. */
function components(m: GameMap): { id: Int32Array; size: Map<number, number> } {
  const id = new Int32Array(m.w * m.h).fill(-1);
  const size = new Map<number, number>();
  const walk = (i: number) => !BLOCKING.has(m.tiles[i] as Tile);
  for (let s = 0; s < m.w * m.h; s++) {
    if (id[s] !== -1 || !walk(s)) continue;
    const st = [s];
    id[s] = s;
    for (let k = 0; k < st.length; k++) {
      const i = st[k]!;
      const x = i % m.w;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx;
        const ny = ((i / m.w) | 0) + dy;
        if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
        const j = ny * m.w + nx;
        if (id[j] !== -1 || !walk(j)) continue;
        id[j] = s;
        st.push(j);
      }
    }
    size.set(s, st.length);
  }
  return { id, size };
}

describe.each(REGION_IDS)('Andares — %s', (rid) => {
  const m = buildRegion(rid);
  const W1 = m.w + 1;
  const walk = (x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h && !BLOCKING.has(m.tiles[y * m.w + x] as Tile);

  it('cada andar é plano: todo chão caminhável (fora rampas e ponte) fica na altura exata do seu andar', () => {
    const bad: string[] = [];
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        const t = m.tiles[y * m.w + x] as Tile;
        if (!walk(x, y) || t === Tile.Ramp || t === Tile.Bridge) continue;
        const want = m.floors[y * m.w + x]! * FLOOR_H;
        for (const [cx, cy] of [
          [x, y],
          [x + 1, y],
          [x, y + 1],
          [x + 1, y + 1],
        ] as const)
          if (Math.abs(m.heights[cy * W1 + cx]! - want) > 1e-6) bad.push(`${x},${y}`);
      }
    expect(bad).toEqual([]);
  });

  it('só se troca de andar por uma rampa', () => {
    const bad: string[] = [];
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++)
        for (const [dx, dy] of [
          [1, 0],
          [0, 1],
        ] as const) {
          if (!walk(x, y) || !walk(x + dx, y + dy)) continue;
          const a = m.tiles[y * m.w + x];
          const b = m.tiles[(y + dy) * m.w + x + dx];
          if (a === Tile.Ramp || b === Tile.Ramp) continue;
          if (floorLevel(m, x, y) !== floorLevel(m, x + dx, y + dy) && a !== Tile.Bridge && b !== Tile.Bridge) bad.push(`${x},${y}`);
        }
    expect(bad).toEqual([]);
  });

  it('tem andares de verdade e rampas de 3 tiles de largura ligando todos os platôs grandes', () => {
    expect(Math.max(...m.floors)).toBeGreaterThanOrEqual(2);
    expect(m.ramps.length).toBeGreaterThanOrEqual(3);
    for (const r of m.ramps)
      for (let k = 0; k < r.len; k++)
        for (let o = -1; o <= 1; o++) expect(m.tiles[(r.y + k * r.dy + o * r.dx) * m.w + r.x + k * r.dx - o * r.dy]).toBe(Tile.Ramp);
    const { id, size } = components(m);
    const main = id[Math.floor(m.playerStart.y) * m.w + Math.floor(m.playerStart.x)]!;
    const isolated = [...size].filter(([c, n]) => c !== main && n > 20);
    expect(isolated).toEqual([]);
  });

  it('um monstro segue o jogador rampa acima, de andar em andar', () => {
    const c = createCharacter('Teste', 'vigor', 3);
    c.region = rid;
    const sim = new Simulation(c, 5);
    const map = sim.map;
    for (const r of map.ramps) {
      const foot = { x: r.x - r.dx + 0.5, y: r.y - r.dy + 0.5 };
      const top = { x: r.x + (r.len + 1) * r.dx + 0.5, y: r.y + (r.len + 1) * r.dy + 0.5 };
      // Começa um pouco ao lado do pé da rampa e precisa chegar ao andar de cima.
      const p = { ...foot };
      for (let i = 0; i < 400 && Math.hypot(p.x - top.x, p.y - top.y) > 0.6; i++) {
        const d = sim.pathDir(p, top);
        moveWithCollision(map, p, d.x * 0.12, d.y * 0.12, 0.45);
      }
      expect(floorLevel(map, p.x, p.y), `rampa ${r.x},${r.y}`).toBe(r.from + r.rise);
    }
  });
});
