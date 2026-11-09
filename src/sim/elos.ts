import type { Affinity } from './flow/affinity';
import { affinityPenalty, minSlotFor } from './flow/affinity';
import { STRONG_VALUE, type ValueId, type Values } from './psyche/values';

/**
 * Grade de Elos (GDD, Pilar 4). 8 Elos, um de cada nível. Restrições (Pactos) elevam o nível
 * efetivo; a técnica recebe pontos e potência do nível efetivo, mas paga custo e recarga do Elo real.
 */

export interface EloRow {
  points: number;
  restrictions: number;
  /** % da reserva de Fluxo */
  cost: number;
  cooldown: number;
}

export const ELO_TABLE: Record<number, EloRow> = {
  1: { points: 0, restrictions: 1, cost: 3, cooldown: 2 },
  2: { points: 2, restrictions: 1, cost: 5, cooldown: 4 },
  3: { points: 4, restrictions: 2, cost: 8, cooldown: 6 },
  4: { points: 6, restrictions: 2, cost: 11, cooldown: 9 },
  5: { points: 8, restrictions: 3, cost: 15, cooldown: 12 },
  6: { points: 10, restrictions: 3, cost: 20, cooldown: 16 },
  7: { points: 12, restrictions: 4, cost: 26, cooldown: 22 },
  8: { points: 14, restrictions: 4, cost: 33, cooldown: 30 },
};
/** Faixa Além-limite: só alcançável com Restrições. */
export const BEYOND_POINTS: Record<number, number> = { 9: 16, 10: 18, 11: 20, 12: 22 };
export const MAX_EFFECTIVE = 12;
export const MAX_RESTRICTION_BONUS = 4;

export function pointsForLevel(effective: number): number {
  if (effective <= 8) return ELO_TABLE[Math.max(1, effective)]!.points;
  return BEYOND_POINTS[Math.min(effective, MAX_EFFECTIVE)]!;
}

/** Potência da técnica pelo nível efetivo. */
export const levelPower = (effective: number) => 1 + 0.3 * (effective - 1);

// ---------------------------------------------------------------------------
// Pactos (Restrições). Lista curada.
// ---------------------------------------------------------------------------

export const PACT_IDS = [
  'eliteOnly',
  'recentlyHit',
  'lowFlow',
  'missLock',
  'neverFlee',
  'lifeCost',
  'bloodOath',
  'fullHealth',
  'closeQuarters',
  'surrounded',
  'exposed',
  'bloodPrice',
  'mercyOath',
] as const;
export type PactId = (typeof PACT_IDS)[number];

export interface PactDef {
  name: string;
  /** a regra exata, como o jogador lê no editor */
  desc: string;
  level: number;
  onBreak: string;
  /** valor ao qual a cláusula se alinha */
  value: ValueId | null;
  /** juramentos podem ser quebrados; restrições só deixam de se aplicar */
  oath: boolean;
}

