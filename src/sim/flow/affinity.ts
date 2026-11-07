import type { TraitId, Traits } from '../psyche/traits';

/**
 * As seis afinidades, na ordem do hexágono (cada uma é vizinha da anterior e da próxima).
 * Vigor–Mutação–Forja–Singular–Domínio–Projeção–(Vigor)
 */
export const AFFINITY_RING = ['vigor', 'mutation', 'forge', 'singular', 'dominion', 'projection'] as const;
export type Affinity = (typeof AFFINITY_RING)[number];

export const AFFINITY_NAMES: Record<Affinity, string> = {
  vigor: 'Vigor',
  mutation: 'Mutação',
  forge: 'Forja',
  singular: 'Singular',
  dominion: 'Domínio',
  projection: 'Projeção',
};

export const AFFINITY_DESC: Record<Affinity, string> = {
  vigor: 'Fortalece corpo, armas e cura.',
  mutation: 'Muda as propriedades do Fluxo: elétrico, elástico, cortante.',
  forge: 'Materializa objetos de Fluxo.',
  singular: 'Regras únicas que quebram o sistema.',
  dominion: 'Controla seres e objetos.',
  projection: 'Lança o Fluxo à distância e o mantém longe do corpo.',
};

export const AFFINITY_COLORS: Record<Affinity, string> = {
  vigor: '#e8b04a',
  mutation: '#7fd3ff',
  forge: '#b48cff',
  singular: '#ff6fae',
  dominion: '#6bdc8f',
  projection: '#ff7a4a',
};

/** Distância no hexágono: 0 (mesma), 1 (vizinha), 2 (duas casas), 3 (oposta). */
export function hexDistance(a: Affinity, b: Affinity): number {
  const i = AFFINITY_RING.indexOf(a);
  const j = AFFINITY_RING.indexOf(b);
  const d = Math.abs(i - j);
  return Math.min(d, AFFINITY_RING.length - d);
}

/** Penalidade de nível no Elo para técnicas de outra afinidade: vizinha -1, duas casas -2, oposta -3. */
export function affinityPenalty(character: Affinity, technique: Affinity): number {
  return hexDistance(character, technique);
}

/**
 * Tabela "Psique define a afinidade". Cada entrada lista traços que puxam para cima (+) ou
 * para baixo (-). Singular não aparece: só surge por Transe a partir de Forja ou Domínio.
 */
const AFFINITY_PULLS: Record<Exclude<Affinity, 'singular'>, Array<[TraitId, 1 | -1]>> = {
  vigor: [
    ['perseverance', 1],
    ['sincerity', 1],
    ['imagination', -1],
  ],
  mutation: [
    ['imagination', 1],
    ['impulsivity', 1],
    ['sincerity', -1],
  ],
  forge: [
    ['discipline', 1],
    ['anxiety', 1],
  ],
  dominion: [
    ['competitiveness', 1],
    ['pride', 1],
    ['empathy', -1],
  ],
  projection: [
    ['wrath', 1],
    ['impulsivity', 1],
    ['detachment', 1],
  ],
};

export function affinityScores(traits: Traits): Record<Exclude<Affinity, 'singular'>, number> {
  const out = {} as Record<Exclude<Affinity, 'singular'>, number>;
  for (const [aff, pulls] of Object.entries(AFFINITY_PULLS) as Array<[Exclude<Affinity, 'singular'>, Array<[TraitId, 1 | -1]>]>) {
    let s = 0;
    for (const [t, dir] of pulls) s += (traits[t] - 50) * dir;
    out[aff] = s / pulls.length;
  }
  return out;
}

/** O Rito do Cálice: lê os traços e devolve a afinidade natural. */
export function revealAffinity(traits: Traits): Affinity {
  const scores = affinityScores(traits);
  let best: Affinity = 'vigor';
  let bestScore = -Infinity;
  for (const aff of AFFINITY_RING) {
    if (aff === 'singular') continue;
    const s = scores[aff];
    if (s > bestScore) {
      bestScore = s;
      best = aff;
    }
  }
  return best;
}
