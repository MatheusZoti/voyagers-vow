import { describe, expect, it } from 'vitest';
import { createCharacter } from '../src/sim/character';
import { evaluateSlot, levelPower, newSlot, PACT_IDS, PACTS, pointsForLevel, type PactId } from '../src/sim/elos';
import { emptyInput, Simulation, TICK } from '../src/sim/sim';
import { neutralValues } from '../src/sim/psyche/values';
import { sanitizeSlot, TECHNIQUES } from '../src/sim/techniques';
import type { Enemy } from '../src/sim/world/entities';

const opts = { values: neutralValues(), characterAffinity: 'vigor' as const, techniqueAffinity: 'vigor' as const, modDiscount: 0 };

describe('Cada nível de Restrição = 1 nível efetivo', () => {
  it.each(PACT_IDS)('%s eleva o Elo 1 exatamente pelo seu nível', (id) => {
    const s = newSlot(1, true);
    s.restrictions = [id];
    const info = evaluateSlot(s, opts);
    expect(info.effective).toBe(1 + PACTS[id].level);
    expect(info.points).toBe(pointsForLevel(1 + PACTS[id].level));
    expect(info.power).toBeCloseTo(levelPower(1 + PACTS[id].level));
    // Custo e recarga continuam os do Elo 1.
    expect(info.costPct).toBe(3);
    expect(info.cooldown).toBe(2);
  });

  it('Restrição +1 leva uma técnica de nível 1 ao nível 2 e libera pontos de forja', () => {
    const s = newSlot(1, true);
    expect(evaluateSlot(s, opts).points).toBe(0);
    s.restrictions = ['recentlyHit'];
    const info = evaluateSlot(s, opts);
    expect(info.effective).toBe(2);
    expect(info.points).toBe(2);
    expect(info.power).toBeGreaterThan(levelPower(1));
  });

  it('Restrições somam: Elo 3 com +1 e +2 vira nível 6', () => {
    const s = newSlot(3, true);
    s.restrictions = ['eliteOnly', 'lowFlow'];
    expect(evaluateSlot(s, opts).effective).toBe(6);
  });
});

describe('Restrições aplicáveis por técnica', () => {
  it('Ponto não oferece "se errar" nem Área/Alcance', () => {
    expect(TECHNIQUES.point.pacts).not.toContain('missLock');
    expect(TECHNIQUES.point.mods).not.toContain('area');
    expect(TECHNIQUES.point.mods).not.toContain('range');
    expect(TECHNIQUES.votePunch.pacts).toEqual([...PACT_IDS]);
  });

  it('trocar de técnica remove o que não se aplica', () => {
    const s = newSlot(3, true);
    s.technique = 'votePunch';
    s.restrictions = ['missLock', 'eliteOnly'];
    s.mods = { area: 1, damage: 1 };
    s.technique = 'point';
    sanitizeSlot(s);
    expect(s.restrictions).toEqual(['eliteOnly']);
    expect(s.mods).toEqual({ damage: 1 });
  });
});

// ---------------------------------------------------------------------------
// Efeito em jogo
// ---------------------------------------------------------------------------

function setup(pacts: PactId[], technique: 'votePunch' | 'point' = 'votePunch') {
  const c = createCharacter('Teste', 'vigor', 3);
  c.psyche.values = neutralValues();
  const sim = new Simulation(c, 5);
  const slot = c.elos[1]!; // Elo 2
  c.elos[0]!.technique = technique === 'votePunch' ? 'point' : 'votePunch';
  slot.technique = technique;
  slot.restrictions = [...pacts];
  return { sim, slot };
}

/** Coloca o jogador a 3 m do inimigo, mirando nele, e usa o Elo 2. */
function castAt(sim: Simulation, target: Enemy) {
  sim.player.pos = { x: target.pos.x - 3, y: target.pos.y };
  const input = emptyInput();
  input.aim = { ...target.pos };
  input.useSlot = 2;
  return sim.step(input);
}

const firstOf = (sim: Simulation, kind: Enemy['kind']) => sim.enemies.find((e) => e.kind === kind)!;

