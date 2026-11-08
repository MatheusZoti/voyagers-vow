import { describe, expect, it } from 'vitest';
import { createCharacter } from '../src/sim/character';
import { emptyInput, Simulation, TICK } from '../src/sim/sim';
import { BLOCKING, floorAt, isBlocked, Tile, type GameMap } from '../src/sim/world/map';
import { REGION_IDS, buildRegion } from '../src/sim/world/regions';

function reachable(m: GameMap): Uint8Array {
  const seen = new Uint8Array(m.w * m.h);
  const q = [Math.floor(m.playerStart.y) * m.w + Math.floor(m.playerStart.x)];
  seen[q[0]!] = 1;
  while (q.length) {
    const i = q.pop()!;
    const x = i % m.w;
    const y = (i / m.w) | 0;
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

describe.each(REGION_IDS)('Região %s', (id) => {
  const m = buildRegion(id);
  const ok = reachable(m);
  const at = (x: number, y: number) => ok[Math.floor(y) * m.w + Math.floor(x)] === 1;
  const walk = (x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h && !BLOCKING.has(m.tiles[y * m.w + x] as Tile);
  const fl = (x: number, y: number) => floorAt(m, x + 0.5, y + 0.5);

  it('tudo que importa é alcançável a pé, inclusive as saídas', () => {
    for (const s of m.spawns) expect(at(s.x + 0.5, s.y + 0.5), `spawn ${s.kind} ${s.x},${s.y}`).toBe(true);
    for (const n of m.npcs) expect(at(n.x, n.y), `npc ${n.id}`).toBe(true);
    for (const b of m.books) expect(at(b.x, b.y), `livro ${b.id}`).toBe(true);
    for (const e of m.exits) expect(at(e.x0 + 0.5, (e.y0 + e.y1) / 2 + 0.5), `saída para ${e.to}`).toBe(true);
    if (m.arena) expect(at(m.arena.x, m.arena.y), 'arena').toBe(true);
  });

  it('auditoria: ninguém anda em desfiladeiro nem sobe degrau grande', () => {
    const bad: string[] = [];
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        if (!walk(x, y)) continue;
        if (fl(x, y) < -0.3) bad.push(`fundo ${x},${y}`);
        for (const [dx, dy] of [
          [1, 0],
          [0, 1],
        ] as const)
          if (walk(x + dx, y + dy) && Math.abs(fl(x, y) - fl(x + dx, y + dy)) > 0.9) bad.push(`degrau ${x},${y}`);
      }
    expect(bad).toEqual([]);
  });

  it('pontos de interesse em chão caminhável', () => {
    const pts = [...m.traps, ...m.npcs, ...m.books, ...m.spawns.map((s) => ({ x: s.x + 0.5, y: s.y + 0.5 }))];
    expect(pts.filter((p) => isBlocked(m, p.x, p.y))).toEqual([]);
  });

  it('as saídas levam a um ponto caminhável da outra região', () => {
    for (const e of m.exits) {
      const other = buildRegion(e.to);
      expect(isBlocked(other, e.arrive.x, e.arrive.y), `chegada em ${e.to}`).toBe(false);
    }
  });
});

describe('Viagem e Planalto de Varn', () => {
  it('a passagem do Vale só abre depois do Guardião', () => {
    const c = createCharacter('Teste', 'vigor', 3);
    const sim = new Simulation(c, 5);
    const exit = sim.map.exits[0]!;
    sim.player.pos = { x: exit.x0 + 0.5, y: (exit.y0 + exit.y1) / 2 + 0.5 };
    const blocked = sim.step(emptyInput());
    expect(blocked.some((e) => e.t === 'travel')).toBe(false);
    c.bossDefeated = true;
    const sim2 = new Simulation(c, 5);
    sim2.player.pos = { x: exit.x0 + 0.5, y: (exit.y0 + exit.y1) / 2 + 0.5 };
    const ev = sim2.step(emptyInput());
    const travel = ev.find((e) => e.t === 'travel');
    expect(travel && travel.t === 'travel' && travel.to).toBe('varn');
  });

  it('Varn é tier 2: inimigos mais fortes e com Lançadores de Espinhos', () => {
    const c = createCharacter('Teste', 'vigor', 3);
    c.region = 'varn';
    const sim = new Simulation(c, 5);
    expect(sim.map.tier).toBe(2);
    const slingers = sim.enemies.filter((e) => e.kind === 'slinger');
    expect(slingers.length).toBeGreaterThanOrEqual(4);
    const g = sim.enemies.find((e) => e.kind === 'grunt')!;
    expect(g.maxHp).toBeGreaterThan(g.def.hp);
    expect(g.power).toBeGreaterThan(1);
    expect(sim.boss()).toBeUndefined();
  });

  it('o Lançador mantém distância, avisa e atira um projétil que dá para desviar', () => {
    const c = createCharacter('Teste', 'vigor', 3);
    c.region = 'varn';
    const sim = new Simulation(c, 5);
    const s = sim.enemies.find((e) => e.kind === 'slinger')!;
    for (const e of sim.enemies) if (e !== s) Object.assign(e, { state: 'dead', respawnIn: Infinity });
    // Jogador a 6 m, numa direção com linha de tiro livre.
    const free = (x: number, y: number) => {
      for (let k = 0; k <= 12; k++) if (isBlocked(sim.map, s.pos.x + ((x - s.pos.x) * k) / 12, s.pos.y + ((y - s.pos.y) * k) / 12)) return false;
      return true;
    };
    let spot = { x: s.pos.x - 6, y: s.pos.y };
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
      const c2 = { x: s.pos.x + Math.cos(a) * 6, y: s.pos.y + Math.sin(a) * 6 };
      if (free(c2.x, c2.y) && !isBlocked(sim.map, c2.x, c2.y + 2.5)) {
        spot = c2;
        break;
      }
    }
    sim.player.pos = spot;
    let telegraph = false;
    let shot = false;
    for (let i = 0; i < 4 / TICK && !shot; i++) {
      const ev = sim.step(emptyInput());
      telegraph ||= ev.some((e) => e.t === 'telegraphLine');
      shot ||= sim.projectiles.length > 0;
    }
    expect(telegraph).toBe(true);
    expect(shot).toBe(true);
    // Desviando de lado logo após o disparo, o projétil passa sem acertar.
    const pr = sim.projectiles[0]!;
    const side = { x: -pr.dir.y, y: pr.dir.x };
    const hp = sim.player.hp;
    for (let i = 0; i < 0.5 / TICK; i++) sim.step({ ...emptyInput(), move: side });
    expect(sim.player.hp).toBe(hp);
    // Se você chega perto (com linha de tiro), ele recua.
    sim.player.pos = { x: s.pos.x + (spot.x - s.pos.x) / 3, y: s.pos.y + (spot.y - s.pos.y) / 3 };
    const d0 = Math.hypot(s.pos.x - sim.player.pos.x, s.pos.y - sim.player.pos.y);
    for (let i = 0; i < 1 / TICK; i++) sim.step(emptyInput());
    expect(Math.hypot(s.pos.x - sim.player.pos.x, s.pos.y - sim.player.pos.y)).toBeGreaterThan(d0);
  });

  it('exploração é separada por região', () => {
    const c = createCharacter('Teste', 'vigor', 3);
    new Simulation(c, 5);
    c.region = 'varn';
    new Simulation(c, 5);
    expect(Object.keys(c.explored).sort()).toEqual(['vale', 'varn']);
  });
});
