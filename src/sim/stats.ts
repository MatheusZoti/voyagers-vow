import type { Character } from './character';
import { AFFINITY_NAMES, type Affinity } from './flow/affinity';
import { BASE_FLOW_MAX, BASE_FLOW_REGEN } from './flow/flow';
import { itemDef, itemName, itemStats, RESONANCE_MULT, resonanceState, SLOT_NAMES, SLOTS, WEAPON_FORMS, type ItemStat, type WeaponForm } from './items';
import { VALUE_NAMES } from './psyche/traits';

/**
 * Atributos derivados do personagem. Não há pontos para distribuir: cada atributo é a soma
 * do que o personagem é e do que veste (nível, Maestria, equipamento, Pactos). A simulação
 * lê só daqui, e a ficha mostra de onde vem cada número.
 *
 * Efeitos do momento (emoções, postura, Maré) continuam na simulação, por cima destes valores.
 */

export type StatId = 'hp' | 'flowMax' | 'flowRegen' | 'power' | 'guard' | 'speed' | 'flowCost' | 'tideSpeed' | 'veil' | 'focus';

export interface StatPart {
  /** de onde vem (ex.: "Nível 4", "Peito: Gibão acolchoado") */
  source: string;
  value: number;
}

export interface StatLine {
  id: StatId;
  name: string;
  /** como mostrar: número, por segundo, multiplicador (×) ou porcentagem */
  kind: 'flat' | 'perSec' | 'mult' | 'pct';
  value: number;
  parts: StatPart[];
  desc: string;
  /** efeito especial (só aparece na ficha quando algo o concede) */
  special?: boolean;
}

export interface CharacterStats {
  /** vida máxima */
  hp: number;
  /** reserva máxima de Fluxo (antes das emoções) */
  flowMax: number;
  /** regeneração de Fluxo por segundo (antes da postura e das emoções) */
  flowRegen: number;
  /** multiplicador de todo o dano causado */
  power: number;
  /** fração do dano recebido que é absorvida (0 a GUARD_CAP) */
  guard: number;
  /** velocidade de caminhada (m/s) */
  speed: number;
  /** multiplicador do custo de Fluxo das magias (menor = mais barato) */
  flowCost: number;
  /** multiplicador da velocidade da Maré */
  tideSpeed: number;
  /** dano absorvido a mais com a Maré na defesa */
  veil: number;
  /** Foco: magias desta afinidade ficam mais fortes e mais baratas */
  focus: { affinity: Affinity; power: number; cost: number } | null;
  /** forma da arma (decide o Golpe básico) */
  weapon: WeaponForm;
  lines: StatLine[];
}

/** Vida por nível acima do 1. */
export const HP_PER_LEVEL = 12;
/** Fluxo máximo por nível acima do 1. */
export const FLOW_PER_LEVEL = 3;
/** A Guarda nunca absorve mais do que isto. */
export const GUARD_CAP = 0.6;
/** Tetos dos efeitos especiais. */
export const FLOW_COST_FLOOR = 0.7;
export const VEIL_CAP = 0.25;
export const BASE_HP = 100;
export const BASE_SPEED = 5.2;

/**
 * Faixa de nível recomendada para cada tier de região (1–8). As faixas se sobrepõem
 * um nível: quem está no topo de uma já pode tentar a próxima.
 */
export function tierLevels(tier: number): { min: number; max: number } {
  const t = Math.max(1, Math.min(8, Math.round(tier)));
  return { min: 1 + 4 * (t - 1), max: 5 + 4 * (t - 1) };
}

