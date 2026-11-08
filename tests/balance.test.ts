import { describe, expect, it } from 'vitest';
import { balanceReport } from './balance';

describe('Balanceamento (bot)', () => {
  const rows = balanceReport();
  const byScenario = new Map<string, typeof rows>();
  for (const r of rows) byScenario.set(r.scenario, [...(byScenario.get(r.scenario) ?? []), r]);

  it('imprime o relatório', () => {
    const lines = ['', 'cenário'.padEnd(34) + ['vigor', 'mutation', 'forge', 'dominion', 'projection'].map((a) => a.padStart(18)).join('')];
    for (const [name, rs] of byScenario) {
      lines.push(name.padEnd(34) + rs.map((r) => `${r.won ? 'V' : 'X'} ${r.seconds}s ${r.hpLostPct}%`.padStart(18)).join(''));
    }
    console.log(lines.join('\n'));
    expect(rows.length).toBeGreaterThan(0);
  });

  it('toda afinidade vence o primeiro pacote no nível 1', () => {
    for (const r of byScenario.get('Carniçais x2 (nv 1)')!) expect(r.won, r.affinity).toBe(true);
  });

  it('o Guardião é vencível no nível 4 por quem usa a Maré, por toda afinidade', () => {
    for (const r of byScenario.get('Guardião (nv 4, hábil)')!) expect(r.won, r.affinity).toBe(true);
  });

  it('usar a Maré e desviar faz diferença contra o Guardião', () => {
    const good = byScenario.get('Guardião (nv 4, hábil)')!;
    const bad = byScenario.get('Guardião (nv 4, sem Maré)')!;
    const avg = (rs: typeof rows) => rs.reduce((s, r) => s + r.hpLostPct + (r.won ? 0 : 100), 0) / rs.length;
    expect(avg(good)).toBeLessThan(avg(bad));
  });
});