/** Cada nível de Restrição soma exatamente 1 ao nível efetivo da técnica. */
export const PACTS: Record<PactId, PactDef> = {
  eliteOnly: {
    name: 'Só contra elites e chefes',
    desc: 'A técnica não tem efeito em inimigos comuns.',
    level: 1,
    onBreak: 'Não se aplica (restrição de alvo)',
    value: 'power',
    oath: false,
  },
  recentlyHit: {
    name: 'Só depois de receber dano',
    desc: 'Só pode ser usada até 3 s depois de você levar um golpe.',
    level: 1,
    onBreak: 'Não se aplica (restrição de estado)',
    value: 'vengeance',
    oath: false,
  },
  lowFlow: {
    name: 'Só com pouco Fluxo',
    desc: 'Só pode ser usada com a reserva de Fluxo abaixo de 30%.',
    level: 2,
    onBreak: 'Não se aplica (restrição de estado)',
    value: 'freedom',
    oath: false,
  },
  missLock: {
    name: 'Se errar, perco o Fluxo',
    desc: 'Se o golpe não acertar ninguém, sua reserva vai a zero e não regenera por 20 s.',
    level: 2,
    onBreak: 'Penalidade automática',
    value: 'law',
    oath: false,
  },
  neverFlee: {
    name: 'Juro nunca fugir de um chefe',
    desc: 'Se você sair da arena de um chefe durante a luta, este Elo fica selado até a penitência no santuário.',
    level: 2,
    onBreak: 'Elo selado até cumprir uma penitência',
    value: 'loyalty',
    oath: true,
  },
  lifeCost: {
    name: 'Pago com a minha vida',
    desc: 'Cada uso reduz sua vida máxima em 1, para sempre.',
    level: 3,
    onBreak: 'Não se aplica (custo direto)',
    value: null,
    oath: false,
  },
  bloodOath: {
    name: 'Juramento de sangue: não cair',
    desc: 'Você jura não morrer com esta técnica equipada. Se morrer, a penalidade de morte sobe 2 níveis extras e você sente Vergonha.',
    level: 4,
    onBreak: 'Penalidade de morte sobe 2 níveis',
    value: 'loyalty',
    oath: true,
  },
  fullHealth: {
    name: 'Só com a vida quase cheia',
    desc: 'Só pode ser usada com a vida acima de 80%.',
    level: 1,
    onBreak: 'Não se aplica (restrição de estado)',
    value: 'law',
    oath: false,
  },
  closeQuarters: {
    name: 'Só de perto',
    desc: 'Só pode ser usada com um inimigo a até 4 m de você.',
    level: 1,
    onBreak: 'Não se aplica (restrição de alvo)',
    value: 'power',
    oath: false,
  },
  surrounded: {
    name: 'Só cercado',
    desc: 'Só pode ser usada com 3 ou mais inimigos a até 8 m de você.',
    level: 2,
    onBreak: 'Não se aplica (restrição de estado)',
    value: 'vengeance',
    oath: false,
  },
  exposed: {
    name: 'O golpe me expõe',
    desc: 'Depois de usar, você recebe +50% de dano por 4 s.',
    level: 1,
    onBreak: 'Penalidade automática',
    value: 'freedom',
    oath: false,
  },
  bloodPrice: {
    name: 'Pago com sangue',
    desc: 'Cada uso custa 8% da sua vida máxima (nunca abaixo de 1).',
    level: 1,
    onBreak: 'Não se aplica (custo direto)',
    value: 'vengeance',
    oath: false,
  },
  mercyOath: {
    name: 'Juro poupar quem se rende',
    desc: 'Se você executar um inimigo rendido, este Elo fica selado até a penitência no santuário.',
    level: 2,
    onBreak: 'Elo selado até cumprir uma penitência',
    value: 'mercy',
    oath: true,
  },
};

// ---------------------------------------------------------------------------
// Modificadores (pontos de forja)
// ---------------------------------------------------------------------------

export const MOD_IDS = ['damage', 'area', 'range', 'cadence', 'restore', 'stun', 'shatter'] as const;
export type ModId = (typeof MOD_IDS)[number];

export interface ModDef {
  name: string;
  cost: number;
  max: number;
  desc: string;
}

export const MODS: Record<ModId, ModDef> = {
  damage: { name: 'Dano', cost: 1, max: 6, desc: '+20% de dano por ponto' },
  area: { name: 'Área', cost: 2, max: 3, desc: '+30% de raio do impacto' },
  range: { name: 'Alcance', cost: 2, max: 3, desc: '+12% de alcance (nunca além do seu raio de visão)' },
  cadence: { name: 'Cadência', cost: 2, max: 3, desc: '-12% de recarga' },
  restore: { name: 'Restaurar', cost: 3, max: 1, desc: 'Cura 6% da vida máxima ao acertar' },
  stun: { name: 'Abalo', cost: 3, max: 1, desc: 'Atordoa por 0,8 s' },
  shatter: { name: 'Quebra-Guarda', cost: 3, max: 1, desc: 'Sempre ignora armadura' },
};

/** Custo do modificador com o desconto da Maestria (mínimo 1). */
export const modCost = (id: ModId, discount: number) => Math.max(1, MODS[id].cost - discount);

// ---------------------------------------------------------------------------
// Configuração de um Elo e cálculo do nível efetivo
// ---------------------------------------------------------------------------

export interface EloSlot {
  level: number;
  unlocked: boolean;
  technique: string | null;
  restrictions: PactId[];
  mods: Partial<Record<ModId, number>>;
  /** selado por juramento quebrado, até a penitência */
  sealed: boolean;
}

export const newSlot = (level: number, unlocked = false): EloSlot => ({
  level,
  unlocked,
  technique: null,
  restrictions: [],
  mods: {},
  sealed: false,
});

