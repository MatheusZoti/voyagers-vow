import { describe, expect, it } from 'vitest';
import { BLOCKING, buildMap, floorAt, Tile, type GameMap } from '../src/sim/world/map';

/** Tiles alcançáveis a pé a partir do santuário (vizinhança de 4). */
function reachable(m: GameMap): Uint8Array {
  const seen = new Uint8Array(m.w * m.h);
  const q: number[] = [Math.floor(m.playerStart.y) * m.w + Math.floor(m.playerStart.x)];
  seen[q[0]!] = 1;
  while (q.length) {
    const i = q.pop()!;
    const x = i % m.w;
    const y = Math.floor(i / m.w);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
      const j = ny * m.w + nx;
      if (seen[j] || BLOCKING.has(m.tiles[j] as Tile)) continue;
      seen[j] = 1;
      q.push(j);
    }
  }
  return seen;
}

describe('Relevo', () => {
  const m = buildMap();
  const ok = reachable(m);
  const at = (x: number, y: number) => ok[Math.floor(y) * m.w + Math.floor(x)] === 1;

  it('tem penhascos de verdade (encostas que bloqueiam)', () => {
    let cliffs = 0;
    for (const t of m.tiles) if (t === Tile.Cliff) cliffs++;
    expect(cliffs).toBeGreaterThan(80);
  });

  it('tudo que importa é alcançável a pé a partir do santuário', () => {
    for (const s of m.spawns) expect(at(s.x + 0.5, s.y + 0.5), `spawn ${s.kind} ${s.x},${s.y}`).toBe(true);
    for (const n of m.npcs) expect(at(n.x, n.y), `npc ${n.id}`).toBe(true);
    for (const b of m.books) expect(at(b.x, b.y), `livro ${b.id}`).toBe(true);
    expect(at(m.arena.x, m.arena.y), 'arena').toBe(true);
    expect(at(m.bossSpawn.x, m.bossSpawn.y), 'chefe').toBe(true);
  });

  it('o rio corre num desfiladeiro e a ponte fica acima dele', () => {
    const b = m.bridge;
    const mid = (b.y0 + b.y1 + 1) / 2;
    expect(floorAt(m, b.x0 + 2.5, mid)).toBeGreaterThan(0);
    let water = -1;
    for (let x = 0; x < m.w; x++) if (m.tiles[5 * m.w + x] === Tile.Water) water = x;
    expect(floorAt(m, water + 0.5, 5.5)).toBeLessThan(-1.5);
  });
});
