import { describe, expect, it } from 'vitest';
import { AFFINITY_RING, affinityPenalty, hexDistance, minSlotFor } from '../src/sim/flow/affinity';
import { computeFlowMods, createTide, shiftTide, tickTide } from '../src/sim/flow/flow';
import { equipError, evaluateSlot, newSlot, pointsForLevel } from '../src/sim/elos';
import {
  decay,
  deathPenalty,
  GRACE_PLAYED_S,
  newMastery,
  recordUse,
  sharpnessMult,
} from '../src/sim/mastery';
import { reactTo } from '../src/sim/psyche/emotions';
import { chooseCrisis, createPsyche, psycheEvent, tickPsyche } from '../src/sim/psyche/psyche';
import { neutralTraits, neutralValues } from '../src/sim/psyche/traits';
import { createCharacter } from '../src/sim/character';

const ctx = { playTime: 0, inCombat: true, meditating: false, unmetNeeds: 0 };

describe('Pentágono de afinidades', () => {
  it('distâncias seguem o desenho: Vigor vizinha de Projeção e Mutação, distante de Domínio e Forja', () => {
    expect(hexDistance('vigor', 'mutation')).toBe(1);
    expect(hexDistance('vigor', 'projection')).toBe(1);
    expect(hexDistance('vigor', 'forge')).toBe(2);
    expect(hexDistance('vigor', 'dominion')).toBe(2);
    expect(hexDistance('forge', 'dominion')).toBe(1);
    expect(hexDistance('projection', 'dominion')).toBe(1);
    expect(affinityPenalty('dominion', 'vigor')).toBe(2);
  });

  it('nunca passa de 2 (pentágono de 5, sem Singular no padrão)', () => {
    for (const a of AFFINITY_RING) for (const b of AFFINITY_RING) expect(hexDistance(a, b)).toBeLessThanOrEqual(2);
    expect(AFFINITY_RING).toHaveLength(5);
  });

  it('Elo mínimo para equipar = 1 + distância', () => {
    expect(minSlotFor('vigor', 'vigor')).toBe(1);
    expect(minSlotFor('mutation', 'vigor')).toBe(2);
    expect(minSlotFor('vigor', 'forge')).toBe(3);
    expect(minSlotFor('vigor', 'dominion')).toBe(3);
    expect(equipError(1, 'mutation', 'vigor')).not.toBeNull();
    expect(equipError(2, 'mutation', 'vigor')).toBeNull();
    expect(equipError(2, 'vigor', 'forge')).not.toBeNull();
    expect(equipError(3, 'vigor', 'forge')).toBeNull();
  });

  it('equipada no Elo mínimo, a magia de fora funciona como nível 1 (nunca negativa)', () => {
    const v = { values: neutralValues(), characterAffinity: 'vigor' as const, modDiscount: 0 };
    expect(evaluateSlot(newSlot(3, true), { ...v, techniqueAffinity: 'forge' }).effective).toBe(1);
    expect(evaluateSlot(newSlot(2, true), { ...v, techniqueAffinity: 'mutation' }).effective).toBe(1);
    expect(evaluateSlot(newSlot(1, true), { ...v, techniqueAffinity: 'vigor' }).effective).toBe(1);
  });
});

describe('Grade de Elos', () => {
  const base = { values: neutralValues(), characterAffinity: 'projection' as const, modDiscount: 0 };

  it('exemplo do GDD: Elo 2 + elites (+1) + errar (+2) = nível efetivo 5 com custo de Elo 2', () => {
    const s = newSlot(2, true);
    s.restrictions = ['eliteOnly', 'missLock'];
    const info = evaluateSlot(s, { ...base, techniqueAffinity: 'projection' });
    expect(info.effective).toBe(5);
    expect(info.points).toBe(8);
    expect(info.costPct).toBe(5);
    expect(info.cooldown).toBe(4);
  });

  it('teto: Elo 8 + Restrição de nível 3 vira 11 (Além-limite)', () => {
    const s = newSlot(8, true);
    s.restrictions = ['lifeCost'];
    const info = evaluateSlot(s, { ...base, techniqueAffinity: null });
    expect(info.effective).toBe(11);
    expect(info.beyondLimit).toBe(true);
    expect(info.points).toBe(20);
  });

  it('nunca passa do Elo + 4', () => {
    const s = newSlot(3, true);
    s.restrictions = ['bloodOath', 'lifeCost'];
    expect(evaluateSlot(s, { ...base, techniqueAffinity: null }).effective).toBe(7);
  });

  it('primeira Restrição alinhada a um valor forte conta +1', () => {
    const values = neutralValues();
    values.power = 30;
    const s = newSlot(2, true);
    s.restrictions = ['eliteOnly'];
    const info = evaluateSlot(s, { ...base, values, techniqueAffinity: null });
    expect(info.alignedBonus).toBe(1);
    expect(info.effective).toBe(4);
  });

  it('afinidade distante vira penalidade de nível', () => {
    const s = newSlot(4, true);
    // personagem de Projeção: Domínio é vizinha (-1), Forja é distante (-2)
    expect(evaluateSlot(s, { ...base, techniqueAffinity: 'dominion' }).effective).toBe(3);
    expect(evaluateSlot(s, { ...base, techniqueAffinity: 'forge' }).effective).toBe(2);
  });

  it('pontos da faixa Além-limite', () => {
    expect([9, 10, 11, 12].map(pointsForLevel)).toEqual([16, 18, 20, 22]);
  });
});

