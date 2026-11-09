import { describe, expect, it } from 'vitest';
import { balanceReport } from './balance';

describe('Balanceamento (bot)', () => {
  const rows = balanceReport();
  const byScenario = new Map<string, typeof rows>();
  for (const r of rows) byScenario.set(r.scenario, [...(byScenario.get(r.scenario) ?? []), r]);

  it('imprime o relatório', () => {
    const lines = ['', 'cenário'.padEnd(34) + ['vigor', 'mutation', 'forge', 'dominion', 'projection'].map((a) => a.padStart(18)).join('')];
    for (const [name, rs] of byScenario) {
      const cell = (a: string) => {
        const r = rs.find((x) => x.affinity === a);
        return (r ? `${r.won ? 'V' : 'X'} ${r.seconds}s ${r.hpLostPct}%` : '—').padStart(18);
      };
      lines.push(name.padEnd(34) + ['vigor', 'mutation', 'forge', 'dominion', 'projection'].map(cell).join(''));
    }
    console.log(lines.join('\n'));
    expect(rows.length).toBeGreaterThan(0);
  });

  it('toda afinidade vence o primeiro pacote no nível 1', () => {
    for (const r of byScenario.get('Carniçais x2 (nv 1)')!) expect(r.won, r.affinity).toBe(true);
  });

  // Com o equipamento esperado do tier 1, quem usa a Maré vence o Guardião — com sufoco.
  it('com o kit do tier 1, o Guardião cai no nível 5 (sem sobrar folga)', () => {
    for (const r of byScenario.get('Guardião (nv 5, hábil, kit T1)')!) {
      expect(r.won, r.affinity).toBe(true);
      expect(r.hpLostPct, r.affinity).toBeGreaterThan(40);
    }
  });

  // Playtest 09/11: um atirador de Projeção venceu o Guardião no nível 3 sem equipamento.
  // A pedra arremessada (mira à frente) agora cobra quem só mantém distância.
  it('atirador: sem kit no nível 3 não passa fácil; com o kit do tier 1 no nível 5, vence', () => {
    for (const r of byScenario.get('Guardião (nv 3, atirador)')!) expect(!r.won || r.hpLostPct > 80, r.affinity).toBe(true);
    for (const r of byScenario.get('Guardião (nv 5, atirador, kit T1)')!) expect(r.won, r.affinity).toBe(true);
  });

  // Sem equipamentos, o Guardião no nível 4 é difícil de propósito:
  // o que se exige aqui é que a Maré faça diferença clara, não que ele caia.
  it('usar a Maré e desviar faz diferença contra o Guardião', () => {
    const good = byScenario.get('Guardião (nv 4, hábil)')!;
    const bad = byScenario.get('Guardião (nv 4, sem Maré)')!;
    const score = (rs: typeof rows) => rs.reduce((s, r) => s + (r.won ? 1000 - r.hpLostPct : r.seconds), 0) / rs.length;
    expect(score(good)).toBeGreaterThan(score(bad) * 1.5);
  });
});
