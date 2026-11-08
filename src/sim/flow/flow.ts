import { approach, clamp } from '../math';
import { intensityOf } from '../psyche/emotions';
import { activeCrisis, stressBand, type PsycheState } from '../psyche/psyche';

// ---------------------------------------------------------------------------
// Posturas básicas (GDD, Pilar 1). Só uma ativa por vez.
// ---------------------------------------------------------------------------

export const POSTURE_IDS = ['veil', 'silence', 'impetus', 'gaze'] as const;
export type Posture = (typeof POSTURE_IDS)[number];

export interface PostureDef {
  name: string;
  key: string;
  /** consumo de Fluxo por segundo */
  drain: number;
  /** redução de dano recebido (0–1) */
  damageReduction: number;
  outgoingMult: number;
  incomingMult: number;
  regenMult: number;
  allowsTechniques: boolean;
  color: string;
  desc: string;
}

export const POSTURES: Record<Posture, PostureDef> = {
  veil: {
    name: 'Véu',
    key: '1',
    drain: 0.6,
    damageReduction: 0.25,
    outgoingMult: 1,
    incomingMult: 1,
    regenMult: 1,
    allowsTechniques: true,
    color: '#bfe3ff',
    desc: 'Redução de dano constante. Consumo baixo.',
  },
  silence: {
    name: 'Silêncio',
    key: '2',
    drain: 0,
    damageReduction: 0,
    outgoingMult: 1,
    incomingMult: 2,
    regenMult: 3,
    allowsTechniques: false,
    color: '#6d7a8c',
    desc: 'Some para inimigos comuns que ainda não te viram (o alcance deles encolhe com a Maestria); Fluxo regenera 3x. Dano recebido dobrado, sem técnicas.',
  },
  impetus: {
    name: 'Ímpeto',
    key: '3',
    drain: 7,
    damageReduction: 0,
    outgoingMult: 1.5,
    incomingMult: 1,
    regenMult: 0,
    allowsTechniques: true,
    color: '#ff9a3d',
    desc: 'Amplifica o dano de todas as técnicas. Drena a reserva.',
  },
  gaze: {
    name: 'Olhar',
    key: '4',
    drain: 2.5,
    damageReduction: 0,
    outgoingMult: 1,
    incomingMult: 1,
    regenMult: 0.5,
    allowsTechniques: true,
    color: '#c58cff',
    desc: 'Revela inimigos em Sombra e armadilhas. Sem bônus de defesa.',
  },
};

// ---------------------------------------------------------------------------
// Reserva de Fluxo
// ---------------------------------------------------------------------------

export const BASE_FLOW_MAX = 100;
export const BASE_FLOW_REGEN = 4; // por segundo

// ---------------------------------------------------------------------------
// Maré: distribui o Fluxo entre ataque e defesa em tempo real.
// ---------------------------------------------------------------------------

export const TIDE_STEP = 0.1;
export const TIDE_BASE_SPEED = 1.6; // fração por segundo

export interface TideState {
  /** fração do Fluxo no ataque (0 = toda defesa, 1 = todo ataque) */
  target: number;
  value: number;
  /** tempo jogado em que a defesa passou de 70% pela última vez */
  lastDefenseShiftAt: number;
}

export const createTide = (): TideState => ({ target: 0.5, value: 0.5, lastDefenseShiftAt: -999 });

export const tideOutgoing = (attack: number) => 0.5 + attack; // 0.5x … 1.5x
export const tideIncoming = (attack: number) => 0.4 + 1.2 * attack; // 0.4x … 1.6x

// ---------------------------------------------------------------------------
// Modificadores do Fluxo vindos da Psique (GDD, "Emoções alteram o Fluxo em combate")
// ---------------------------------------------------------------------------

