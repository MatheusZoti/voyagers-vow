import { describe, expect, it } from 'vitest';
import { createCharacter, migrateCharacter } from '../src/sim/character';
import { DIALOGUES } from '../src/sim/psyche/dialogues';
import { VALUE_IDS } from '../src/sim/psyche/values';
import { emptyInput, Simulation, TICK, type SimEvent } from '../src/sim/sim';
import { SPELL_IDS, SPELLS, STARTER_SPELLS, type SpellId } from '../src/sim/techniques';
import type { Affinity } from '../src/sim/flow/affinity';
import type { Enemy } from '../src/sim/world/entities';

/** Personagem da afinidade da magia, com ela no Elo 1, diante de um Carniçal. */
function castOn(spell: SpellId, kind: Enemy['kind'] = 'grunt') {
  const aff = SPELLS[spell].affinity as Affinity;
  const c = createCharacter('Teste', aff, 11);
  c.knownSpells = [...SPELL_IDS];
  c.elos[0]!.technique = spell;
  c.elos[1]!.technique = null;
  const sim = new Simulation(c, 5);
  const target = sim.enemies.find((e) => e.kind === kind)!;
  sim.player.pos = { x: target.pos.x - 2, y: target.pos.y };
  const input = emptyInput();
  input.aim = { ...target.pos };
  input.useSlot = 1;
  const events: SimEvent[] = [...sim.step(input)];
  for (let i = 0; i < 25; i++) events.push(...sim.step({ ...emptyInput(), aim: { ...target.pos } }));
  return { sim, target, events };
}

describe('Catálogo de magias', () => {
  it('80 magias: 16 por afinidade, duas em cada nível de 1 a 8, cada uma com um papel', () => {
    expect(SPELL_IDS).toHaveLength(80);
    expect(new Set(SPELL_IDS.map((id) => SPELLS[id].name)).size).toBe(80);
    for (const aff of ['vigor', 'mutation', 'forge', 'dominion', 'projection'] as const) {
      expect(SPELL_IDS.filter((id) => SPELLS[id].affinity === aff)).toHaveLength(16);
      for (let lvl = 1; lvl <= 8; lvl++) expect(SPELL_IDS.filter((id) => SPELLS[id].affinity === aff && SPELLS[id].minLevel === lvl), `${aff} nível ${lvl}`).toHaveLength(2);
      for (const id of STARTER_SPELLS[aff]) expect(SPELLS[id].affinity).toBe(aff);
    }
    for (const id of SPELL_IDS) expect(SPELLS[id].role.length).toBeGreaterThan(0);
  });

  it.each(['votePunch', 'flowLance', 'orbRain', 'elasticPull', 'discharge', 'chains', 'conjuredBlade', 'repel'] as const)(
    '%s acerta o alvo à frente',
    (spell) => {
      const { target, events } = castOn(spell);
      expect(events.some((e) => e.t === 'damage' && e.target === 'enemy' && e.id === target.id && e.amount > 0)).toBe(true);
    },
  );

  it('cada magia tem os números que a sua forma pede (o Grimório mostra todos)', () => {
    const need: Record<string, string[]> = {
      dash: ['pierceEvery'],
      charge: ['chargeS', 'defenseZeroS', 'critBase'],
      beam: [],
      delayed: ['delayS'],
      cone: ['coneHalfDeg'],
      chain: ['jumps', 'jumpFalloff'],
      targetArea: ['rootS', 'rootBossS'],
      arc: ['arcDeg'],
      aura: ['pushM', 'stunS'],
      mark: ['charmS', 'charmDamageMult', 'charmSeekM'],
      self: ['healFrac', 'healLowBonus', 'lowHpFrac'],
      fan: ['fanCount', 'fanDeg'],
      zone: ['durationS', 'tickS'],
      ward: ['shieldFrac', 'shieldS'],
      single: ['stunS'],
      vortex: [],
      leap: [],
    };
    for (const id of SPELL_IDS) {
      const fx = SPELLS[id].fx as unknown as Record<string, unknown>;
      for (const k of need[SPELLS[id].fx.shape]!) expect(typeof fx[k], `${id}.fx.${k}`).toBe('number');
    }
  });

  it('a simulação usa os números da ficha (Correntes prendem pelo tempo do fx)', () => {
    const { sim, target } = castOn('chains');
    const left = target.rootUntil - sim.time;
    // castOn avança 25 ticks depois do lançamento.
    expect(left + 25 * TICK).toBeCloseTo(SPELLS.chains.fx.rootS!, 5);
  });

  it('Correntes prendem o alvo (não anda)', () => {
    const { sim, target } = castOn('chains');
    expect(target.rootUntil).toBeGreaterThan(sim.time);
  });

  it('Comando de Recuo empurra o alvo para longe', () => {
    const c = createCharacter('Teste', 'dominion', 11);
    const sim = new Simulation(c, 5);
    const g = sim.enemies.find((e) => e.kind === 'grunt')!;
    sim.player.pos = { x: g.pos.x - 1.5, y: g.pos.y };
    const before = Math.hypot(g.pos.x - sim.player.pos.x, g.pos.y - sim.player.pos.y);
    sim.step({ ...emptyInput(), aim: { ...g.pos }, useSlot: 1 });
    expect(Math.hypot(g.pos.x - sim.player.pos.x, g.pos.y - sim.player.pos.y)).toBeGreaterThan(before + 1);
  });

  it('Fluxo Elástico puxa o alvo para perto', () => {
    const c = createCharacter('Teste', 'mutation', 11);
    c.elos[0]!.technique = 'elasticPull';
    c.elos[1]!.technique = null;
    const sim = new Simulation(c, 5);
    const g = sim.enemies.find((e) => e.kind === 'grunt')!;
    sim.player.pos = { x: g.pos.x - 5, y: g.pos.y };
    sim.step({ ...emptyInput(), aim: { ...g.pos }, useSlot: 1 });
    expect(Math.hypot(g.pos.x - sim.player.pos.x, g.pos.y - sim.player.pos.y)).toBeLessThan(2.5);
  });

  it('Marca da Discórdia faz o inimigo atacar um aliado', () => {
    const c = createCharacter('Teste', 'dominion', 11);
    const sim = new Simulation(c, 5);
    const [a, b] = sim.enemies.filter((e) => e.kind === 'grunt');
    b!.pos = { x: a!.pos.x + 1.2, y: a!.pos.y };
    sim.player.pos = { x: a!.pos.x - 3, y: a!.pos.y };
    sim.step({ ...emptyInput(), aim: { ...a!.pos }, useSlot: 2 });
    expect(a!.charmedUntil).toBeGreaterThan(sim.time);
    let hit = false;
    for (let i = 0; i < 120 && !hit; i++) hit = sim.step(emptyInput()).some((e) => e.t === 'damage' && e.id === b!.id);
    expect(hit).toBe(true);
  });
});

