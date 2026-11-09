import { describe, expect, it } from 'vitest';
import { createCharacter, migrateCharacter } from '../src/sim/character';
import { rollItem } from '../src/sim/items';
import { Rng } from '../src/sim/math';
import { whisperText } from '../src/sim/psyche/shifts';
import { emptyInput, Simulation } from '../src/sim/sim';

/** Sinal: toda mudança de Valor aparece na hora. */
const fresh = () => {
  const c = createCharacter('Teste', 'vigor', 3);
  const sim = new Simulation(c, 5);
  for (const e of sim.enemies) Object.assign(e, { state: 'dead', respawnIn: Infinity });
  return { c, sim };
};

describe('Sussurros e história de mudanças', () => {
  it('uma escolha de conversa sussurra na hora e entra na história com a causa', () => {
    const { c, sim } = fresh();
    expect(sim.answerDialogue('stranger', 0)).not.toBeNull();
    const ev = sim.step(emptyInput());
    const w = ev.find((e) => e.t === 'whisper');
    expect(w && w.t === 'whisper' && w.items.length).toBeGreaterThan(0);
    expect(w && w.t === 'whisper' && w.items.some((i) => i.text === whisperText('mercy', 1))).toBe(true);
    expect(c.shifts[0]!.cause).toMatch(/^Conversa com Viajante ferido/);
    expect(c.shifts[0]!.changes).toContainEqual({ kind: 'value', id: 'mercy', dir: 1 });
  });

  it('emoções de combate não mexem nos Valores nem entram na história', () => {
    const { c, sim } = fresh();
    const before = { ...c.psyche.values };
    (sim as unknown as { feel: (k: string) => void }).feel('killBoss');
    expect(c.psyche.values).toEqual(before);
    expect(c.shifts).toHaveLength(0);
  });

  it('a história junta o mesmo motivo repetido e guarda no máximo 40 entradas', () => {
    const { c, sim } = fresh();
    const shape = (cause: string) => (sim as unknown as { shape: (c: string, d: Record<string, number>) => void }).shape(cause, { law: 1 });
    for (let i = 0; i < 5; i++) shape('Deixou as moedas do altar');
    expect(c.shifts.filter((s) => s.cause === 'Deixou as moedas do altar')).toHaveLength(1);
    for (let i = 0; i < 60; i++) {
      c.playTime += 120;
      shape(`Ato ${i}`);
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

describe('Saves antigos', () => {
  it('ganham a história de mudanças vazia', () => {
    const c = createCharacter('Teste', 'vigor', 3) as unknown as Record<string, unknown>;
    delete c.shifts;
    expect(migrateCharacter(JSON.parse(JSON.stringify(c)))!.shifts).toEqual([]);
  });

  it('perdem traços, estresse, Crise, memórias e fama; os Valores ficam', () => {
    const c = createCharacter('Teste', 'vigor', 3) as unknown as Record<string, unknown> & { psyche: Record<string, unknown>; shifts: unknown[] };
    c.psyche.values = { ...(c.psyche.values as object), mercy: 30 };
    Object.assign(c.psyche, { traits: { courage: 80 }, stress: 70, crisis: { phase: 'none' }, shortMemory: [1], longMemory: [2] });
    c.psyche.emotions = { euphoria: { id: 'euphoria', intensity: 1, remaining: 5, duration: 5 }, fear: { id: 'fear', intensity: 0.5, remaining: 5, duration: 5 } };
    c.fame = { vale: { mercy: 3 } };
    c.shifts = [
      { t: 1, cause: 'a', changes: [{ kind: 'trait', id: 'courage', dir: 1 }] },
      { t: 2, cause: 'b', changes: [{ kind: 'value', id: 'law', dir: 1 }, { kind: 'trait', id: 'pride', dir: -1 }] },
    ];
    const m = migrateCharacter(JSON.parse(JSON.stringify(c)))!;
    expect(Object.keys(m.psyche).sort()).toEqual(['emotions', 'values']);
    expect(m.psyche.values.mercy).toBe(30);
    expect(Object.keys(m.psyche.emotions)).toEqual(['fear']);
    expect((m as unknown as { fame?: unknown }).fame).toBeUndefined();
    expect(m.shifts).toEqual([{ t: 2, cause: 'b', changes: [{ kind: 'value', id: 'law', dir: 1 }] }]);
  });
});
