import { describe, expect, it } from 'vitest';
import { createCharacter, migrateCharacter } from '../src/sim/character';
import { DIALOGUES } from '../src/sim/psyche/dialogues';
import { TRAIT_IDS, VALUE_IDS } from '../src/sim/psyche/traits';
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
  it('10 magias, 2 por afinidade, cada uma com um papel', () => {
    expect(SPELL_IDS).toHaveLength(10);
    for (const aff of ['vigor', 'mutation', 'forge', 'dominion', 'projection'] as const) {
      expect(SPELL_IDS.filter((id) => SPELLS[id].affinity === aff)).toHaveLength(2);
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

describe('Personalidade por diálogos e ações', () => {
  it('os diálogos cobrem os 16 traços e os 8 valores', () => {
    const traits = new Set<string>();
    const values = new Set<string>();
    for (const d of Object.values(DIALOGUES))
      for (const o of d.options) {
        Object.keys(o.traits).forEach((t) => traits.add(t));
        Object.keys(o.values).forEach((v) => values.add(v));
      }
    expect([...traits].sort()).toEqual([...TRAIT_IDS].sort());
    expect([...values].sort()).toEqual([...VALUE_IDS].sort());
  });

  it('responder ao Mestre Oren muda a personalidade e libera a próxima conversa', () => {
    const sim = new Simulation(createCharacter('Teste', 'vigor', 3), 5);
    expect(sim.dialogueFor('oren')?.id).toBe('exercise');
    const before = sim.c.psyche.traits.discipline;
    const reply = sim.answerDialogue('exercise', 0);
    expect(reply).toBeTruthy();
    expect(sim.c.psyche.traits.discipline).toBeGreaterThan(before + 4);
    expect(sim.c.psyche.values.loyalty).toBe(12);
    expect(sim.answerDialogue('exercise', 1)).toBeNull(); // cada conversa molda uma vez só
    expect(sim.dialogueFor('oren')).toBeNull(); // as próximas pedem nível 2 ou uma morte
    sim.c.deaths = 1;
    expect(sim.dialogueFor('oren')?.id).toBe('lostFight');
  });

  it('fugir ferido para o santuário com inimigos atrás reduz a Coragem', () => {
    const sim = new Simulation(createCharacter('Teste', 'vigor', 3), 5);
    const g = sim.enemies.find((e) => e.kind === 'grunt')!;
    const s = sim.map.sanctuary;
    sim.player.pos = { x: s.x + s.r + 0.6, y: s.y };
    sim.step(emptyInput());
    g.aggro = true;
    g.pos = { x: s.x + s.r + 3, y: s.y };
    sim.player.hp = sim.maxHp() * 0.3;
    const courage = sim.c.psyche.traits.courage;
    sim.player.pos = { x: s.x + s.r - 1, y: s.y };
    sim.step(emptyInput());
    expect(sim.c.psyche.traits.courage).toBeLessThan(courage);
  });

  it('a ponte dispara o evento de diálogo uma vez', () => {
    const sim = new Simulation(createCharacter('Teste', 'vigor', 3), 5);
    const b = sim.map.bridge;
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