describe('Regra de equipar no jogo', () => {
  it('magia distante no Elo 1 é desequipada ao carregar; no Elo 3 funciona como nível 1', () => {
    const c = createCharacter('Teste', 'vigor', 3);
    c.knownSpells.push('chains');
    c.elos[0]!.technique = 'chains';
    const sim = new Simulation(c, 5);
    expect(c.elos[0]!.technique).toBeNull();
    expect(sim.equipProblem(3, 'chains')).toBeNull();
    c.elos[2]!.unlocked = true;
    c.elos[2]!.technique = 'chains';
    expect(sim.slotInfo(c.elos[2]!)!.effective).toBe(1);
  });
});

describe('Grimórios e livros', () => {
  it('ler um livro antigo ensina a magia dele', () => {
    const sim = new Simulation(createCharacter('Teste', 'vigor', 3), 5);
    const book = sim.map.books[0]!;
    expect(sim.c.knownSpells).not.toContain(book.spell);
    sim.player.pos = { x: book.x, y: book.y };
    const ev = sim.step(emptyInput());
    expect(sim.c.knownSpells).toContain(book.spell);
    expect(ev.some((e) => e.t === 'learn')).toBe(true);
  });

  it('o chefe sempre deixa um grimório, e pegá-lo ensina uma magia nova', () => {
    const sim = new Simulation(createCharacter('Teste', 'vigor', 3), 5);
    const boss = sim.boss()!;
    boss.hp = 1;
    sim.player.pos = { x: boss.pos.x - 2, y: boss.pos.y };
    const atk = { ...emptyInput(), aim: { ...boss.pos }, basic: true };
    sim.player.pos = { x: boss.pos.x - 1.6, y: boss.pos.y };
    for (let i = 0; i < 30 && boss.state !== 'dead'; i++) sim.step(atk);
    expect(boss.state).toBe('dead');
    expect(sim.drops).toHaveLength(1);
    const drop = sim.drops[0]!;
    const known = sim.c.knownSpells.length;
    sim.player.pos = { ...drop.pos };
    sim.step(emptyInput());
    expect(sim.c.knownSpells.length).toBe(known + 1);
  });
});

