import { STRONG_VALUE, VALUE_IDS, VALUE_NAMES, type ValueId, type Values } from './values';

/**
 * Sinal: a Psique não mostra números, mas toda mudança de Valor aparece na hora — um sussurro
 * com a direção e o nome, um marco quando um Valor fica forte, e a história "Como você mudou".
 */

/** Uma mudança registrada na história do personagem ("Como você mudou"). */
export interface PsycheShift {
  /** tempo jogado (s) */
  t: number;
  /** o que causou (ato, conversa) */
  cause: string;
  changes: Array<{ kind: 'value'; id: ValueId; dir: 1 | -1 }>;
}
export const SHIFT_HISTORY_MAX = 40;

const VALUE_ART: Partial<Record<ValueId, 'O'>> = { power: 'O', knowledge: 'O' };

/** "A Misericórdia cresce em você." / "O Poder perde força em você." */
export function whisperText(id: ValueId, dir: 1 | -1): string {
  return `${VALUE_ART[id] ?? 'A'} ${VALUE_NAMES[id]} ${dir > 0 ? 'cresce' : 'perde força'} em você.`;
}

/** Diferenças de Valor entre dois retratos. */
export function diffValues(a: Values, b: Values): Array<{ id: ValueId; d: number }> {
  const out: Array<{ id: ValueId; d: number }> = [];
  for (const id of VALUE_IDS) {
    const d = b[id] - a[id];
    if (Math.abs(d) > 1e-6) out.push({ id, d });
  }
  return out;
}

export type StrongState = 'for' | 'against' | 'none';
export const strongState = (v: number): StrongState => (v >= STRONG_VALUE ? 'for' : v <= -STRONG_VALUE ? 'against' : 'none');
