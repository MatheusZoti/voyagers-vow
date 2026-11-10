import { describe, expect, it } from 'vitest';
import { createCharacter } from '../src/sim/character';
import type { Vec2 } from '../src/sim/math';
import { emptyInput, REGION, Simulation } from '../src/sim/sim';
import { Tile } from '../src/sim/world/map';

describe('Névoa de guerra', () => {
  it('começa explorando só em volta do santuário e salva o que foi visto', () => {
    const c = createCharacter('Teste', 'vigor', 3);
    const sim = new Simulation(c, 5);
    expect(sim.isExplored(sim.map.playerStart.x, sim.map.playerStart.y)).toBe(true);
    expect(sim.isExplored(sim.map.arena!.x, sim.map.arena!.y)).toBe(false);
    sim.player.pos = { ...sim.map.arena! };
    sim.step(emptyInput());
    expect(sim.isExplored(sim.map.arena!.x, sim.map.arena!.y)).toBe(true);
    // Persistência: um novo Simulation com o mesmo personagem lembra.
    expect(c.explored[REGION]).toBeTruthy();
    const again = new Simulation(c, 5);
    expect(again.isExplored(sim.map.arena!.x, sim.map.arena!.y)).toBe(true);
  });

  it('high ground: de cima se vê o andar de baixo, de baixo não se vê o de cima', () => {
    const sim = new Simulation(createCharacter('Teste', 'vigor', 3), 5);
    const m = sim.map;
    const { w, h, floors } = m;
    const walk = (x: number, y: number) => m.tiles[y * w + x] !== Tile.Cliff && m.tiles[y * w + x] !== Tile.Water && m.tiles[y * w + x] !== Tile.Ramp;
    // Procura um tile baixo e um alto, ambos de chão firme, a poucos tiles de distância e sem tile alto entre eles.
    let found: { lo: Vec2; hi: Vec2 } | null = null;
    for (let y = 2; y < h - 2 && !found; y++)
      for (let x = 2; x < w - 8 && !found; x++) {
        if (!walk(x, y) || floors[y * w + x] !== 0) continue;
        for (let k = 3; k <= 6; k++) {
          const hx = x + k;
          if (walk(hx, y) && floors[y * w + hx] === 1) {
            found = { lo: { x: x + 0.5, y: y + 0.5 }, hi: { x: hx + 0.5, y: y + 0.5 } };
            break;
          }
        }
      }
    expect(found).not.toBeNull();
    const { lo, hi } = found!;
    sim.player.pos = { ...lo };
    sim.step(emptyInput());
    expect(sim.isVisible(lo)).toBe(true);
    expect(sim.isVisible(hi)).toBe(false); // embaixo: o andar de cima fica na névoa
    sim.player.pos = { ...hi };
    sim.step(emptyInput());
    expect(sim.isVisible(hi)).toBe(true);
    expect(sim.isVisible(lo)).toBe(true); // em cima: enxerga para baixo
  });

  it('o Olhar enxerga mais longe', () => {
    const sim = new Simulation(createCharacter('Teste', 'vigor', 3), 5);
    const far = { x: sim.player.pos.x + 12, y: sim.player.pos.y };
    expect(sim.isVisible(far)).toBe(false);
    sim.step({ ...emptyInput(), posture: 'gaze' });
    expect(sim.isVisible(far)).toBe(true);
  });
});