describe('Valores por diálogos e ações', () => {
  it('os diálogos cobrem os 8 valores, e toda escolha move algum', () => {
    const values = new Set<string>();
    for (const d of Object.values(DIALOGUES))
      for (const o of d.options) {
        expect(Object.keys(o.values).length, o.text).toBeGreaterThan(0);
        Object.keys(o.values).forEach((v) => values.add(v));
      }
    expect([...values].sort()).toEqual([...VALUE_IDS].sort());
  });

  it('responder ao Mestre Oren muda os Valores e libera a próxima conversa', () => {
    const sim = new Simulation(createCharacter('Teste', 'vigor', 3), 5);
    expect(sim.dialogueFor('oren')?.id).toBe('exercise');
    const reply = sim.answerDialogue('exercise', 0);
    expect(reply).toBeTruthy();
    expect(sim.c.psyche.values.loyalty).toBe(12);
    expect(sim.answerDialogue('exercise', 1)).toBeNull(); // cada conversa molda uma vez só
    expect(sim.dialogueFor('oren')).toBeNull(); // as próximas pedem nível 2 ou uma morte
    sim.c.deaths = 1;
    expect(sim.dialogueFor('oren')?.id).toBe('lostFight');
  });

  it('fugir ferido para o santuário com inimigos atrás dá Medo e sobe a Liberdade', () => {
    const sim = new Simulation(createCharacter('Teste', 'vigor', 3), 5);
    const g = sim.enemies.find((e) => e.kind === 'grunt')!;
    const s = sim.map.sanctuary;
    sim.player.pos = { x: s.x + s.r + 0.6, y: s.y };
    sim.step(emptyInput());
    g.aggro = true;
    g.pos = { x: s.x + s.r + 3, y: s.y };
    sim.player.hp = sim.maxHp() * 0.3;
    const freedom = sim.c.psyche.values.freedom;
    sim.player.pos = { x: s.x + s.r - 1, y: s.y };
    sim.step(emptyInput());
    expect(sim.c.psyche.values.freedom).toBeGreaterThan(freedom);
    expect(sim.c.psyche.emotions.fear).toBeDefined();
  });

  it('a ponte dispara o evento de diálogo uma vez', () => {
    const sim = new Simulation(createCharacter('Teste', 'vigor', 3), 5);
    const b = sim.map.bridge!;
    sim.player.pos = { x: b.x0 + 1, y: (b.y0 + b.y1) / 2 };
    const ev1 = sim.step(emptyInput());
    const ev2 = sim.step(emptyInput());
    expect(ev1.some((e) => e.t === 'dialogue' && e.id === 'bridge')).toBe(true);
    expect(ev2.some((e) => e.t === 'dialogue')).toBe(false);
  });
});

describe('Migração de saves', () => {
  it('converte um personagem v1 (Rito, Assinatura) sem perder progresso', () => {
    const v2 = createCharacter('Antigo', 'projection', 3);
    const v1 = JSON.parse(JSON.stringify(v2));
    v1.version = 1;
    v1.answers = [0, 1, 2, 0, 1, 2, 0, 1, 2, 0];
    v1.mastery.signature = { ...v1.mastery.votePunch, level: 7 };
    delete v1.mastery.votePunch;
    delete v1.knownSpells;
    v1.elos[1].technique = 'signature';
    v1.level = 4;
    const m = migrateCharacter(v1)!;
    expect(m.version).toBe(2);
    expect(m.level).toBe(4);
    expect(m.mastery.votePunch.level).toBe(7);
    expect(m.knownSpells).toEqual(expect.arrayContaining(['flowLance', 'orbRain', 'votePunch']));
    expect(m.elos[0]!.technique).toBe('flowLance');
    expect(m.elos.some((e) => (e.technique as string) === 'signature')).toBe(false);
    void TICK;
  });
});

