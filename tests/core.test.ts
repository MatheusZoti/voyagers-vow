import { describe, expect, it } from 'vitest';
import { AFFINITY_RING, affinityPenalty, hexDistance, minSlotFor } from '../src/sim/flow/affinity';
import { computeFlowMods, createTide, shiftTide, tickTide } from '../src/sim/flow/flow';
import { equipError, evaluateSlot, newSlot, pointsForLevel } from '../src/sim/elos';
import {
  MASTERY_MAX,
  maxEloFor,
  maxPactLevelFor,
  migrateMasteryLevel,
  newMastery,
  recordUse,
} from '../src/sim/mastery';
import { reactTo } from '../src/sim/psyche/emotions';
import { createPsyche, psycheEvent, tickPsyche } from '../src/sim/psyche/psyche';
import { neutralValues } from '../src/sim/psyche/values';
import { createCharacter, eloUnlockHint, refreshEloUnlocks } from '../src/sim/character';


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
    expect(info.valueBonus).toBe(1);
    expect(info.effective).toBe(4);
  });

  it('Restrição de um Valor que você despreza tira 1 nível', () => {
    const values = neutralValues();
    values.power = -30;
    const s = newSlot(2, true);
    s.restrictions = ['eliteOnly'];
    const info = evaluateSlot(s, { ...base, values, techniqueAffinity: null });
    expect(info.valueBonus).toBe(-1);
    expect(info.effective).toBe(2);
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
  it('sobe com o uso e para no nível máximo', () => {
    const r = newMastery();
    expect(recordUse(r, 60)).toBe(true);
    expect(Math.floor(r.level)).toBe(2);
    recordUse(r, 1e9);
    expect(r.level).toBe(MASTERY_MAX);
  });

  it('cada nível deixa a magia subir um Elo, até o 8', () => {
    expect(maxEloFor(1, 1)).toBe(2);
    expect(maxEloFor(1, 4)).toBe(5);
    expect(maxEloFor(3, 2)).toBe(5);
    expect(maxEloFor(1, MASTERY_MAX)).toBe(8);
  });

  it('Restrições de até metade da Maestria, arredondada para cima', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(maxPactLevelFor)).toEqual([1, 1, 2, 2, 3, 3, 4]);
  });

  it('a Maestria antiga (1–20) vira a nova (1–7) na proporção', () => {
    expect(migrateMasteryLevel(1)).toBe(1);
    expect(migrateMasteryLevel(20)).toBe(MASTERY_MAX);
    expect(Math.floor(migrateMasteryLevel(10))).toBe(3);
  });
});

describe('Psique', () => {
  it('gatilhos fixos: quase-morte dá Medo, golpe pesado dá Fúria, Maré perfeita dá Calma', () => {
    expect(reactTo('nearDeath')!.id).toBe('fear');
    expect(reactTo('heavyHit')!.id).toBe('fury');
    expect(reactTo('perfectTide')!.id).toBe('calm');
    expect(reactTo('pactBroken')!.id).toBe('shame');
  });

  it('as emoções passam sozinhas; a penitência apaga a Vergonha', () => {
    const p = createPsyche(neutralValues());
    psycheEvent(p, 'heavyHit');
    expect(p.emotions.fury).toBeDefined();
    for (let i = 0; i < 100; i++) tickPsyche(p, 0.1);
    expect(p.emotions.fury).toBeUndefined();
    psycheEvent(p, 'pactBroken');
    for (let i = 0; i < 100; i++) tickPsyche(p, 0.1);
    expect(p.emotions.shame).toBeDefined();
    psycheEvent(p, 'redemption');
    expect(p.emotions.shame).toBeUndefined();
    expect(p.emotions.calm).toBeDefined();
  });

  it('cada emoção mexe no Fluxo', () => {
    const p = createPsyche(neutralValues());
    const base = computeFlowMods(p, 'open', 0.5);
    p.emotions.calm = { id: 'calm', intensity: 1, remaining: 10, duration: 10 };
    expect(computeFlowMods(p, 'open', 0.5).regen).toBeGreaterThan(base.regen);
    p.emotions.shame = { id: 'shame', intensity: 1, remaining: 10, duration: 10 };
    expect(computeFlowMods(p, 'open', 0.5).signature).toBeLessThan(1);
  });
});

describe('Maré', () => {
  it('Fúria deixa a Maré lenta para voltar à defesa', () => {
    const p = createPsyche(neutralValues());
    const calmTide = createTide();
    const furyTide = createTide();
    shiftTide(calmTide, -5);
    shiftTide(furyTide, -5);
    const neutral = computeFlowMods(p, 'open');
    p.emotions.fury = { id: 'fury', intensity: 1, remaining: 10, duration: 10 };
    const furious = computeFlowMods(p, 'open');
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

  it('cada marco libera o próximo Elo, sempre em ordem', () => {
    const c = createCharacter('Teste', 'vigor', 7);
    const open = () => c.elos.filter((e) => e.unlocked).map((e) => e.level);
    c.level = 4;
    refreshEloUnlocks(c);
    expect(open()).toEqual([1, 2, 3]);
    expect(eloUnlockHint(c, 4)).toBe('nível 5 ou vencer o Guardião');
    expect(eloUnlockHint(c, 5)).toBe('nível 5 e vencer o Guardião');
    // Vencer o Guardião antes do nível 5 abre o Elo 4, não o 5.
    c.bossDefeated = true;
    expect(refreshEloUnlocks(c)).toEqual([4]);
    expect(open()).toEqual([1, 2, 3, 4]);
    expect(eloUnlockHint(c, 5)).toBe('nível 5');
    c.level = 5;
    expect(refreshEloUnlocks(c)).toEqual([5]);
  });

  it('save antigo com o Elo 5 aberto e o 4 fechado é corrigido', () => {
    const c = createCharacter('Teste', 'vigor', 7);
    c.level = 4;
    c.bossDefeated = true;
    c.elos[2]!.unlocked = true;
    c.elos[4]!.unlocked = true;
    refreshEloUnlocks(c);
    expect(c.elos.filter((e) => e.unlocked).map((e) => e.level)).toEqual([1, 2, 3, 4]);
  });
});
