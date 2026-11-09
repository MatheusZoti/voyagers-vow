import { describe, expect, it } from 'vitest';
import { createCharacter, migrateCharacter } from '../src/sim/character';
import { DISTRESS, emptyInput, Simulation, SURRENDER, TICK, type SimEvent } from '../src/sim/sim';
import type { Enemy } from '../src/sim/world/entities';
import { buildRegion, regionData } from '../src/sim/world/regions';
import { formatMapJson, validateMap } from '../src/sim/world/terrain';

/** Fase 2 do redesenho da Psique: ações que moldam os Valores. */
type Internals = {
  hitEnemy: (e: Enemy, raw: number, o: { ignoreArmor: boolean; source: 'basic' | 'spell' }) => void;
  worldRng: { chance: (p: number) => boolean };
  distressTimer: number;
};
const internals = (sim: Simulation) => sim as unknown as Internals;

const varn = () => {
  const c = createCharacter('Teste', 'vigor', 3);
  c.region = 'varn';
  const sim = new Simulation(c, 5);
  internals(sim).worldRng.chance = () => true;
  return { c, sim };
};
const run = (sim: Simulation, seconds: number, move = { x: 0, y: 0 }): SimEvent[] => {
  const out: SimEvent[] = [];
  for (let i = 0; i < seconds / TICK; i++) out.push(...sim.step({ ...emptyInput(), move }));
  return out;
};
/** Leva um Lançador a menos de 22% de vida, com o jogador ao lado. */
const beatDown = (sim: Simulation) => {
  const s = sim.enemies.find((e) => e.kind === 'slinger')!;
  for (const e of sim.enemies) if (e !== s) Object.assign(e, { state: 'dead', respawnIn: Infinity });
  sim.player.pos = { x: s.pos.x - 1, y: s.pos.y };
  s.hp = s.maxHp * (SURRENDER.below + 0.05);
  internals(sim).hitEnemy(s, s.maxHp * 0.1, { ignoreArmor: true, source: 'spell' });
  return s;
};

describe('Rendição: poupar ou executar', () => {
  it('um humano perdendo se rende (e só humanos)', () => {
    const { sim } = varn();
    const s = beatDown(sim);
    expect(s.state).toBe('surrendered');
    const g = sim.enemies.find((e) => e.kind === 'grunt')!;
    Object.assign(g, { state: 'chase', hp: g.maxHp * 0.25 });
    internals(sim).hitEnemy(g, g.maxHp * 0.1, { ignoreArmor: true, source: 'spell' });
    expect(g.state).not.toBe('surrendered');
  });

  it('afastar-se poupa: Misericórdia ↑, ele foge (sem loot) e a história registra', () => {
    const { c, sim } = varn();
    const s = beatDown(sim);
    const mercy = c.psyche.values.mercy;
    sim.player.pos = { x: s.pos.x - SURRENDER.spareDist - 2, y: s.pos.y };
    const ev = run(sim, 0.2);
    expect(s.state).toBe('dead');
    expect(ev.some((e) => e.t === 'spared')).toBe(true);
    expect(c.psyche.values.mercy).toBe(mercy + 3);
    expect(c.shifts[0]!.cause).toBe('Poupou um Lançador de Espinhos rendido');
    expect(sim.itemDrops).toHaveLength(0);
  });

  it('golpear quem se rendeu executa: Vingança ↑ e Misericórdia ↓', () => {
    const { c, sim } = varn();
    const s = beatDown(sim);
    const before = { ...c.psyche.values };
    internals(sim).hitEnemy(s, 1, { ignoreArmor: false, source: 'basic' });
    expect(s.state).toBe('dead');
    expect(c.psyche.values.vengeance).toBe(before.vengeance + 3);
    expect(c.psyche.values.mercy).toBe(before.mercy - 2);
  });

  it('magias passam por quem se rendeu (só um golpe deliberado executa)', () => {
    const { sim } = varn();
    const s = beatDown(sim);
    const hp = s.hp;
    internals(sim).hitEnemy(s, 50, { ignoreArmor: true, source: 'spell' });
    expect(s.state).toBe('surrendered');
    expect(s.hp).toBe(hp);
  });
});

describe('Algoz', () => {
  it('quem te derruba fica marcado, mesmo depois de sair do jogo; vencê-lo dá Vingança', () => {
    const c = createCharacter('Teste', 'vigor', 3);
    const sim = new Simulation(c, 5);
    const g = sim.enemies.find((e) => e.kind === 'grunt')!;
    for (const e of sim.enemies) if (e !== g) Object.assign(e, { state: 'dead', respawnIn: Infinity });
    sim.player.pos = { x: g.pos.x - 1, y: g.pos.y };
    Object.assign(g, { aggro: true, state: 'chase' });
    sim.damagePlayer(99999, { heavy: false, source: g });
    expect(c.nemesis).toMatchObject({ region: 'vale', kind: 'grunt' });
    expect(g.nemesis).toBe(true);

    const back = new Simulation(migrateCharacter(JSON.parse(JSON.stringify(c)))!, 5);
    const again = back.enemies.find((e) => e.nemesis)!;
    expect(again.kind).toBe('grunt');
    const v = back.c.psyche.values.vengeance;
    back.player.pos = { x: again.pos.x - 1, y: again.pos.y };
    again.hp = 1;
    internals(back).hitEnemy(again, 50, { ignoreArmor: true, source: 'basic' });
    const ev = back.step(emptyInput());
    expect(back.c.psyche.values.vengeance).toBe(v + 5);
    expect(back.c.nemesis).toBeNull();
    expect(ev.some((e) => e.t === 'whisper')).toBe(true);
  });
});

