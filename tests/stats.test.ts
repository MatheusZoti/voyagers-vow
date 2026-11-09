import { describe, expect, it } from 'vitest';
import { createCharacter } from '../src/sim/character';
import { Simulation } from '../src/sim/sim';
import { computeStats, GUARD_CAP, tierLevels } from '../src/sim/stats';

describe('Atributos derivados', () => {
  it('nível 1: valores base', () => {
    const s = computeStats(createCharacter('Teste', 'vigor', 3));
    expect(s).toMatchObject({ hp: 100, flowMax: 100, flowRegen: 4, power: 1, guard: 0, speed: 5.2 });
  });

  it('o nível dá vida, fluxo e (por enquanto) poder', () => {
    const c = createCharacter('Teste', 'vigor', 3);
    c.level = 5;
    const s = computeStats(c);
    expect(s.hp).toBe(148);
    expect(s.flowMax).toBe(112);
    expect(s.power).toBeCloseTo(1.16);
  });

  it('cada número é a soma das suas origens (a ficha mostra a conta certa)', () => {
    const c = createCharacter('Teste', 'vigor', 3);
    c.level = 7;
    c.lifeCostLost = 10;
    for (const l of computeStats(c).lines) expect(l.parts.reduce((a, p) => a + p.value, 0), l.id).toBeCloseTo(l.value);
  });

  it('o Pacto de vida reduz a vida, mas nunca abaixo de 20', () => {
    const c = createCharacter('Teste', 'vigor', 3);
    c.lifeCostLost = 500;
    expect(computeStats(c).hp).toBe(20);
  });

  it('a simulação usa a ficha: a Guarda absorve dano, com teto', () => {
    const hit = (guard: number) => {
      const c = createCharacter('Teste', 'vigor', 3);
      const sim = new Simulation(c, 5);
      const base = sim.stats();
      sim.stats = () => ({ ...base, guard: Math.min(GUARD_CAP, guard) });
      sim.player.pos = { x: sim.map.sanctuary.x + sim.map.sanctuary.r + 6, y: sim.map.sanctuary.y };
      const hp = sim.player.hp;
      sim.damagePlayer(40, { heavy: false });
      return hp - sim.player.hp;
    };
    expect(hit(0)).toBe(40);
    expect(hit(0.5)).toBe(20);
    expect(hit(0.9)).toBe(hit(GUARD_CAP));
  });

  it('faixas de nível por tier se encostam (topo de uma = início da próxima)', () => {
    expect(tierLevels(1)).toEqual({ min: 1, max: 5 });
    expect(tierLevels(2)).toEqual({ min: 5, max: 9 });
    for (let t = 1; t < 8; t++) expect(tierLevels(t + 1).min).toBe(tierLevels(t).max);
  });
});
