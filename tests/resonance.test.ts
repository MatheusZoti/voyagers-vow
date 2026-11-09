import { describe, expect, it } from 'vitest';
import { createCharacter } from '../src/sim/character';
import { ITEMS, RESONANCE_VALUES, resonanceState, rollItem, type Item } from '../src/sim/items';
import { Rng } from '../src/sim/math';
import { emptyInput, Simulation, TICK } from '../src/sim/sim';
import { computeStats } from '../src/sim/stats';

/** Peitoral Comum (sem afixos) que pede um Valor. */
const vest = (uid: number, value: Item['resonance']): Item => ({ ...rollItem(new Rng(uid), 'padded', uid, 1), affixes: [], resonance: value });

describe('Ressonância dos itens com a Psique', () => {
  it('só itens raros nascem com Valor: Obra-prima sempre, Primoroso às vezes, os outros nunca', () => {
    const rng = new Rng(11);
    const count = (q: number) => Array.from({ length: 400 }, (_, i) => rollItem(rng, 'padded', i, q)).filter((it) => it.resonance).length;
    expect(count(5)).toBe(400);
    expect(count(4)).toBeGreaterThan(120);
    expect(count(4)).toBeLessThan(280);
    for (const q of [1, 2, 3]) expect(count(q)).toBe(0);
  });

  it('o Valor combina com o espaço do item', () => {
    const rng = new Rng(3);
    for (const id of Object.keys(ITEMS)) {
      const it = rollItem(rng, id, 1, 5);
      expect(RESONANCE_VALUES[ITEMS[id]!.slot]).toContain(it.resonance);
    }
  });

  it('defender o Valor: o item rende +25%; ser contra: −25%; neutro: normal', () => {
    const c = createCharacter('Teste', 'vigor', 3);
    c.equipment.chest = vest(1, 'mercy');
    const guard = () => computeStats(c).guard;
    c.psyche.values.mercy = 0;
    expect(guard()).toBeCloseTo(0.08);
    c.psyche.values.mercy = 40;
    expect(resonanceState(c.equipment.chest, c.psyche.values)).toBe('aligned');
    expect(guard()).toBeCloseTo(0.1);
    c.psyche.values.mercy = -40;
    expect(guard()).toBeCloseTo(0.06);
  });

  it('a ficha mostra a Ressonância como origem (e a conta continua batendo)', () => {
    const c = createCharacter('Teste', 'vigor', 3);
    c.equipment.chest = vest(1, 'law');
    c.psyche.values.law = 50;
    const line = computeStats(c).lines.find((l) => l.id === 'guard')!;
    expect(line.parts.some((p) => p.source === 'Ressonância (Lei)')).toBe(true);
    expect(line.parts.reduce((a, p) => a + p.value, 0)).toBeCloseTo(line.value);
  });

  it('a simulação acompanha quando os Valores mudam durante o jogo', () => {
    const c = createCharacter('Teste', 'vigor', 3);
    c.equipment.chest = vest(1, 'loyalty');
    const sim = new Simulation(c, 5);
    expect(sim.stats().guard).toBeCloseTo(0.08);
    c.psyche.values.loyalty = 30;
    expect(sim.stats().guard).toBeCloseTo(0.1);
  });

  it('lutar vestindo algo dissonante soma estresse; fora de combate, não', () => {
    const run = (value: number, fighting: boolean) => {
      const c = createCharacter('Teste', 'vigor', 3);
      c.equipment.chest = vest(1, 'vengeance');
      c.psyche.values.vengeance = value;
      const sim = new Simulation(c, 5);
      for (const e of sim.enemies) Object.assign(e, { state: 'dead', respawnIn: Infinity });
      sim.player.pos = { x: sim.map.sanctuary.x + sim.map.sanctuary.r + 6, y: sim.map.sanctuary.y };
      c.psyche.stress = 0;
      for (let i = 0; i < 10 / TICK; i++) {
        if (fighting) sim.player.lastCombatAt = sim.time;
        sim.step(emptyInput());
      }
      return c.psyche.stress;
    };
    const dissonant = run(-50, true);
    expect(dissonant).toBeGreaterThan(run(0, true) + 1);
    expect(dissonant).toBeGreaterThan(run(50, true) + 1);
    expect(run(-50, false)).toBeLessThan(dissonant - 1);
  });

  it('vestir avisa se o item ressoa ou é dissonante', () => {
    const c = createCharacter('Teste', 'vigor', 3);
    c.psyche.values.nature = -60;
    const sim = new Simulation(c, 5);
    const it = vest(c.nextItemUid++, 'nature');
    c.bag.push(it);
    expect(sim.equipItem(it.uid)).toBeNull();
    const ev = sim.step(emptyInput());
    expect(ev.some((e) => e.t === 'notice' && /Dissonante/.test(e.text))).toBe(true);
  });
});