describe('Viajante em apuros', () => {
  const setup = () => {
    const c = createCharacter('Teste', 'vigor', 3);
    const sim = new Simulation(c, 5);
    for (const e of sim.enemies) Object.assign(e, { state: 'dead', respawnIn: Infinity });
    sim.traps = [];
    internals(sim).worldRng.chance = () => true;
    internals(sim).distressTimer = DISTRESS.afterS;
    sim.player.pos = { x: sim.map.sanctuary.x + sim.map.sanctuary.r + 3, y: sim.map.sanctuary.y };
    sim.step(emptyInput());
    return { c, sim };
  };

  it('aparece na trilha com dois Carniçais; salvar dá Misericórdia e Lealdade', () => {
    const { c, sim } = setup();
    const d = sim.distress!;
    expect(d).not.toBeNull();
    expect(d.guards).toHaveLength(2);
    const before = { ...c.psyche.values };
    sim.player.pos = { x: d.pos.x - 2, y: d.pos.y };
    sim.step(emptyInput());
    expect(d.state).toBe('noticed');
    for (const id of d.guards) Object.assign(sim.enemies.find((e) => e.id === id)!, { state: 'dead', respawnIn: Infinity });
    sim.step(emptyInput());
    expect(d.state).toBe('saved');
    expect(c.psyche.values.mercy).toBe(before.mercy + 3);
    expect(c.psyche.values.loyalty).toBe(before.loyalty + 2);
  });

  it('deixá-lo para trás dá Liberdade', () => {
    const { c, sim } = setup();
    const d = sim.distress!;
    sim.player.pos = { x: d.pos.x - 2, y: d.pos.y };
    sim.step(emptyInput());
    const free = c.psyche.values.freedom;
    // Bem longe (mais que DISTRESS.leaveDist), do lado que tem espaço.
    sim.player.pos = { x: d.pos.x > sim.map.w / 2 ? d.pos.x - DISTRESS.leaveDist - 2 : d.pos.x + DISTRESS.leaveDist + 2, y: d.pos.y };
    run(sim, DISTRESS.leaveS + 1);
    expect(d.state).toBe('lost');
    expect(c.psyche.values.freedom).toBe(free + 2);
  });

  it('o bot de balanceamento pode desligar os eventos de mundo', () => {
    const c = createCharacter('Teste', 'vigor', 3);
    const sim = new Simulation(c, 5);
    sim.worldEvents = false;
    internals(sim).distressTimer = DISTRESS.afterS + 1;
    sim.step(emptyInput());
    expect(sim.distress).toBeNull();
  });
});

describe('Altares e outras ações', () => {
  it('pegar as moedas: Poder ↑, Lei ↓ e um item; o altar não decide de novo', () => {
    const c = createCharacter('Teste', 'vigor', 3);
    const sim = new Simulation(c, 5);
    const s = sim.map.shrines[0]!;
    sim.player.pos = { x: s.x + 1, y: s.y };
    expect(sim.actShrine(s.id, 'take')).toMatch(/ouro/);
    expect(c.psyche.values.power).toBe(2);
    expect(c.psyche.values.law).toBe(-3);
    expect(c.bag).toHaveLength(1);
    // Um ato deliberado sussurra na hora.
    const w = sim.step(emptyInput()).find((e) => e.t === 'whisper');
    expect(w && w.t === 'whisper' && w.items.map((i) => i.text)).toContain('A Lei perde força em você.');
    expect(sim.actShrine(s.id, 'leave')).toBeNull();
  });

  it('deixar as moedas: Lei ↑', () => {
    const c = createCharacter('Teste', 'vigor', 3);
    const sim = new Simulation(c, 5);
    const s = sim.map.shrines[0]!;
    sim.player.pos = { x: s.x + 1, y: s.y };
    sim.actShrine(s.id, 'leave');
    expect(c.psyche.values.law).toBe(3);
    expect(c.shrines[s.id]).toBe('left');
  });

  it('ler um livro antigo dá Conhecimento', () => {
    const c = createCharacter('Teste', 'vigor', 3);
    const sim = new Simulation(c, 5);
    const b = sim.map.books[0]!;
    sim.player.pos = { x: b.x, y: b.y };
    sim.step(emptyInput());
    expect(c.psyche.values.knowledge).toBe(2);
  });

  it('cada região tem um altar alcançável, e o arquivo do mapa guarda os altares', () => {
    for (const id of ['vale', 'varn']) {
      expect(buildRegion(id).shrines.length).toBeGreaterThan(0);
      const d = regionData(id);
      expect(validateMap(d).filter((i) => i.level === 'erro')).toEqual([]);
      expect(formatMapJson(d)).toContain('"shrines"');
    }
  });
});