export function computeStats(c: Character): CharacterStats {
  const lv = c.level - 1;
  // O que cada peça vestida soma, por atributo.
  const gear: Partial<Record<ItemStat, StatPart[]>> = {};
  let weapon: WeaponForm = 'fists';
  let focusAff: Affinity | null = null;
  for (const slot of SLOTS) {
    const it = c.equipment?.[slot];
    const d = it && itemDef(it);
    if (!it || !d) continue;
    if (slot === 'weapon' && d.form) weapon = d.form;
    if (slot === 'focus' && it.affinity) focusAff = it.affinity;
    const res = resonanceState(it, c.psyche.values);
    const k = res ? RESONANCE_MULT[res] : 1;
    for (const [stat, v] of Object.entries(itemStats(it)) as Array<[ItemStat, number]>) {
      if (!v) continue;
      (gear[stat] ??= []).push({ source: `${SLOT_NAMES[slot]}: ${itemName(it)}`, value: v });
      // Ressonância com a Psique: só mexe no que o item dá de bom.
      if (k !== 1 && v > 0 && it.resonance)
        gear[stat]!.push({ source: `${k > 1 ? 'Ressonância' : 'Dissonância'} (${VALUE_NAMES[it.resonance]})`, value: v * (k - 1) });
    }
  }
  const from = (k: ItemStat) => gear[k] ?? [];

  const hpParts: StatPart[] = [{ source: 'Base', value: BASE_HP }];
  if (lv > 0) hpParts.push({ source: `Nível ${c.level}`, value: HP_PER_LEVEL * lv });
  hpParts.push(...from('hp'));
  if (c.lifeCostLost > 0) hpParts.push({ source: 'Pacto: Pago com a minha vida', value: -c.lifeCostLost });
  const hp = Math.max(20, Math.round(sum(hpParts)));

  const flowParts: StatPart[] = [{ source: 'Base', value: BASE_FLOW_MAX }];
  if (lv > 0) flowParts.push({ source: `Nível ${c.level}`, value: FLOW_PER_LEVEL * lv });
  flowParts.push(...from('flowMax'));
  const flowMax = sum(flowParts);

  const regenParts: StatPart[] = [{ source: 'Base', value: BASE_FLOW_REGEN }, ...from('flowRegen')];
  const flowRegen = sum(regenParts);

  const powerParts: StatPart[] = [{ source: 'Base', value: 1 }, ...from('power')];
  const power = sum(powerParts);

  const guardParts = from('guard');
  const guard = Math.min(GUARD_CAP, Math.max(0, sum(guardParts)));

  const speedParts: StatPart[] = [{ source: 'Base', value: BASE_SPEED }, ...from('speed')];
  const speed = Math.max(2, sum(speedParts));

  const costParts = from('flowCost');
  const flowCost = Math.max(FLOW_COST_FLOOR, 1 - sum(costParts));
  const tideParts = from('tideSpeed');
  const tideSpeed = 1 + sum(tideParts);
  const veilParts = from('veil');
  const veil = Math.min(VEIL_CAP, sum(veilParts));
  const focusPower = sum(from('focusPower'));
  const focus = focusAff ? { affinity: focusAff, power: 1 + focusPower, cost: 1 - sum(from('focusCost')) } : null;

  const form = WEAPON_FORMS[weapon];
  const lines: StatLine[] = [
    { id: 'hp', name: 'Vida', kind: 'flat', value: hp, parts: hpParts, desc: 'Quanto dano você aguenta. Cresce com o nível e com elmos e armaduras.' },
    {
      id: 'flowMax',
      name: 'Fluxo máximo',
      kind: 'flat',
      value: flowMax,
      parts: flowParts,
      desc: 'A reserva que paga magias, posturas e a Maré. Cresce com o nível e com a Maestria de Capacidade. O Luto encolhe a reserva no momento.',
    },
    {
      id: 'flowRegen',
      name: 'Regeneração de Fluxo',
      kind: 'perSec',
      value: flowRegen,
      parts: regenParts,
      desc: 'Fluxo recuperado por segundo. Cajados e afixos da Fonte aumentam; a postura e a Calma mudam isso no momento.',
    },
    {
      id: 'power',
      name: 'Poder',
      kind: 'mult',
      value: power,
      parts: powerParts,
      desc: `Multiplica todo dano que você causa (golpes e magias). Vem da arma. Golpe básico agora: ${form.name}. ${form.desc}`,
    },
    {
      id: 'guard',
      name: 'Guarda',
      kind: 'pct',
      value: guard,
      parts: guardParts,
      desc: `Parte do dano recebido que é absorvida, até ${Math.round(GUARD_CAP * 100)}%. Vem de elmos e armaduras. O Véu e a Maré defendem por cima disso.`,
    },
    { id: 'speed', name: 'Velocidade', kind: 'flat', value: speed, parts: speedParts, desc: 'Metros por segundo caminhando. Botas aumentam; armaduras pesadas reduzem.' },
    {
      id: 'flowCost',
      name: 'Magias mais baratas',
      kind: 'pct',
      value: 1 - flowCost,
      parts: costParts,
      desc: `Todas as magias custam menos Fluxo (no máximo ${Math.round((1 - FLOW_COST_FLOOR) * 100)}%).`,
      special: true,
    },
    { id: 'tideSpeed', name: 'Maré mais rápida', kind: 'pct', value: tideSpeed - 1, parts: tideParts, desc: 'A Maré troca de lado mais depressa.', special: true },
    {
      id: 'veil',
      name: 'Véu mais forte',
      kind: 'pct',
      value: veil,
      parts: veilParts,
      desc: `Com a Maré na defesa, absorve esta parte a mais do dano (até ${Math.round(VEIL_CAP * 100)}%).`,
      special: true,
    },
    {
      id: 'focus',
      name: focus ? `Foco: ${AFFINITY_NAMES[focus.affinity]}` : 'Foco',
      kind: 'pct',
      value: focusPower,
      parts: from('focusPower'),
      desc: focus
        ? `Magias de ${AFFINITY_NAMES[focus.affinity]} causam +${Math.round(focusPower * 100)}% de dano e custam ${Math.round((1 - focus.cost) * 100)}% menos Fluxo. A regra de equipar não muda.`
        : 'Um amuleto de Foco fortalece as magias de uma afinidade.',
      special: true,
    },
  ];
  return { hp, flowMax, flowRegen, power, guard, speed, flowCost, tideSpeed, veil, focus, weapon, lines };
}

const sum = (parts: StatPart[]) => parts.reduce((a, p) => a + p.value, 0);

/** Texto curto de um valor de atributo. */
export function formatStat(kind: StatLine['kind'], v: number, signed = false): string {
  const sign = signed && v > 0 ? '+' : '';
  switch (kind) {
    case 'pct':
      return `${sign}${Math.round(v * 100)}%`;
    case 'mult':
      return signed ? `${sign}${Math.round(v * 100)}%` : `×${v.toFixed(2)}`;
    case 'perSec':
      return `${sign}${Number.isInteger(v) ? v : v.toFixed(1)}/s`;
    default:
      return `${sign}${Math.round(v * 100) / 100}`;
  }
}