describe('Restrições funcionando em jogo (Punho do Voto)', () => {
  it('só contra elites: comum fica imune, elite toma dano', () => {
    const { sim } = setup(['eliteOnly']);
    const grunt = firstOf(sim, 'grunt');
    const ev = castAt(sim, grunt);
    expect(grunt.hp).toBe(grunt.def.hp);
    expect(ev.some((e) => e.t === 'damage' && e.immune)).toBe(true);

    const { sim: sim2 } = setup(['eliteOnly']);
    const brute = firstOf(sim2, 'brute');
    castAt(sim2, brute);
    expect(brute.hp).toBeLessThan(brute.def.hp);
  });

  it('só depois de receber dano: bloqueia sem dano recente, libera logo após', () => {
    const { sim } = setup(['recentlyHit']);
    const grunt = firstOf(sim, 'grunt');
    castAt(sim, grunt);
    expect(sim.player.slotCd[2] ?? 0).toBe(0);
    sim.damagePlayer(5, { heavy: false });
    castAt(sim, grunt);
    expect(sim.player.slotCd[2]).toBeGreaterThan(0);
  });

  it('só com pouco Fluxo: bloqueia acima de 30%, libera abaixo', () => {
    const { sim } = setup(['lowFlow']);
    const grunt = firstOf(sim, 'grunt');
    castAt(sim, grunt);
    expect(sim.player.slotCd[2] ?? 0).toBe(0);
    sim.player.flow = sim.flowMax() * 0.2;
    castAt(sim, grunt);
    expect(sim.player.slotCd[2]).toBeGreaterThan(0);
  });

  it('se errar, perco o Fluxo: golpe no vazio zera e trava a regeneração por 20 s', () => {
    const { sim } = setup(['missLock']);
    sim.player.pos = { x: 14, y: 12 };
    const input = emptyInput();
    input.aim = { x: 10, y: 12 };
    input.useSlot = 2;
    sim.step(input);
    expect(sim.player.flow).toBe(0);
    for (let i = 0; i < 5 / TICK; i++) sim.step(emptyInput());
    expect(sim.player.flow).toBe(0);
  });

  it('pago com a minha vida: cada uso tira 1 de vida máxima', () => {
    const { sim } = setup(['lifeCost']);
    const before = sim.maxHp();
    castAt(sim, firstOf(sim, 'grunt'));
    expect(sim.maxHp()).toBe(before - 1);
  });

  it('juramento de sangue: morrer sobe a penalidade 2 níveis extras e gera Vergonha', () => {
    const { sim } = setup(['bloodOath']);
    sim.player.pos = { x: 30, y: 24 };
    sim.damagePlayer(9999, { heavy: false });
    expect(sim.c.penaltyLevel).toBe(2);
    expect(sim.c.psyche.emotions.shame).toBeDefined();

    const { sim: plain } = setup([]);
    plain.player.pos = { x: 30, y: 24 };
    plain.damagePlayer(9999, { heavy: false });
    expect(plain.c.penaltyLevel).toBe(0);
  });
});