/** Magia da segunda leva no Elo do nível mínimo dela (Elos 1–4 abertos para o teste). */
function castHigh(spell: SpellId, seconds = 0.5) {
  const def = SPELLS[spell];
  const c = createCharacter('Teste', def.affinity as Affinity, 11);
  c.knownSpells = [...SPELL_IDS];
  for (const slot of c.elos) Object.assign(slot, { technique: null, unlocked: true });
  const slot = c.elos[def.minLevel - 1]!;
  slot.technique = spell;
  const sim = new Simulation(c, 5);
  const target = sim.enemies.find((e) => e.kind === 'grunt')!;
  sim.player.pos = { x: target.pos.x - 2, y: target.pos.y };
  const input = emptyInput();
  input.aim = { ...target.pos };
  input.useSlot = def.minLevel;
  const events: SimEvent[] = [...sim.step(input)];
  for (let i = 0; i < seconds / TICK; i++) events.push(...sim.step({ ...emptyInput(), aim: { ...target.pos } }));
  return { sim, target, events, slot };
}
const hurt = (events: SimEvent[], id: number) => events.filter((e) => e.t === 'damage' && e.target === 'enemy' && e.id === id && e.amount > 0).length;

describe('Terceira leva de magias (níveis 2 a 8)', () => {
  const third = SPELL_IDS.slice(20);
  const harmful = third.filter((id) => SPELLS[id].baseDamage > 0);

  it.each(harmful)('%s fere o alvo', (spell) => {
    const { target, events } = castHigh(spell, 3.2);
    expect(hurt(events, target.id)).toBeGreaterThan(0);
  });

  it.each(third.filter((id) => SPELLS[id].baseDamage === 0))('%s (sem dano) é lançada e gasta Fluxo', (spell) => {
    const { sim } = castHigh(spell, 0.2);
    expect(sim.player.slotCd[SPELLS[spell].minLevel]).toBeGreaterThan(0);
  });

  it('Pele de Ferro reduz o dano recebido; Fúria de Sangue aumenta o causado', () => {
    const { sim } = castHigh('ironSkin', 0.1);
    expect(sim.player.guardUntil).toBeGreaterThan(sim.time);
    expect(sim.player.guardMult).toBe(SPELLS.ironSkin.fx.guardMult);
    const fury = castHigh('bloodFrenzy', 0.1).sim;
    expect(fury.player.empowerUntil).toBeGreaterThan(fury.time);
  });

  it('Golpe Vampírico devolve vida', () => {
    const def = SPELLS.leechStrike;
    const c = createCharacter('Teste', 'vigor', 11);
    for (const slot of c.elos) Object.assign(slot, { technique: null, unlocked: true });
    c.elos[def.minLevel - 1]!.technique = 'leechStrike';
    c.knownSpells = [...SPELL_IDS];
    const sim = new Simulation(c, 5);
    const target = sim.enemies.find((e) => e.kind === 'grunt')!;
    sim.player.pos = { x: target.pos.x - 2, y: target.pos.y };
    sim.player.hp = 10;
    const events = sim.step({ ...emptyInput(), aim: { ...target.pos }, useSlot: def.minLevel });
    expect(events.some((e) => e.t === 'heal')).toBe(true);
  });

  it('Coro da Discórdia marca os comuns da área', () => {
    const { sim, target } = castHigh('discordChoir', 0.1);
    expect(target.charmedUntil).toBeGreaterThan(sim.time);
  });
});

