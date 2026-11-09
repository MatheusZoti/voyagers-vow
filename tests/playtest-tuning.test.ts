import { describe, expect, it } from 'vitest';
import { createCharacter } from '../src/sim/character';
import { ITEM_DROP_CHANCE } from '../src/sim/items';
import { emptyInput, Simulation, TICK } from '../src/sim/sim';
import { isBlocked } from '../src/sim/world/map';

/** Ajustes do playtest de 09/11. */
const fresh = () => {
  const c = createCharacter('Teste', 'projection', 3);
  const sim = new Simulation(c, 5);
  for (const e of sim.enemies) if (!e.def.boss) Object.assign(e, { state: 'dead', respawnIn: Infinity });
  return { c, sim };
};

describe('Maré: manter custa', () => {
  it('fora do centro, o Fluxo não regenera (e escoa); no centro, volta a regenerar', () => {
    const { sim } = fresh();
    const p = sim.player;
    p.pos = { x: sim.map.sanctuary.x + sim.map.sanctuary.r + 6, y: sim.map.sanctuary.y };
    p.flow = 50;
    for (let i = 0; i < 1 / TICK; i++) sim.step({ ...emptyInput(), tideSteps: i === 0 ? 1 : 0 });
    expect(p.flow).toBeLessThan(50);
    const off = p.flow;
    for (let i = 0; i < 1 / TICK; i++) sim.step({ ...emptyInput(), tideSteps: i === 0 ? -1 : 0 });
    for (let i = 0; i < 1 / TICK; i++) sim.step(emptyInput());
    expect(p.flow).toBeGreaterThan(off + 2);
  });
});

describe('Guardião contra quem mantém distância', () => {
  const engage = (sim: Simulation, offset: { x: number; y: number }) => {
    const arena = sim.map.arena!;
    const boss = sim.boss()!;
    boss.pos = { x: arena.x, y: arena.y };
    sim.player.pos = { x: arena.x + offset.x, y: arena.y + offset.y };
    sim.player.lastCombatAt = sim.time;
    sim.player.bossEngaged = true;
    Object.assign(boss, { aggro: true, state: 'chase' });
    return boss;
  };

  it('longe do alcance do corpo a corpo, arremessa a pedra (pesada, telegrafada)', () => {
    const { sim } = fresh();
    const boss = engage(sim, { x: -8.5, y: 0 });
    let boulder = false;
    for (let i = 0; i < 4 / TICK && !boulder; i++) {
      sim.step(emptyInput());
      boulder = boss.state === 'windup' && boss.attack?.id === 'boulder';
    }
    expect(boulder).toBe(true);
    expect(boss.attack!.heavy).toBe(true);
  });

  it('a pedra mira à frente de quem anda de lado', () => {
    const { sim } = fresh();
    // Um ponto livre a ~11 m da arena, com espaço para andar de lado (leste).
    const arena = sim.map.arena!;
    let spot = { x: -11, y: 0 };
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 24) {
      const o = { x: Math.cos(a) * 11, y: Math.sin(a) * 11 };
      const free = [0, 1, 2, 3, 4].every((k) => !isBlocked(sim.map, arena.x + o.x + k, arena.y + o.y));
      if (free) {
        spot = o;
        break;
      }
    }
    const boss = engage(sim, spot);
    // A pedra só fica pronta depois que o jogador já está andando.
    boss.cooldowns = { boulder: 0.6, charge: 99, slam: 99, swipe: 99 };
    let target: { x: number; y: number } | null = null;
    let at: { x: number; y: number } | null = null;
    for (let i = 0; i < 6 / TICK && !target; i++) {
      sim.step({ ...emptyInput(), move: { x: 1, y: 0 } });
      if (boss.state === 'windup' && boss.attack?.id === 'boulder') {
        target = { ...boss.attackTarget };
        at = { ...sim.player.pos };
      }
    }
    expect(target).not.toBeNull();
    // O alvo fica bem à frente (no sentido do movimento), não onde o jogador estava.
    expect(target!.x - at!.x).toBeGreaterThan(2);
  });
});

describe('Tutorial da Maré perfeita', () => {
  it('avisa quando um golpe pesado vai cair em você — no máximo 3 vezes, e para depois da primeira Maré perfeita', () => {
    const { c, sim } = fresh();
    const boss = sim.boss()!;
    const arena = sim.map.arena!;
    let hints = 0;
    for (let round = 0; round < 6; round++) {
      boss.pos = { x: arena.x, y: arena.y };
      boss.cooldowns = {};
      Object.assign(boss, { aggro: true, state: 'chase' });
      sim.player.bossEngaged = true;
      sim.player.pos = { x: arena.x - 9, y: arena.y };
      sim.player.hp = sim.maxHp();
      for (let i = 0; i < 3 / TICK; i++) {
        const ev = sim.step(emptyInput());
        hints += ev.filter((e) => e.t === 'hint').length;
      }
    }
    expect(hints).toBe(3);
    expect(c.hints.tideShown).toBe(3);

    const { c: c2, sim: sim2 } = fresh();
    c2.hints.tideDone = 1;
    const b2 = sim2.boss()!;
    b2.pos = { x: arena.x, y: arena.y };
    sim2.player.pos = { x: arena.x - 9, y: arena.y };
    sim2.player.bossEngaged = true;
    Object.assign(b2, { aggro: true, state: 'chase' });
    let none = 0;
    for (let i = 0; i < 5 / TICK; i++) none += sim2.step(emptyInput()).filter((e) => e.t === 'hint').length;
    expect(none).toBe(0);
  });
});

describe('Ritmo', () => {
  it('itens caem menos (Carniçal ≤ 5%, Bruto ≤ 25%)', () => {
    expect(ITEM_DROP_CHANCE.grunt).toBeLessThanOrEqual(0.05);
    expect(ITEM_DROP_CHANCE.brute).toBeLessThanOrEqual(0.25);
    expect(ITEM_DROP_CHANCE.boss).toBe(1);
  });
});