describe('Restrições novas em jogo', () => {
  it('só com a vida quase cheia: bloqueia com 80% ou menos', () => {
    const { sim } = setup(['fullHealth']);
    const grunt = firstOf(sim, 'grunt');
    sim.player.hp = sim.maxHp() * 0.7;
    castAt(sim, grunt);
    expect(sim.player.slotCd[2] ?? 0).toBe(0);
    sim.player.hp = sim.maxHp();
    castAt(sim, grunt);
    expect(sim.player.slotCd[2]).toBeGreaterThan(0);
  });

  it('só de perto: bloqueia sem inimigo a até 4 m', () => {
    const { sim } = setup(['closeQuarters']);
    for (const e of sim.enemies) Object.assign(e, { state: 'dead', respawnIn: Infinity });
    const input = emptyInput();
    input.useSlot = 2;
    sim.step(input);
    expect(sim.player.slotCd[2] ?? 0).toBe(0);
    const { sim: sim2 } = setup(['closeQuarters']);
    castAt(sim2, firstOf(sim2, 'grunt'));
    expect(sim2.player.slotCd[2]).toBeGreaterThan(0);
  });

  it('só cercado: precisa de 3 inimigos a até 8 m', () => {
    const { sim } = setup(['surrounded']);
    const grunt = firstOf(sim, 'grunt');
    for (const e of sim.enemies) if (e !== grunt) Object.assign(e, { state: 'dead', respawnIn: Infinity });
    castAt(sim, grunt);
    expect(sim.player.slotCd[2] ?? 0).toBe(0);
    const live = sim.enemies.filter((e) => e !== grunt).slice(0, 2);
    for (const e of live) Object.assign(e, { state: 'idle', pos: { x: grunt.pos.x, y: grunt.pos.y + 1 } });
    castAt(sim, grunt);
    expect(sim.player.slotCd[2]).toBeGreaterThan(0);
  });

  it('o golpe me expõe: dano recebido +50% por 4 s', () => {
    const hit = (pacts: PactId[]) => {
      const { sim } = setup(pacts);
      castAt(sim, firstOf(sim, 'grunt'));
      sim.player.pos = { x: 30, y: 24 };
      const hp = sim.player.hp;
      sim.damagePlayer(20, { heavy: false });
      return hp - sim.player.hp;
    };
    expect(hit(['exposed'])).toBeGreaterThan(hit([]) * 1.3);
  });

  it('pago com sangue: cada uso custa 8% da vida máxima, nunca mata', () => {
    const { sim } = setup(['bloodPrice']);
    const grunt = firstOf(sim, 'grunt');
    const hp = sim.player.hp;
    castAt(sim, grunt);
    expect(hp - sim.player.hp).toBeGreaterThanOrEqual(Math.round(sim.maxHp() * 0.08));
    sim.player.hp = 2;
    sim.player.slotCd[2] = 0;
    castAt(sim, grunt);
    expect(sim.player.hp).toBeGreaterThanOrEqual(1);
    expect(sim.player.dead).toBe(false);
  });

  it('juro poupar quem se rende: executar sela o Elo', () => {
    const { sim, slot } = setup(['mercyOath']);
    const brute = firstOf(sim, 'grunt');
    Object.assign(brute, { state: 'surrendered' });
    (sim as unknown as { executeSurrendered: (e: Enemy) => void }).executeSurrendered(brute);
    expect(slot.sealed).toBe(true);
  });
});

describe('Restrições e forja no Ponto', () => {
  it('só contra elites: a carga não se gasta em comuns e dispara na elite', () => {
    const { sim } = setup(['eliteOnly'], 'point');
    const input = emptyInput();
    input.useSlot = 2;
    sim.step(input);
    expect(sim.player.pointUntil).toBeGreaterThan(sim.time);
    const grunt = firstOf(sim, 'grunt');
    sim.player.pos = { x: grunt.pos.x - 1, y: grunt.pos.y };
    const atk = emptyInput();
    atk.aim = { ...grunt.pos };
    atk.basic = true;
    const ev = sim.step(atk);
    expect(ev.some((e) => e.t === 'damage' && e.crit)).toBe(false);
    expect(sim.player.pointUntil).toBeGreaterThan(sim.time);

    const brute = firstOf(sim, 'brute');
    sim.player.pos = { x: brute.pos.x - 1.2, y: brute.pos.y };
    sim.player.basicCd = 0;
    atk.aim = { ...brute.pos };
    const ev2 = sim.step(atk);
    expect(ev2.some((e) => e.t === 'damage' && e.crit)).toBe(true);
  });

  it('pontos de Dano no Ponto aumentam o crítico', () => {
    const crit = (dmgMods: number) => {
      // Elo 2 sem Restrições = 2 pontos de forja.
      const { sim, slot } = setup([], 'point');
      slot.mods = dmgMods ? { damage: dmgMods } : {};
      const use = emptyInput();
      use.useSlot = 2;
      sim.step(use);
      const brute = firstOf(sim, 'brute');
      sim.player.pos = { x: brute.pos.x - 1.2, y: brute.pos.y };
      const atk = emptyInput();
      atk.aim = { ...brute.pos };
      atk.basic = true;
      const ev = sim.step(atk);
      const hit = ev.find((e) => e.t === 'damage' && e.crit);
      return hit && hit.t === 'damage' ? hit.amount : 0;
    };
    expect(crit(2)).toBeGreaterThan(crit(0));
  });
});
