import { describe, expect, it } from 'vitest';
import { createCharacter } from '../src/sim/character';
import { DIALOGUES, type DialogueId } from '../src/sim/psyche/dialogues';
import { fameOf, greeting } from '../src/sim/psyche/fame';
import { emptyInput, Simulation, TICK, type SimEvent } from '../src/sim/sim';
import type { Enemy } from '../src/sim/world/entities';

/** Fase 4 do redesenho da Psique: o mundo lembra (fama por região, falas que notam, inimigos que reagem). */
type Internals = {
  hitEnemy: (e: Enemy, raw: number, o: { ignoreArmor: boolean; source: 'basic' | 'spell' }) => void;
  worldRng: { chance: (p: number) => boolean };
  distress: unknown;
};
const inner = (sim: Simulation) => sim as unknown as Internals;

const make = (region = 'vale', fame?: Record<string, number>) => {
  const c = createCharacter('Teste', 'vigor', 4);
  c.region = region;
  if (fame) c.fame[region] = fame;
  const sim = new Simulation(c, 5);
  for (const e of sim.enemies) if (!e.def.boss) Object.assign(e, { state: 'dead', respawnIn: Infinity });
  sim.traps = [];
  sim.worldEvents = false;
  return { c, sim };
};
const run = (sim: Simulation, seconds: number): SimEvent[] => {
  const out: SimEvent[] = [];
  for (let i = 0; i < seconds / TICK; i++) out.push(...sim.step(emptyInput()));
  return out;
};
const slinger = (sim: Simulation) => {
  const s = sim.enemies.find((e) => e.kind === 'slinger')!;
  Object.assign(s, { state: 'idle', hp: s.maxHp, respawnIn: 0 });
  sim.player.pos = { x: s.pos.x - 1, y: s.pos.y };
  return s;
};

describe('Fama', () => {
  it('só pega com pelo menos dois atos e à frente das outras', () => {
    expect(fameOf({ mercy: 1 })).toBeNull();
    expect(fameOf({ mercy: 2 })).toBe('mercy');
    expect(fameOf({ mercy: 2, ruthless: 2 })).toBeNull();
    expect(fameOf({ mercy: 3, ruthless: 2 })).toBe('mercy');
  });

  it('é por região: soltar o batedor em Varn dá fama de piedade lá, e o jogador fica sabendo', () => {
    const { c, sim } = make('varn');
    sim.answerDialogue('prisoner', 1);
    expect(sim.fameHere()).toBe('mercy');
    expect(sim.fameLabel()).toBe('conhecido pela piedade');
    expect(sim.fameLabel('vale')).toBeNull();
    const ev = sim.step(emptyInput());
    expect(ev.some((e) => e.t === 'fame' && e.region === 'varn')).toBe(true);
    expect(ev.some((e) => e.t === 'notice' && /conhecido pela piedade/.test(e.text))).toBe(true);
    expect(c.fame.vale).toBeUndefined();
  });

  it('o Guardião derrotado pela primeira vez é coragem no vale', () => {
    const { sim } = make();
    const boss = sim.boss()!;
    sim.player.pos = { x: boss.pos.x - 1, y: boss.pos.y };
    inner(sim).hitEnemy(boss, boss.maxHp * 5, { ignoreArmor: true, source: 'spell' });
    expect(sim.fameHere()).toBe('brave');
  });
});

describe('Inimigos reagem à fama', () => {
  const askedChance = (fame?: Record<string, number>) => {
    const { sim } = make('varn', fame);
    let asked = -1;
    inner(sim).worldRng.chance = (p: number) => {
      asked = p;
      return false;
    };
    const s = slinger(sim);
    s.hp = s.maxHp * 0.25;
    inner(sim).hitEnemy(s, s.maxHp * 0.1, { ignoreArmor: true, source: 'spell' });
    return asked;
  };

  it('com fama de piedade, os humanos se rendem mais', () => {
    expect(askedChance({ mercy: 2 })).toBeCloseTo(askedChance() + 0.25);
  });

  it('com fama de crueldade, ninguém se rende: alguns fogem cedo', () => {
    const { sim } = make('varn', { ruthless: 3 });
    inner(sim).worldRng.chance = () => true;
    const s = slinger(sim);
    s.hp = s.maxHp * 0.4;
    inner(sim).hitEnemy(s, s.maxHp * 0.1, { ignoreArmor: true, source: 'spell' });
    expect(s.state).toBe('return');
    expect(s.evading).toBe(true);
    expect(s.state).not.toBe('surrendered');
  });

  it('com fama de crueldade, humanos batem mais forte', () => {
    const hit = (fame?: Record<string, number>) => {
      const { sim } = make('varn', fame);
      const s = slinger(sim);
      const hp = sim.player.hp;
      sim.damagePlayer(40, { heavy: false, source: s });
      return hp - sim.player.hp;
    };
    const ratio = hit({ ruthless: 3 }) / hit();
    expect(ratio).toBeGreaterThan(1.1);
    expect(ratio).toBeLessThan(1.2);
  });

  it('com fama de crueldade, ninguém pede socorro', () => {
    const { sim } = make('vale', { ruthless: 3 });
    sim.worldEvents = true;
    inner(sim).worldRng.chance = () => true;
    sim.player.pos = { x: sim.map.sanctuary.x + sim.map.sanctuary.r + 15, y: sim.map.sanctuary.y };
    run(sim, 80);
    expect(inner(sim).distress).toBeNull();
  });
});

describe('Falas que notam você', () => {
  it('emoção forte vem antes da fama; sem nada a notar, ninguém fala', () => {
    const values = createCharacter('T', 'vigor', 1).psyche.values;
    expect(greeting('oren', { emotion: { id: 'fear', intensity: 0.8 }, fame: 'brave', values })).toMatch(/tremendo/);
    expect(greeting('oren', { emotion: { id: 'fear', intensity: 0.2 }, fame: 'brave', values })).toMatch(/Guardião caiu/);
    expect(greeting('traveler', { emotion: null, fame: 'greedy', values })).toMatch(/mãos são rápidas/);
    expect(greeting('oren', { emotion: null, fame: null, values: { ...values, mercy: -30 } })).toMatch(/pena de ninguém/);
    expect(greeting('oren', { emotion: null, fame: null, values })).toBeNull();
  });

  it('Oren comenta sua fama quando você passa perto, e não repete logo em seguida', () => {
    const { c, sim } = make('vale', { brave: 3 });
    c.dialogues = Object.keys(DIALOGUES) as DialogueId[];
    const oren = sim.map.npcs.find((n) => n.id === 'oren')!;
    sim.player.pos = { x: oren.x + 1.5, y: oren.y };
    const says = (ev: SimEvent[]) => ev.filter((e) => e.t === 'npcSay');
    const first = says(run(sim, 1));
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ npc: 'oren' });
    expect(says(run(sim, 30))).toHaveLength(0);
  });

  it('quem tem conversa nova não fala sozinho (o "!" já chama)', () => {
    const { sim } = make('vale', { brave: 3 });
    const oren = sim.map.npcs.find((n) => n.id === 'oren')!;
    expect(sim.dialogueFor('oren')).not.toBeNull();
    sim.player.pos = { x: oren.x + 1.5, y: oren.y };
    expect(run(sim, 1).filter((e) => e.t === 'npcSay' && e.npc === 'oren')).toHaveLength(0);
  });
});
