import { describe, expect, it } from 'vitest';
import { createCharacter, type Character } from '../src/sim/character';
import { emptyInput, Simulation, TICK, type SimEvent } from '../src/sim/sim';
import type { Enemy } from '../src/sim/world/entities';

/** Fase 3 do redesenho da Psique: conversas viram situações com consequência e eco. */
type Internals = {
  hitEnemy: (e: Enemy, raw: number, o: { ignoreArmor: boolean; source: 'basic' | 'spell' }) => void;
  worldRng: { chance: (p: number) => boolean; range: (a: number, b: number) => number; pick: <T>(a: readonly T[]) => T };
};
const inner = (sim: Simulation) => sim as unknown as Internals;

const make = (seed = 4, region = 'vale') => {
  const c = createCharacter('Teste', 'vigor', seed);
  c.region = region;
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
const outsideSafe = (sim: Simulation) => ({ x: sim.map.sanctuary.x + sim.map.sanctuary.r + 15, y: sim.map.sanctuary.y });
const notices = (ev: SimEvent[]) => ev.filter((e) => e.t === 'notice').map((e) => (e.t === 'notice' ? e.text : ''));

describe('Viajante ferido', () => {
  it('escoltado, ele vai para o santuário; honesto, deixa um presente lá depois', () => {
    const { c, sim } = make(4);
    sim.answerDialogue('stranger', 0);
    const t = sim.map.npcs.find((n) => n.id === 'traveler')!;
    expect(Math.hypot(t.x - sim.map.sanctuary.x, t.y - sim.map.sanctuary.y)).toBeLessThan(sim.map.sanctuary.r);
    sim.player.pos = { ...sim.map.playerStart };
    run(sim, 61);
    expect(c.flags.strangerDone).toBe(1);
    expect(c.bag.length).toBe(1);
  });

  it('escoltado e desonesto: emboscada na trilha, e ele some', () => {
    const { c, sim } = make(3);
    sim.answerDialogue('stranger', 0);
    sim.player.pos = { ...sim.map.playerStart };
    run(sim, 61);
    const before = sim.enemies.filter((e) => e.summoned && e.state !== 'dead').length;
    sim.player.pos = outsideSafe(sim);
    const ev = run(sim, 0.2);
    expect(notices(ev).some((n) => /armadilha/.test(n))).toBe(true);
    expect(sim.enemies.filter((e) => e.summoned && e.state !== 'dead').length).toBe(before + 2);
    expect(sim.map.npcs.some((n) => n.id === 'traveler')).toBe(false);
    expect(c.flags['gone:traveler']).toBe(1);
  });

  it('vigiado e desonesto: a tentativa falha, sem emboscada', () => {
    const { sim } = make(3);
    sim.answerDialogue('stranger', 1);
    sim.player.pos = outsideSafe(sim);
    const ev = run(sim, 31);
    expect(notices(ev).some((n) => /estava de olho/.test(n))).toBe(true);
    expect(sim.enemies.filter((e) => e.summoned && e.state !== 'dead')).toHaveLength(0);
  });
});

describe('Oren: o treino vira tarefa', () => {
  it('cinco Marés para a defesa concluem o treino', () => {
    const { c, sim } = make();
    sim.answerDialogue('exercise', 0);
    for (let i = 0; i < 5; i++) {
      sim.step({ ...emptyInput(), tideSteps: -1 });
      run(sim, 0.3);
      sim.step({ ...emptyInput(), tideSteps: 1 });
      run(sim, 0.3);
    }
    expect(c.flags.exercise).toBe('done');
    expect(sim.idleLine('oren')).toMatch(/corpo lembra/);
  });
});

describe('Duelo com Kael', () => {
  const duel = (option: number) => {
    const { c, sim } = make();
    sim.answerDialogue('rival', 0);
    sim.answerDialogue('tournament', option);
    const kael = sim.enemies.find((e) => e.kind === 'kael');
    return { c, sim, kael };
  };

  it('luta limpa: Kael aparece na trilha e o duelo acaba antes de alguém morrer (vitória)', () => {
    const { c, sim, kael } = duel(2);
    expect(kael).toBeDefined();
    expect(sim.map.npcs.some((n) => n.id === 'kael')).toBe(false);
    sim.player.pos = { x: kael!.pos.x - 1, y: kael!.pos.y };
    inner(sim).hitEnemy(kael!, kael!.maxHp * 2, { ignoreArmor: true, source: 'basic' });
    expect(kael!.state).toBe('dead');
    expect(sim.duel).toBeNull();
    expect(c.flags.duelResult).toBe('won');
    expect(sim.map.npcs.some((n) => n.id === 'kael')).toBe(true);
  });

  it('derrota não mata: a vida para em 15% e Kael ri', () => {
    const { c, sim, kael } = duel(0);
    sim.player.pos = { x: kael!.pos.x - 1, y: kael!.pos.y };
    sim.damagePlayer(99999, { heavy: false, source: kael! });
    expect(sim.player.dead).toBe(false);
    expect(sim.player.hp).toBeGreaterThan(0);
    expect(c.flags.duelResult).toBe('lost');
    expect(c.flags.duelCheat).toBe(1);
  });

  it('contar a Oren cancela o duelo e Kael fica hostil', () => {
    const { c, sim, kael } = duel(1);
    expect(kael).toBeUndefined();
    expect(c.flags.kael).toBe('hostile');
    expect(sim.idleLine('kael')).toMatch(/Dedo-duro/);
  });
});

describe('Juramento ao Senhor de Varn', () => {
  it('jurar dá uma arma na hora; poupar o prisioneiro depois quebra o juramento', () => {
    const { c, sim } = make();
    sim.answerDialogue('herald', 0);
    expect(c.bag.map((i) => i.def)).toContain('huntKnife');
    c.region = 'varn';
    const varn = new Simulation(c, 5);
    expect(varn.dialogueText('prisoner')).toMatch(/prisioneiros dos Lançadores morrem/);
    const loyalty = c.psyche.values.loyalty;
    varn.answerDialogue('prisoner', 1);
    expect(c.flags.oath).toBe('broken');
    expect(c.psyche.values.loyalty).toBeLessThan(loyalty);
  });

  it('recusar: os homens do Senhor te emboscam em Varn', () => {
    const c = createCharacter('Teste', 'vigor', 4);
    const vale = new Simulation(c, 5);
    vale.answerDialogue('herald', 1);
    c.region = 'varn';
    const sim = new Simulation(c, 5);
    for (const e of sim.enemies) Object.assign(e, { state: 'dead', respawnIn: Infinity });
    sim.traps = [];
    sim.worldEvents = false;
    sim.player.pos = outsideSafe(sim);
    const ev = run(sim, 21);
    expect(notices(ev).some((n) => /lembra do seu rosto/.test(n))).toBe(true);
    expect(sim.enemies.filter((e) => e.kind === 'slinger' && e.summoned && e.state !== 'dead')).toHaveLength(2);
  });
});

describe('Raposa, ponte, batedor e altar', () => {
  const engage = (c: Character) => {
    const sim = new Simulation(c, 5);
    for (const e of sim.enemies) if (!e.def.boss) Object.assign(e, { state: 'dead', respawnIn: Infinity });
    sim.traps = [];
    sim.worldEvents = false;
    const boss = sim.boss()!;
    sim.player.pos = { x: sim.map.arena!.x - 2, y: sim.map.arena!.y };
    sim.step(emptyInput());
    return { sim, boss };
  };

  it('a raposa cuidada salta no Guardião e o distrai', () => {
    const c = createCharacter('Teste', 'vigor', 4);
    new Simulation(c, 5).answerDialogue('animal', 0);
    const { boss } = engage(c);
    expect(boss.state).toBe('stunned');
    expect(c.flags.foxHelped).toBe(1);
  });

  it('seguir as pegadas: o Guardião leva mais dano; ficar com a raposa dá um amuleto', () => {
    const a = createCharacter('Teste', 'vigor', 4);
    const b = createCharacter('Teste', 'vigor', 4);
    new Simulation(a, 5).answerDialogue('animal', 2);
    const simB = new Simulation(b, 5);
    simB.answerDialogue('animal', 1);
    expect(b.bag.map((i) => i.def)).toContain('stoneAmulet');
    const dmg = (c: Character) => {
      const { sim, boss } = engage(c);
      const hp = boss.hp;
      inner(sim).hitEnemy(boss, 100, { ignoreArmor: true, source: 'spell' });
      return hp - boss.hp;
    };
    expect(dmg(a)).toBeGreaterThan(dmg(createCharacter('Teste', 'vigor', 4)) * 1.1);
  });

  it('observar da ponte deixa os golpes do Guardião mais lentos (até vencê-lo)', () => {
    const windup = (observe: boolean) => {
      const c = createCharacter('Teste', 'vigor', 4);
      if (observe) new Simulation(c, 5).answerDialogue('bridge', 1);
      const { sim, boss } = engage(c);
      for (let i = 0; i < 6 / TICK && boss.state !== 'windup'; i++) sim.step(emptyInput());
      return boss.windupTotal / (boss.attack?.windup ?? 1);
    };
    expect(windup(true)).toBeCloseTo(windup(false) * 1.2, 1);
  });

  it('executar o batedor: os Lançadores nunca mais se rendem; soltá-lo: rendem-se mais', () => {
    const chanceUsed = (choice: number) => {
      const c = createCharacter('Teste', 'vigor', 4);
      c.region = 'varn';
      const sim = new Simulation(c, 5);
      sim.answerDialogue('prisoner', choice);
      let asked = -1;
      inner(sim).worldRng.chance = (p: number) => {
        asked = p;
        return false;
      };
      const s = sim.enemies.find((e) => e.kind === 'slinger')!;
      sim.player.pos = { x: s.pos.x - 1, y: s.pos.y };
      s.hp = s.maxHp * 0.25;
      inner(sim).hitEnemy(s, s.maxHp * 0.1, { ignoreArmor: true, source: 'spell' });
      return asked;
    };
    // Executar: os Lançadores lembram e não se rendem mais.
    expect(chanceUsed(0)).toBe(0);
    // Soltar: o batedor conta aos outros; rendem-se bem mais (0,8).
    expect(chanceUsed(1)).toBe(0.8);
  });

  it('prometer a Ilsa deixar o altar e pegar as moedas é quebrar a palavra', () => {
    const { c, sim } = make();
    sim.answerDialogue('temple', 0);
    const s = sim.map.shrines[0]!;
    sim.player.pos = { x: s.x + 1, y: s.y };
    const law = c.psyche.values.law;
    sim.actShrine(s.id, 'take');
    expect(c.psyche.values.law).toBe(law - 6);
    expect(sim.idleLine('pilgrim')).toMatch(/Você me disse que deixaria/);
  });

  it('avisos de uma escolha feita no painel chegam ao jogador', () => {
    const { sim } = make();
    sim.answerDialogue('herald', 0);
    expect(notices(sim.step(emptyInput())).some((n) => /arauto entrega/.test(n))).toBe(true);
  });
});
