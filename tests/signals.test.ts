import { describe, expect, it } from 'vitest';
import { createCharacter, migrateCharacter } from '../src/sim/character';
import { rollItem } from '../src/sim/items';
import { Rng } from '../src/sim/math';
import type { PsycheEventKind } from '../src/sim/psyche/emotions';
import { voiceLine, whisperText, WHISPER_GAP_S } from '../src/sim/psyche/shifts';
import { emptyInput, Simulation, TICK, type SimEvent } from '../src/sim/sim';

/** Fase 1 do redesenho da Psique: sinal e voz. */
const fresh = () => {
  const c = createCharacter('Teste', 'vigor', 3);
  const sim = new Simulation(c, 5);
  for (const e of sim.enemies) Object.assign(e, { state: 'dead', respawnIn: Infinity });
  return { c, sim };
};
const feel = (sim: Simulation, kind: PsycheEventKind, m = 1) => (sim as unknown as { feel: (k: PsycheEventKind, m: number) => void }).feel(kind, m);
const run = (sim: Simulation, seconds: number): SimEvent[] => {
  const out: SimEvent[] = [];
  for (let i = 0; i < seconds / TICK; i++) out.push(...sim.step(emptyInput()));
  return out;
};

describe('Sussurros e história de mudanças', () => {
  it('uma escolha de conversa sussurra na hora e entra na história com a causa', () => {
    const { c, sim } = fresh();
    expect(sim.answerDialogue('stranger', 0)).not.toBeNull();
    const ev = sim.step(emptyInput());
    const w = ev.find((e) => e.t === 'whisper');
    expect(w && w.t === 'whisper' && w.items.length).toBeGreaterThan(0);
    expect(w && w.t === 'whisper' && w.items.some((i) => i.text === whisperText('value', 'mercy', 1))).toBe(true);
    expect(c.shifts[0]!.cause).toMatch(/^Conversa com Viajante ferido/);
    expect(c.shifts[0]!.changes).toContainEqual({ kind: 'value', id: 'mercy', dir: 1 });
  });

  it('em combate, sussurros respeitam um intervalo (não viram ruído)', () => {
    const { sim } = fresh();
    feel(sim, 'killBoss');
    feel(sim, 'killBoss');
    let whispers = run(sim, 2).filter((e) => e.t === 'whisper').length;
    for (let i = 0; i < 6; i++) feel(sim, 'retreat', 2);
    whispers += run(sim, 5).filter((e) => e.t === 'whisper').length;
    expect(whispers).toBe(1);
    // Passado o intervalo, a mudança acumulada sai.
    expect(run(sim, WHISPER_GAP_S).some((e) => e.t === 'whisper')).toBe(true);
  });

  it('a história junta o mesmo motivo repetido e guarda no máximo 40 entradas', () => {
    const { c, sim } = fresh();
    for (let i = 0; i < 5; i++) feel(sim, 'meditate', 2);
    expect(c.shifts.filter((s) => s.cause === 'Meditou em silêncio')).toHaveLength(1);
    for (let i = 0; i < 60; i++) {
      c.playTime += 120;
      feel(sim, i % 2 ? 'killElite' : 'meditate', 2);
    }
    expect(c.shifts.length).toBe(40);
  });
});

describe('Marcos de Valor', () => {
  it('quando um Valor fica forte, o marco diz o que abriu (itens que ressoam)', () => {
    const { c, sim } = fresh();
    const it = { ...rollItem(new Rng(1), 'padded', 1, 5), resonance: 'mercy' as const };
    c.bag.push(it);
    c.psyche.values.mercy = 20;
    sim.answerDialogue('stranger', 0); // Misericórdia +12 → 32
    const ev = sim.step(emptyInput());
    const m = ev.find((e) => e.t === 'milestone');
    expect(m && m.t === 'milestone' && m.state).toBe('for');
    expect(m && m.t === 'milestone' && m.title).toBe('Misericórdia agora guia suas escolhas');
    expect(m && m.t === 'milestone' && m.lines.some((l) => /ressoa com você/.test(l))).toBe(true);
  });

  it('não avisa de novo enquanto o Valor continua do mesmo lado', () => {
    const { c, sim } = fresh();
    c.psyche.values.mercy = 40;
    const sim2 = new Simulation(c, 5);
    sim2.answerDialogue('stranger', 0);
    expect(sim2.step(emptyInput()).some((e) => e.t === 'milestone')).toBe(false);
    void sim;
  });
});

describe('Voz interna', () => {
  it('a fala segue o traço mais marcado; sem traço marcado, a fala neutra', () => {
    const c = createCharacter('Teste', 'vigor', 3);
    expect(voiceLine('nearDeath', c.psyche.traits)).toBe('Preciso sair daqui.');
    c.psyche.traits.anxiety = 90;
    expect(voiceLine('nearDeath', c.psyche.traits)).toBe('Não, não, não…');
    c.psyche.traits.courage = 95;
    expect(voiceLine('nearDeath', c.psyche.traits)).toBe('Ainda não.');
  });

  it('o Guardião despertar sempre fala; momentos menores respeitam um intervalo', () => {
    const { c, sim } = fresh();
    const boss = sim.boss()!;
    Object.assign(boss, { state: 'idle', respawnIn: 0, hp: boss.maxHp });
    sim.player.pos = { x: sim.map.arena!.x - 2, y: sim.map.arena!.y };
    expect(run(sim, 0.2).some((e) => e.t === 'voice')).toBe(true);
    feel(sim, 'perfectTide');
    feel(sim, 'killStreak');
    expect(run(sim, 0.1).filter((e) => e.t === 'voice')).toHaveLength(0);
    void c;
  });

  it('chegar a uma região nova faz o personagem comentar', () => {
    const c = createCharacter('Teste', 'vigor', 3);
    c.region = 'varn';
    const sim = new Simulation(c, 5, { x: 4, y: 25 });
    expect(sim.step(emptyInput()).some((e) => e.t === 'voice')).toBe(true);
  });
});

describe('Saves antigos', () => {
  it('ganham a história de mudanças vazia', () => {
    const c = createCharacter('Teste', 'vigor', 3) as unknown as Record<string, unknown>;
    delete c.shifts;
    expect(migrateCharacter(JSON.parse(JSON.stringify(c)))!.shifts).toEqual([]);
  });
});
