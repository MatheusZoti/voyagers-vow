import type { EloSlot, ModId, PactId } from './elos';
import type { Affinity } from './flow/affinity';
import type { Posture } from './flow/flow';

/** Etiquetas de natureza da Assinatura: definem a Ressonância com a Psique. */
export type NatureTag = 'aggressive' | 'protective' | 'deceptive' | 'patient';
export const NATURE_NAMES: Record<NatureTag, string> = {
  aggressive: 'agressiva',
  protective: 'protetora',
  deceptive: 'enganadora',
  patient: 'paciente',
};

export type TechniqueId = 'signature' | 'point';

export interface TechniqueDef {
  id: TechniqueId;
  name: string;
  /** null = técnica universal do Fluxo, sem penalidade de afinidade */
  affinity: Affinity | null;
  minLevel: number;
  baseDamage: number;
  range: number;
  radius: number;
  tags: NatureTag[];
  desc: string;
  /** Restrições que fazem sentido para esta técnica; as outras nem aparecem na lista. */
  pacts: PactId[];
  /** Modificadores de forja que têm efeito nesta técnica. */
  mods: ModId[];
}

/** A fatia vertical: uma Assinatura de Vigor e o Ponto. */
export const TECHNIQUES: Record<TechniqueId, TechniqueDef> = {
  signature: {
    id: 'signature',
    name: 'Punho do Voto',
    affinity: 'vigor',
    minLevel: 1,
    baseDamage: 22,
    range: 2.4,
    radius: 1.1,
    tags: ['aggressive', 'patient'],
    desc: 'Avança e golpeia com o Fluxo no punho. A cada 3 acertos no mesmo alvo, ignora a armadura.',
    pacts: ['eliteOnly', 'recentlyHit', 'lowFlow', 'missLock', 'neverFlee', 'lifeCost', 'bloodOath'],
    mods: ['damage', 'area', 'range', 'cadence', 'restore', 'stun', 'shatter'],
  },
  point: {
    id: 'point',
    name: 'Ponto',
    affinity: null,
    minLevel: 1,
    baseDamage: 0,
    range: 0,
    radius: 0,
    tags: ['aggressive'],
    desc: 'Concentra todo o Fluxo no próximo golpe: crítico gigante. Defesa zero por 2 s.',
    // Ponto não é um golpe em si (carrega o próximo): "se errar" não se aplica.
    pacts: ['eliteOnly', 'recentlyHit', 'lowFlow', 'neverFlee', 'lifeCost', 'bloodOath'],
    // Sem área nem alcance próprios: só o que muda o crítico e a recarga.
    mods: ['damage', 'cadence', 'restore', 'stun', 'shatter'],
  },
};

/** Remove do Elo Restrições e modificadores que não se aplicam à técnica equipada. */
export function sanitizeSlot(slot: EloSlot): void {
  const tech = slot.technique ? TECHNIQUES[slot.technique as TechniqueId] : null;
  if (!tech) {
    slot.restrictions = [];
    slot.mods = {};
    return;
  }
  slot.restrictions = slot.restrictions.filter((id) => tech.pacts.includes(id));
  for (const id of Object.keys(slot.mods) as ModId[]) if (!tech.mods.includes(id)) delete slot.mods[id];
}

/** Tudo o que tem Maestria. */
export type MasteryId = TechniqueId | Posture | 'tide' | 'basic' | 'capacity';
export const MASTERY_IDS: readonly MasteryId[] = ['basic', 'signature', 'point', 'veil', 'silence', 'impetus', 'gaze', 'tide', 'capacity'];
export const MASTERY_NAMES: Record<MasteryId, string> = {
  basic: 'Golpe básico',
  signature: 'Punho do Voto (Assinatura)',
  point: 'Ponto',
  veil: 'Véu',
  silence: 'Silêncio',
  impetus: 'Ímpeto',
  gaze: 'Olhar',
  tide: 'Maré',
  capacity: 'Capacidade do Fluxo',
};

/**
 * Ressonância: etiquetas da Assinatura x traços. Retorna o multiplicador de Maestria
 * (e o custo de Fluxo é dividido por ele).
 */
export function resonance(tags: NatureTag[], tr: Record<string, number>): number {
  const fit: Record<NatureTag, number> = {
    aggressive: ((tr.wrath ?? 50) + (tr.courage ?? 50)) / 2,
    protective: ((tr.empathy ?? 50) + (tr.discipline ?? 50)) / 2,
    deceptive: 100 - (tr.sincerity ?? 50),
    patient: ((tr.perseverance ?? 50) + (tr.discipline ?? 50)) / 2,
  };
  const avg = tags.reduce((s, t) => s + fit[t], 0) / Math.max(1, tags.length);
  if (avg >= 62) return 1.25;
  if (avg <= 38) return 0.5;
  return 1;
}