export interface FlowMods {
  outgoing: number;
  incoming: number;
  regen: number;
  /** multiplicador do custo de técnicas */
  techniqueCost: number;
  /** multiplicador do custo do Ímpeto e de posturas */
  postureDrain: number;
  tideSpeed: number;
  /** multiplicador extra quando a Maré volta para a defesa */
  tideToDefense: number;
  /** trava a Maré nesse valor (Frenesi = 1) */
  tideLock: number | null;
  signature: number;
  techniquesBlocked: boolean;
  forcedPosture: Posture | null;
  silenceAllowed: boolean;
  moveSpeed: number;
  /** a Euforia faz a barra de Fluxo mentir para cima */
  flowDisplayBias: number;
  flowMaxMult: number;
}

export function computeFlowMods(p: PsycheState, posture: Posture): FlowMods {
  const m: FlowMods = {
    outgoing: 1,
    incoming: 1,
    regen: 1,
    techniqueCost: 1,
    postureDrain: 1,
    tideSpeed: 1,
    tideToDefense: 1,
    tideLock: null,
    signature: 1,
    techniquesBlocked: false,
    forcedPosture: null,
    silenceAllowed: true,
    moveSpeed: 1,
    flowDisplayBias: 0,
    flowMaxMult: 1,
  };
  const e = p.emotions;
  const fury = intensityOf(e, 'fury');
  const fear = intensityOf(e, 'fear');
  const calm = intensityOf(e, 'calm');
  const eup = intensityOf(e, 'euphoria');
  const grief = intensityOf(e, 'grief');
  const pride = intensityOf(e, 'pride');
  const shame = intensityOf(e, 'shame');

  // Fúria: Ímpeto mais forte; Maré lenta para voltar à defesa.
  if (posture === 'impetus') m.outgoing *= 1 + 0.3 * fury;
  m.tideToDefense *= 1 - 0.6 * fury;
  // Medo: Véu mais forte; Ímpeto custa mais.
  if (posture === 'veil') m.incoming *= 1 - 0.25 * fear;
  if (posture === 'impetus') m.postureDrain *= 1 + 0.6 * fear;
  // Calma: Maré mais precisa; regeneração maior.
  m.tideSpeed *= 1 + 0.8 * calm;
  m.regen *= 1 + 0.5 * calm;
  // Euforia: técnicas mais baratas; a barra engana.
  m.techniqueCost *= 1 - 0.35 * eup;
  m.flowDisplayBias = 0.18 * eup;
  // Luto: reserva menor.
  m.flowMaxMult *= 1 - 0.3 * grief;
  // Orgulho: Assinatura mais forte; Silêncio indisponível.
  m.signature *= 1 + 0.25 * pride;
  if (pride > 0.35) m.silenceAllowed = false;
  // Vergonha: Assinatura enfraquecida até a redenção.
  m.signature *= 1 - 0.3 * shame;

  // Estresse.
  const band = stressBand(p.stress);
  if (band === 'inspired') m.regen *= 1.3;
  if (band === 'shaken') m.tideSpeed *= 0.6;

  // Crises.
  switch (activeCrisis(p)) {
    case 'frenzy':
      m.outgoing *= 1.6;
      m.tideLock = 1;
      m.techniqueCost *= 2;
      m.postureDrain *= 2;
      break;
    case 'panic':
      m.moveSpeed *= 1.45;
      m.forcedPosture = 'silence';
      m.techniquesBlocked = true;
      break;
    case 'apathy':
      m.regen = 0;
      break;
    default:
      break;
  }
  return m;
}

/** Avança a Maré rumo ao alvo. `masteryBonus` vem da Maestria da Maré. */
export function tickTide(t: TideState, dt: number, mods: FlowMods, masteryBonus: number, playTime: number): void {
  if (mods.tideLock !== null) {
    t.value = t.target = mods.tideLock;
    return;
  }
  const towardDefense = t.target < t.value;
  const speed = TIDE_BASE_SPEED * mods.tideSpeed * (1 + masteryBonus) * (towardDefense ? mods.tideToDefense : 1);
  const before = t.value;
  t.value = approach(t.value, t.target, Math.max(0.05, speed) * dt);
  if (before > 0.3 && t.value <= 0.3) t.lastDefenseShiftAt = playTime;
}

export function shiftTide(t: TideState, steps: number): void {
  t.target = clamp(Math.round((t.target + steps * TIDE_STEP) * 10) / 10, 0, 1);
}
