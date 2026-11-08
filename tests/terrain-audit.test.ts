import { describe, expect, it } from 'vitest';
import { BLOCKING, BRIDGE_DECK, floorAt, isBlocked, Tile } from '../src/sim/world/map';
import { buildRegion } from '../src/sim/world/regions';

/** Auditoria do relevo: procura lugares onde o chão e a colisão discordam. */
describe('Auditoria do terreno', () => {
  const m = buildRegion('vale');
  const walk = (x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h && !BLOCKING.has(m.tiles[y * m.w + x] as Tile);
  const fl = (x: number, y: number) => floorAt(m, x + 0.5, y + 0.5);

  it('ninguém anda dentro do desfiladeiro', () => {
    const bad: string[] = [];
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (walk(x, y) && fl(x, y) < -0.3) bad.push(`${x},${y}:${fl(x, y).toFixed(2)}`);
    expect(bad).toEqual([]);
  });

  it('não há degrau grande entre dois tiles caminháveis vizinhos (subir penhasco andando)', () => {
    const bad: string[] = [];
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        if (!walk(x, y)) continue;
        for (const [dx, dy] of [
          [1, 0],
          [0, 1],
        ] as const) {
          if (!walk(x + dx, y + dy)) continue;
          const d = Math.abs(fl(x, y) - fl(x + dx, y + dy));
          if (d > 0.9) bad.push(`${x},${y}->${x + dx},${y + dy}:${d.toFixed(2)}`);
        }
      }
    expect(bad).toEqual([]);
  });

  it('armadilhas, NPCs, livros e spawns ficam em chão caminhável', () => {
    const pts = [
      ...m.traps.map((t) => ({ n: 'trap', ...t })),
      ...m.npcs.map((n) => ({ n: n.id, x: n.x, y: n.y })),
      ...m.books.map((b) => ({ n: b.id, x: b.x, y: b.y })),
      ...m.spawns.map((s) => ({ n: s.kind, x: s.x + 0.5, y: s.y + 0.5 })),
    ];
    const bad = pts.filter((p) => isBlocked(m, p.x, p.y)).map((p) => `${p.n}@${p.x},${p.y}`);
    expect(bad).toEqual([]);
  });

  it('a ponte é contínua de margem a margem, sobre o desfiladeiro', () => {
    const b = m.bridge!;
    for (let y = b.y0; y <= b.y1; y++) {
      expect(walk(b.x0 - 1, y) || walk(b.x0 - 1, y + 1) || walk(b.x0 - 1, y - 1), `margem oeste ${y}`).toBe(true);
      for (let x = b.x0; x <= b.x1; x++) expect(floorAt(m, x + 0.5, y + 0.5)).toBe(BRIDGE_DECK);
    }
  });
});