describe('Segunda leva de magias', () => {
  it.each(['quake', 'needleFan', 'fallingStar', 'acidPool', 'razorWhip', 'groundSpikes', 'kneel', 'gravityWell'] as const)(
    '%s fere o alvo à frente',
    (spell) => {
      const { target, events } = castHigh(spell, 1.6);
      expect(hurt(events, target.id)).toBeGreaterThan(0);
    },
  );

  it('Segundo Fôlego cura, e cura mais com pouca vida', () => {
    const heal = (frac: number) => {
      const def = SPELLS.secondWind;
      const c = createCharacter('Teste', 'vigor', 11);
      for (const slot of c.elos) Object.assign(slot, { technique: null, unlocked: slot.level <= 4 });
      c.elos[def.minLevel - 1]!.technique = 'secondWind';
      const sim = new Simulation(c, 5);
      sim.player.hp = Math.round(sim.maxHp() * frac);
      const before = sim.player.hp;
      sim.step({ ...emptyInput(), useSlot: def.minLevel });
      return sim.player.hp - before;
    };
    expect(heal(0.6)).toBeGreaterThan(0);
    expect(heal(0.2)).toBeGreaterThan(heal(0.6));
  });

  it('Égide Conjurada absorve dano antes da vida', () => {
    const def = SPELLS.conjuredWard;
    const c = createCharacter('Teste', 'forge', 11);
    for (const slot of c.elos) Object.assign(slot, { technique: null, unlocked: slot.level <= 4 });
    c.elos[def.minLevel - 1]!.technique = 'conjuredWard';
    const sim = new Simulation(c, 5);
    sim.player.pos = { x: 30, y: 24 };
    sim.step({ ...emptyInput(), useSlot: def.minLevel });
    expect(sim.player.shield).toBeGreaterThan(0);
    const hp = sim.player.hp;
    sim.damagePlayer(5, { heavy: false });
    expect(sim.player.hp).toBe(hp);
  });

  it('Leque de Agulhas de perto acerta o mesmo alvo várias vezes', () => {
    const { target, events } = castHigh('needleFan', 0.1);
    expect(hurt(events, target.id)).toBeGreaterThan(1);
  });

  it('Poça Corrosiva fere em pulsos', () => {
    const { target, events } = castHigh('acidPool', 2);
    expect(hurt(events, target.id)).toBeGreaterThan(2);
  });

  it('Ordem: Ajoelhe atordoa o alvo', () => {
    const { target } = castHigh('kneel', 0.1);
    expect(target.stun).toBeGreaterThan(1);
  });

  it('Estacas do Chão prendem o alvo', () => {
    const { sim, target } = castHigh('groundSpikes', 0.5);
    expect(target.rootUntil).toBeGreaterThan(sim.time);
  });

  it('Poço de Gravidade puxa para o ponto mirado', () => {
    const def = SPELLS.gravityWell;
    const c = createCharacter('Teste', 'dominion', 11);
    for (const slot of c.elos) Object.assign(slot, { technique: null, unlocked: slot.level <= 4 });
    c.elos[def.minLevel - 1]!.technique = 'gravityWell';
    const sim = new Simulation(c, 5);
    const g = sim.enemies.find((e) => e.kind === 'grunt')!;
    const at = { x: g.pos.x + 2.5, y: g.pos.y };
    sim.player.pos = { x: g.pos.x - 3, y: g.pos.y };
    sim.step({ ...emptyInput(), aim: at, useSlot: def.minLevel });
    expect(Math.hypot(g.pos.x - at.x, g.pos.y - at.y)).toBeLessThan(1.5);
  });
});

describe('Maestria decide até onde a magia vai', () => {
  it('Maestria 1 leva a magia só até o Elo mínimo + 1; subir a Maestria libera Elos mais altos', () => {
    const c = createCharacter('Teste', 'vigor', 11);
    const sim = new Simulation(c, 5);
    expect(sim.equipProblem(2, 'votePunch')).toBeNull();
    expect(sim.equipProblem(3, 'votePunch')).toMatch(/Maestria 1/);
    c.mastery.votePunch.level = 3;
    expect(sim.equipProblem(4, 'votePunch')).toBeNull();
    expect(sim.equipProblem(5, 'votePunch')).not.toBeNull();
  });

  it('Restrições acima do que a Maestria comporta não entram', () => {
    const c = createCharacter('Teste', 'vigor', 11);
    const sim = new Simulation(c, 5);
    const slot = c.elos[0]!;
    slot.restrictions = ['eliteOnly', 'lifeCost']; // +1 e +3
    sim.fitSlot(slot);
    expect(slot.restrictions).toEqual(['eliteOnly']);
    c.mastery.votePunch.level = 5;
    expect(sim.maxPactLevel('votePunch')).toBe(3);
  });

  it('save antigo: a Maestria vira 1–7 e nada equipado se perde', () => {
    const c = createCharacter('Teste', 'vigor', 11) as unknown as Record<string, unknown>;
    const raw = c as unknown as { elos: Array<{ level: number; unlocked: boolean; technique: string | null; restrictions: string[] }>; mastery: Record<string, unknown> };
    raw.elos[2]!.unlocked = true;
    raw.elos[2]!.technique = 'flowLance';
    raw.elos[2]!.restrictions = ['lifeCost'];
    raw.mastery = { votePunch: { level: 20, peak: 20, sharpness: 1 }, flowLance: { level: 1, peak: 1, sharpness: 0.5 }, tide: { level: 9, peak: 9, sharpness: 1 } };
    const m = migrateCharacter(JSON.parse(JSON.stringify(c)))!;
    expect(m.mastery.votePunch.level).toBe(7);
    expect((m.mastery as Record<string, unknown>).tide).toBeUndefined();
    const sim = new Simulation(m, 5);
    expect(m.elos[2]!.technique).toBe('flowLance');
    expect(m.elos[2]!.restrictions).toEqual(['lifeCost']);
    expect(sim.equipProblem(3, 'flowLance')).toBeNull();
  });
});
