import { afterEach, describe, expect, it } from 'vitest';
import { createCharacter, createGmCharacter, prepareGm } from '../src/sim/character';
import { PACTS } from '../src/sim/elos';
import {
  applyOverrides,
  countOverrides,
  emptyOverrides,
  sanitizeOverrides,
  setPactLevel,
  setSpellField,
  toggleSpellPact,
} from '../src/sim/overrides';
import { Simulation } from '../src/sim/sim';
import { SPELL_IDS, SPELLS } from '../src/sim/techniques';

describe('Ajustes do Mestre (GM)', () => {
  afterEach(() => applyOverrides(emptyOverrides()));

  it('aplica por cima do código e restaura exatamente', () => {
    const before = { dmg: SPELLS.flowLance.baseDamage, range: SPELLS.flowLance.range, lvl: PACTS.lowFlow.level };
    const o = emptyOverrides();
    setSpellField(o, 'flowLance', 'baseDamage', 99);
    setSpellField(o, 'flowLance', 'range', 12.34);
    setPactLevel(o, 'lowFlow', 4);
    applyOverrides(o);
    expect(SPELLS.flowLance.baseDamage).toBe(99);
    expect(SPELLS.flowLance.range).toBe(12.3);
    expect(PACTS.lowFlow.level).toBe(4);
    applyOverrides(emptyOverrides());
    expect(SPELLS.flowLance.baseDamage).toBe(before.dmg);
    expect(SPELLS.flowLance.range).toBe(before.range);
    expect(PACTS.lowFlow.level).toBe(before.lvl);
  });

  it('voltar ao valor do código apaga o ajuste', () => {
    const o = emptyOverrides();
    const dmg = SPELLS.votePunch.baseDamage;
    setSpellField(o, 'votePunch', 'baseDamage', dmg + 5);
    expect(countOverrides(o)).toBe(1);
    setSpellField(o, 'votePunch', 'baseDamage', dmg);
    expect(o.spells.votePunch).toBeUndefined();
    toggleSpellPact(o, 'votePunch', 'eliteOnly');
    toggleSpellPact(o, 'votePunch', 'eliteOnly');
    expect(countOverrides(o)).toBe(0);
  });

  it('limpa dados inválidos vindos do armazenamento', () => {
    const o = sanitizeOverrides({
      spells: { flowLance: { baseDamage: 99999, radius: 'x', pacts: ['lowFlow', 'nope'] }, fake: { baseDamage: 1 } },
      pacts: { lowFlow: { level: 9 }, nope: { level: 2 } },
    });
    expect(o.spells.flowLance).toEqual({ baseDamage: 500, pacts: ['lowFlow'] });
    expect(Object.keys(o.spells)).toEqual(['flowLance']);
    expect(o.pacts).toEqual({ lowFlow: { level: 4 } });
  });

  it('o nível da Restrição muda o nível efetivo do Elo na hora', () => {
    const c = createCharacter('Teste', 'vigor', 3);
    const slot = c.elos[1]!; // Elo 2 com Ponto
    slot.restrictions = ['recentlyHit'];
    const sim = new Simulation(c, 1);
    const base = sim.slotInfo(slot)!.effective;
    const o = emptyOverrides();
    setPactLevel(o, 'recentlyHit', PACTS.recentlyHit.level + 2);
    applyOverrides(o);
    expect(sim.slotInfo(slot)!.effective).toBe(base + 2);
  });

  it('o Mestre conhece todas as magias e tem os 8 Elos abertos', () => {
    const gm = createGmCharacter();
    expect(gm.gm).toBe(true);
    expect([...gm.knownSpells].sort()).toEqual([...SPELL_IDS].sort());
    expect(gm.elos.every((e) => e.unlocked)).toBe(true);
    // Um save antigo do Mestre recebe magias novas ao carregar.
    gm.knownSpells = ['votePunch'];
    prepareGm(gm);
    expect(gm.knownSpells.length).toBe(SPELL_IDS.length);
  });
});