describe('Maestria', () => {
  const traits = neutralTraits();

  it('alvo trivial rende quase nada; risco real rende muito mais', () => {
    const easy = newMastery();
    const hard = newMastery();
    for (let i = 0; i < 30; i++) {
      recordUse(easy, 10, { risk: 0.05, traits, playTime: i });
      recordUse(hard, 10, { risk: 2, traits, playTime: i });
    }
    expect(hard.level).toBeGreaterThan(easy.level + 1);
  });

  it('não perde nada dentro da carência de tempo jogado', () => {
    const r = newMastery();
    r.level = r.peak = 10;
    r.sharpness = 1;
    decay(r, 3600, GRACE_PLAYED_S - 1, traits);
    expect(r.level).toBe(10);
    expect(r.sharpness).toBe(1);
  });

  it('desuso respeita o piso de 50% do pico', () => {
    const r = newMastery();
    r.level = r.peak = 10;
    for (let h = 0; h < 2000; h++) decay(r, 3600, GRACE_PLAYED_S + h * 3600, traits);
    expect(r.level).toBeCloseTo(5, 5);
    expect(r.sharpness).toBe(0);
  });

  it('reaprender abaixo do pico é ~3x mais rápido', () => {
    const fresh = newMastery();
    fresh.level = 5;
    fresh.peak = 5;
    const relearn = newMastery();
    relearn.level = 5;
    relearn.peak = 10;
    recordUse(fresh, 20, { risk: 1, traits, playTime: 0 });
    recordUse(relearn, 20, { risk: 1, traits, playTime: 0 });
    expect((relearn.level - 5) / (fresh.level - 5)).toBeCloseTo(3, 5);
  });

  it('Afiação multiplica entre 85% e 110%', () => {
    expect(sharpnessMult(0)).toBeCloseTo(0.85);
    expect(sharpnessMult(1)).toBeCloseTo(1.1);
  });

  it('penalidade de morte zera a Afiação e respeita o piso', () => {
    const r = newMastery();
    r.level = r.peak = 8;
    r.sharpness = 0.9;
    deathPenalty(r, 0.9);
    expect(r.level).toBe(4);
    expect(r.sharpness).toBe(0);
  });
});

describe('Psique', () => {
  it('quase-morte: Medo no ansioso, Euforia no impulsivo', () => {
    const anxious = neutralTraits();
    anxious.anxiety = 90;
    anxious.courage = 20;
    const reckless = neutralTraits();
    reckless.impulsivity = 90;
    reckless.courage = 85;
    expect(reactTo('nearDeath', anxious)[0]!.id).toBe('fear');
    expect(reactTo('nearDeath', reckless)[0]!.id).toBe('euphoria');
  });

  it('Crise escolhida pelos traços', () => {
    const t = neutralTraits();
    t.wrath = 90;
    expect(chooseCrisis(t)).toBe('frenzy');
    t.wrath = 40;
    t.anxiety = 95;
    expect(chooseCrisis(t)).toBe('panic');
  });

  it('estresse crítico avisa 3 s antes e então entra em Crise', () => {
    const t = neutralTraits();
    t.wrath = 90;
    const p = createPsyche(t, neutralValues());
    p.stress = 90;
    const n1 = tickPsyche(p, 0.1, ctx);
    expect(n1.some((n) => n.type === 'crisisWarning')).toBe(true);
    expect(p.crisis.phase).toBe('warning');
    for (let i = 0; i < 31; i++) tickPsyche(p, 0.1, ctx);
    expect(p.crisis.phase).toBe('active');
    const mods = computeFlowMods(p, 'veil');
    expect(mods.tideLock).toBe(1);
    expect(mods.techniqueCost).toBeGreaterThanOrEqual(2);
  });

  it('memória curta guarda no máximo 8 e promove eventos fortes', () => {
    const p = createPsyche(neutralTraits(), neutralValues());
    const courageBefore = p.traits.courage;
    psycheEvent(p, 'killBoss', 0);
    expect(p.longMemory.some((m) => m.kind === 'killBoss')).toBe(true);
    expect(p.traits.courage).toBeGreaterThan(courageBefore);
    const kinds = ['nearDeath', 'heavyHit', 'killElite', 'killStreak', 'perfectTide', 'meditate', 'death', 'pactBroken', 'redemption'] as const;
    kinds.forEach((k, i) => psycheEvent(p, k, i));
    expect(p.shortMemory.length).toBeLessThanOrEqual(8);
  });
});

describe('Maré', () => {
  it('Fúria deixa a Maré lenta para voltar à defesa', () => {
    const p = createPsyche(neutralTraits(), neutralValues());
    const calmTide = createTide();
    const furyTide = createTide();
    shiftTide(calmTide, -5);
    shiftTide(furyTide, -5);
    const neutral = computeFlowMods(p, 'veil');
    p.emotions.fury = { id: 'fury', intensity: 1, remaining: 10, duration: 10 };
    const furious = computeFlowMods(p, 'veil');
    tickTide(calmTide, 0.1, neutral, 0, 0);
    tickTide(furyTide, 0.1, furious, 0, 0);
    expect(furyTide.value).toBeGreaterThan(calmTide.value);
  });
});

describe('Personagem', () => {
  it('nasce com Elos 1 e 2 liberados e técnicas equipadas', () => {
    const c = createCharacter('Teste', 'vigor', 7);
    expect(c.elos.filter((e) => e.unlocked).map((e) => e.level)).toEqual([1, 2]);
    expect(c.elos[0]!.technique).toBe('votePunch');
    expect(c.elos[1]!.technique).toBe('point');
  });
});
