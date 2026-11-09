import type { Character } from './character';
import { BASE_FLOW_MAX, BASE_FLOW_REGEN } from './flow/flow';
import { displayLevel } from './mastery';

/**
 * Atributos derivados do personagem. Não há pontos para distribuir: cada atributo é a soma
 * do que o personagem é e do que carrega (nível, Maestria, equipamento, Pactos). A simulação
 * lê só daqui, e a ficha mostra de onde vem cada número.
 *
 * Efeitos do momento (emoções, postura, Maré) continuam na simulação, por cima destes valores.
 */

export type StatId = 'hp' | 'flowMax' | 'flowRegen' | 'power' | 'guard' | 'speed';

export interface StatPart {
  /** de onde vem (ex.: "Nível 4", "Maestria: Capacidade 3") */
  source: string;
  value: number;
}

export interface StatLine {
  id: StatId;
  name: string;
  /** como mostrar: número inteiro, por segundo, multiplicador (×) ou porcentagem */
  kind: 'flat' | 'perSec' | 'mult' | 'pct';
  value: number;
  parts: StatPart[];
  desc: string;
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
  lines: StatLine[];
}

/** Vida por nível acima do 1. */
export const HP_PER_LEVEL = 12;
/** Fluxo máximo por nível acima do 1. */
export const FLOW_PER_LEVEL = 3;
/** Fluxo máximo por nível de Maestria de Capacidade acima do 1. */
export const FLOW_PER_CAPACITY = 4;
/** Poder por nível acima do 1 (provisório: vai migrar para as armas). */
export const POWER_PER_LEVEL = 0.04;
/** A Guarda nunca absorve mais do que isto. */
export const GUARD_CAP = 0.6;
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
  const cap = displayLevel(c.mastery.capacity) - 1;

  const hpParts: StatPart[] = [{ source: 'Base', value: BASE_HP }];
  if (lv > 0) hpParts.push({ source: `Nível ${c.level}`, value: HP_PER_LEVEL * lv });
  if (c.lifeCostLost > 0) hpParts.push({ source: 'Pacto: Pago com a minha vida', value: -c.lifeCostLost });
  const hp = Math.max(20, sum(hpParts));

  const flowParts: StatPart[] = [{ source: 'Base', value: BASE_FLOW_MAX }];
  if (lv > 0) flowParts.push({ source: `Nível ${c.level}`, value: FLOW_PER_LEVEL * lv });
  if (cap > 0) flowParts.push({ source: `Maestria: Capacidade ${cap + 1}`, value: FLOW_PER_CAPACITY * cap });
  const flowMax = sum(flowParts);

  const regenParts: StatPart[] = [{ source: 'Base', value: BASE_FLOW_REGEN }];
  const flowRegen = sum(regenParts);

  const powerParts: StatPart[] = [{ source: 'Base', value: 1 }];
  if (lv > 0) powerParts.push({ source: `Nível ${c.level}`, value: POWER_PER_LEVEL * lv });
  const power = sum(powerParts);

  const guardParts: StatPart[] = [];
  const guard = Math.min(GUARD_CAP, Math.max(0, sum(guardParts)));

  const speedParts: StatPart[] = [{ source: 'Base', value: BASE_SPEED }];
  const speed = sum(speedParts);

  return {
    hp,
    flowMax,
    flowRegen,
    power,
    guard,
    speed,
    lines: [
      { id: 'hp', name: 'Vida', kind: 'flat', value: hp, parts: hpParts, desc: 'Quanto dano você aguenta. Cresce com o nível.' },
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
        desc: 'Fluxo recuperado por segundo. A postura e a Calma mudam isso no momento.',
      },
      {
        id: 'power',
        name: 'Poder',
        kind: 'mult',
        value: power,
        parts: powerParts,
        desc: 'Multiplica todo dano que você causa (golpes e magias). Por enquanto vem do nível; as armas vão assumir esse papel.',
      },
      {
        id: 'guard',
        name: 'Guarda',
        kind: 'pct',
        value: guard,
        parts: guardParts,
        desc: `Parte do dano recebido que é absorvida, até ${Math.round(GUARD_CAP * 100)}%. Virá das armaduras. O Véu e a Maré defendem por cima disso.`,
      },
      { id: 'speed', name: 'Velocidade', kind: 'flat', value: speed, parts: speedParts, desc: 'Metros por segundo caminhando. Botas vão mudar isso.' },
    ],
  };
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
      return `${sign}${Math.round(v * 10) / 10}`;
  }
}
