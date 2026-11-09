import { describe, expect, it } from 'vitest';
import { createCharacter } from '../src/sim/character';
import { DIALOGUES, type DialogueId } from '../src/sim/psyche/dialogues';
import { greeting } from '../src/sim/psyche/greetings';
import { emptyInput, Simulation, TICK, type SimEvent } from '../src/sim/sim';
import type { Enemy } from '../src/sim/world/entities';

/** O mundo nota quem você é: Valores fortes mudam falas de NPCs e reações de inimigos. */
type Internals = {
  hitEnemy: (e: Enemy, raw: number, o: { ignoreArmor: boolean; source: 'basic' | 'spell' }) => void;
  worldRng: { chance: (p: number) => boolean };
  distress: unknown;
};
const inner = (sim: Simulation) => sim as unknown as Internals;

const make = (region = 'vale', values?: Partial<Record<'mercy' | 'law' | 'power', number>>) => {
  const c = createCharacter('Teste', 'vigor', 4);
  c.region = region;
  if (values) Object.assign(c.psyche.values, values);
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

describe('Inimigos reagem à Misericórdia', () => {
  const askedChance = (values?: { mercy: number }) => {
    const { sim } = make('varn', values);
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

  it('com Misericórdia forte, os humanos se rendem mais', () => {
    expect(askedChance({ mercy: 30 })).toBeCloseTo(askedChance() + 0.25);
  });

  it('quem despreza a Misericórdia não recebe rendição: alguns fogem cedo', () => {
    const { sim } = make('varn', { mercy: -30 });
    inner(sim).worldRng.chance = () => true;
    const s = slinger(sim);
    s.hp = s.maxHp * 0.4;
    inner(sim).hitEnemy(s, s.maxHp * 0.1, { ignoreArmor: true, source: 'spell' });
    expect(s.state).toBe('return');
    expect(s.evading).toBe(true);
    expect(s.state).not.toBe('surrendered');
  });

  it('quem despreza a Misericórdia apanha mais forte de humanos', () => {
    const hit = (values?: { mercy: number }) => {
      const { sim } = make('varn', values);
      const s = slinger(sim);
      const hp = sim.player.hp;
      sim.damagePlayer(40, { heavy: false, source: s });
      return hp - sim.player.hp;
    };
    const ratio = hit({ mercy: -30 }) / hit();
    expect(ratio).toBeGreaterThan(1.1);
    expect(ratio).toBeLessThan(1.2);
  });

  it('quem despreza a Misericórdia não recebe pedido de socorro', () => {
    const { sim } = make('vale', { mercy: -30 });
    sim.worldEvents = true;
    inner(sim).worldRng.chance = () => true;
    sim.player.pos = { x: sim.map.sanctuary.x + sim.map.sanctuary.r + 15, y: sim.map.sanctuary.y };
    run(sim, 80);
    expect(inner(sim).distress).toBeNull();
  });
});

describe('Falas que notam você', () => {
  it('emoção forte vem antes do Valor; sem nada a notar, ninguém fala', () => {
    const values = createCharacter('T', 'vigor', 1).psyche.values;
    const merciful = { ...values, mercy: 30 };
    expect(greeting('oren', { emotion: { id: 'fear', intensity: 0.8 }, values: merciful })).toMatch(/tremendo/);
    expect(greeting('oren', { emotion: { id: 'fear', intensity: 0.2 }, values: merciful })).toMatch(/poupa quem se rende/);
    expect(greeting('traveler', { emotion: null, values: merciful })).toMatch(/coração mole/);
    expect(greeting('traveler', { emotion: null, values: { ...values, mercy: -30 } })).toMatch(/pena de ninguém/);
    expect(greeting('oren', { emotion: null, values })).toBeNull();
  });

  it('Oren comenta seu Valor mais forte quando você passa perto, e não repete logo em seguida', () => {
    const { c, sim } = make('vale', { mercy: 30 });
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
    const { sim } = make('vale', { mercy: 30 });
    const oren = sim.map.npcs.find((n) => n.id === 'oren')!;
    expect(sim.dialogueFor('oren')).not.toBeNull();
    sim.player.pos = { x: oren.x + 1.5, y: oren.y };
    expect(run(sim, 1).filter((e) => e.t === 'npcSay' && e.npc === 'oren')).toHaveLength(0);
  });
});
