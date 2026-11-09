
/**
 * As cinco afinidades do padrão, no pentágono (cada uma é vizinha da anterior e da próxima):
 *
 *            Vigor
 *   Projeção        Mutação
 *     Domínio ── Forja
 *
 * Singular existe no mundo, mas fica fora do padrão: é uma exceção a ser decidida no jogo.
 */
export const AFFINITY_RING = ['vigor', 'mutation', 'forge', 'dominion', 'projection'] as const;
export type Affinity = (typeof AFFINITY_RING)[number];

export const AFFINITY_NAMES: Record<Affinity, string> = {
  vigor: 'Vigor',
  mutation: 'Mutação',
  forge: 'Forja',
  dominion: 'Domínio',
  projection: 'Projeção',
};

export const AFFINITY_DESC: Record<Affinity, string> = {
  vigor: 'Fortalece corpo, armas e cura.',
  mutation: 'Muda as propriedades do Fluxo: elétrico, elástico, cortante.',
  forge: 'Materializa objetos de Fluxo.',
  dominion: 'Controla seres e objetos.',
  projection: 'Lança o Fluxo à distância e o mantém longe do corpo.',
};

/** Como a afinidade costuma jogar — ajuda a escolher na criação. */
export const AFFINITY_PLAYSTYLE: Record<Affinity, string> = {
  vigor: 'Corpo a corpo resistente. Golpes que atravessam armadura e reforços de crítico.',
  mutation: 'Meia distância e caos. Puxa inimigos e encadeia descargas entre eles.',
  forge: 'Controle e golpes amplos. Prende elites em correntes e corta em arco.',
  dominion: 'Controle de multidão. Empurra a horda e vira inimigos uns contra os outros.',
  projection: 'Distância. Lanças que atravessam fileiras e chuva de esferas em área.',
};

export const AFFINITY_COLORS: Record<Affinity, string> = {
  vigor: '#e8b04a',
  mutation: '#7fd3ff',
  forge: '#b48cff',
  dominion: '#6bdc8f',
  projection: '#ff7a4a',
};

export const isAffinity = (v: unknown): v is Affinity => (AFFINITY_RING as readonly unknown[]).includes(v);

/** Distância no pentágono: 0 (a sua), 1 (vizinha), 2 (distante). */
export function hexDistance(a: Affinity, b: Affinity): number {
  const i = AFFINITY_RING.indexOf(a);
  const j = AFFINITY_RING.indexOf(b);
  const d = Math.abs(i - j);
  return Math.min(d, AFFINITY_RING.length - d);
}

/** Penalidade de nível para magias de outra afinidade: vizinha -1, distante -2. */
export function affinityPenalty(character: Affinity, spell: Affinity): number {
  return hexDistance(character, spell);
}

/**
 * Elo mínimo para equipar uma magia: nunca pode ficar abaixo do nível 1.
 * Ex.: personagem de Vigor equipa magia de Vigor no Elo 1, de Mutação no Elo 2, de Forja no Elo 3.
 */
export function minSlotFor(character: Affinity, spell: Affinity, spellMinLevel = 1): number {
  return spellMinLevel + affinityPenalty(character, spell);
}