export interface EffectiveInfo {
  slotLevel: number;
  restrictionBonus: number;
  /** +1 se uma Restrição tem um Valor forte a favor, −1 se tem um contra (os dois se anulam) */
  valueBonus: number;
  affinityPenalty: number;
  effective: number;
  beyondLimit: boolean;
  points: number;
  pointsUsed: number;
  costPct: number;
  cooldown: number;
  power: number;
  maxRestrictions: number;
  alignedPact: PactId | null;
}

export function evaluateSlot(
  slot: EloSlot,
  opts: { values: Values; characterAffinity: Affinity; techniqueAffinity: Affinity | null; modDiscount: number },
): EffectiveInfo {
  const row = ELO_TABLE[slot.level];
  if (!row) throw new Error(`Elo inválido: ${slot.level}`);
  const restrictionBonus = slot.restrictions.reduce((s, id) => s + PACTS[id].level, 0);
  // Valor forte a favor de uma Restrição: +1 nível; forte contra: −1 (no máximo um de cada).
  const valueOf = (id: PactId) => {
    const v = PACTS[id].value;
    return v === null ? 0 : opts.values[v];
  };
  const alignedPact = slot.restrictions.find((id) => valueOf(id) >= STRONG_VALUE);
  const aligned = alignedPact !== undefined;
  const contrary = slot.restrictions.some((id) => valueOf(id) <= -STRONG_VALUE);
  const valueBonus = (aligned ? 1 : 0) - (contrary ? 1 : 0);
  const penalty = opts.techniqueAffinity ? affinityPenalty(opts.characterAffinity, opts.techniqueAffinity) : 0;
  const capped = Math.min(slot.level + restrictionBonus + valueBonus, slot.level + MAX_RESTRICTION_BONUS, MAX_EFFECTIVE);
  const effective = Math.max(1, capped - penalty);
  const pointsUsed = (Object.entries(slot.mods) as Array<[ModId, number]>).reduce(
    (s, [id, n]) => s + modCost(id, opts.modDiscount) * n,
    0,
  );
  return {
    slotLevel: slot.level,
    restrictionBonus,
    valueBonus,
    affinityPenalty: penalty,
    effective,
    beyondLimit: effective > 8,
    points: pointsForLevel(effective),
    pointsUsed,
    costPct: row.cost,
    cooldown: row.cooldown,
    power: levelPower(effective),
    maxRestrictions: row.restrictions,
    alignedPact: alignedPact ?? null,
  };
}

/**
 * Uma magia só entra num Elo se o nível resultante não ficar abaixo de 1:
 * Elo mínimo = nível mínimo da magia + distância no pentágono.
 */
export function equipError(slotLevel: number, characterAffinity: Affinity, spellAffinity: Affinity, spellMinLevel = 1): string | null {
  const need = minSlotFor(characterAffinity, spellAffinity, spellMinLevel);
  return slotLevel >= need ? null : `Precisa de Elo ${need} ou maior.`;
}

/** Valida e explica por que uma mudança não cabe. */
export function canAddRestriction(slot: EloSlot, id: PactId, maxPactLevel: number): string | null {
  const row = ELO_TABLE[slot.level]!;
  if (slot.restrictions.includes(id)) return 'Cláusula já está neste Elo.';
  if (PACTS[id].level > maxPactLevel) return `Precisa de mais Maestria na magia: hoje ela aceita Restrições de até +${maxPactLevel}.`;
  if (slot.restrictions.length >= row.restrictions) return `Elo ${slot.level} aceita no máximo ${row.restrictions} Restrição(ões).`;
  return null;
}

export function canAddMod(slot: EloSlot, info: EffectiveInfo, id: ModId, discount: number): string | null {
  const n = slot.mods[id] ?? 0;
  if (n >= MODS[id].max) return `${MODS[id].name} já está no máximo.`;
  if (info.pointsUsed + modCost(id, discount) > info.points) return 'Pontos de forja insuficientes.';
  return null;
}

/** Remove modificadores excedentes quando o nível efetivo cai (ex.: Restrição removida). */
export function trimMods(slot: EloSlot, info: EffectiveInfo, discount: number): void {
  let used = info.pointsUsed;
  const order: ModId[] = ['shatter', 'stun', 'restore', 'cadence', 'area', 'range', 'damage'];
  for (const id of order) {
    while (used > info.points && (slot.mods[id] ?? 0) > 0) {
      slot.mods[id] = (slot.mods[id] ?? 0) - 1;
      used -= modCost(id, discount);
      if (slot.mods[id] === 0) delete slot.mods[id];
    }
  }
}
