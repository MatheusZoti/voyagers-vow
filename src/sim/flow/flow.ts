import { approach, clamp } from '../math';
import { intensityOf } from '../psyche/emotions';
import { activeCrisis, stressBand, type PsycheState } from '../psyche/psyche';

// ---------------------------------------------------------------------------
// Posturas básicas (GDD, Pilar 1). Só uma ativa por vez. O Véu e o Ímpeto
// deixaram de ser posturas: agora são os dois lados da Maré (ver abaixo).
// ---------------------------------------------------------------------------

export const POSTURE_IDS = ['open', 'silence', 'gaze'] as const;
export type Posture = (typeof POSTURE_IDS)[number];

export interface PostureDef {
  name: string;
  key: string;
  /** consumo de Fluxo por segundo */
  drain: number;
  incomingMult: number;
  regenMult: number;
  allowsTechniques: boolean;
  color: string;
  desc: string;
}

export const POSTURES: Record<Posture, PostureDef> = {
  open: {
    name: 'Aberta',
    key: '',
    drain: 0,
    incomingMult: 1,
    regenMult: 1,
    allowsTechniques: true,
    color: '#dfe8f0',
    desc: 'Sem postura: só a Maré decide entre ataque e defesa.',
  },
  silence: {
    name: 'Silêncio',
    key: 'Shift',
    drain: 0,
    incomingMult: 2,
    regenMult: 3,
    allowsTechniques: false,
    color: '#6d7a8c',
    desc: 'Some para inimigos comuns que ainda não te viram (o alcance deles encolhe com a Maestria); Fluxo regenera 3x. Dano recebido dobrado, sem técnicas. Aperte Shift de novo para sair.',
  },
  gaze: {
    name: 'Olhar',
    key: 'Tab',
    drain: 2.5,
    incomingMult: 1,
    regenMult: 0.5,
    allowsTechniques: true,
    color: '#c58cff',
    desc: 'Revela inimigos em Sombra e armadilhas. Aperte Tab de novo para fechar.',
  },
};

// ---------------------------------------------------------------------------
// Reserva de Fluxo
// ---------------------------------------------------------------------------

export const BASE_FLOW_MAX = 100;
export const BASE_FLOW_REGEN = 4; // por segundo

// ---------------------------------------------------------------------------
// Maré: distribui o Fluxo entre ataque e defesa em 5 degraus.
//   «« Véu forte   · Def +30%, Atk −30%, −2% do Fluxo/s
//   «  Véu         · Def +15%, Atk −15%, −1% do Fluxo/s
//   •  neutra      · sem efeito
//   »  Ímpeto      · Atk +15%, Def −15%, −1% do Fluxo/s
//   »» Ímpeto forte · Atk +30%, Def −30%, −2% do Fluxo/s
// Roda do mouse (ou Z/X) move um degrau por vez. O lado da defesa é o Véu; o do ataque, o Ímpeto.
// ---------------------------------------------------------------------------

/** degraus de cada lado do centro */
export const TIDE_LEVELS = 2;
export const TIDE_STEP = 0.5 / TIDE_LEVELS;
export const TIDE_BASE_SPEED = 1.6; // fração por segundo
/** bônus/penalidade por degrau */
export const TIDE_SWING_PER_LEVEL = 0.15;
/** fração do Fluxo máximo drenada por segundo, por degrau */
export const TIDE_DRAIN_PER_LEVEL = 0.01;

export interface TideState {
  /** fração do Fluxo no ataque (0 = toda defesa, 1 = todo ataque) */
  target: number;
  value: number;
  /** último instante em que a Maré desceu rumo à defesa dentro da zona defensiva */
  lastDefenseShiftAt: number;
}

export const createTide = (): TideState => ({ target: 0.5, value: 0.5, lastDefenseShiftAt: -999 });

/** degrau contínuo: −2 (toda defesa) … +2 (todo ataque) */
const tideLevels = (attack: number) => (attack - 0.5) / TIDE_STEP;
/** degrau inteiro mais próximo (−2 … +2) */
export const tideLevel = (attack: number) => Math.round(tideLevels(attack));

export const tideOutgoing = (attack: number) => 1 + TIDE_SWING_PER_LEVEL * tideLevels(attack); // 0.7x … 1.3x
export const tideIncoming = (attack: number) => 1 + TIDE_SWING_PER_LEVEL * tideLevels(attack); // 0.7x … 1.3x
/** fração do Fluxo máximo drenada por segundo */
export const tideDrain = (attack: number) => TIDE_DRAIN_PER_LEVEL * Math.abs(tideLevels(attack));

export const TIDE_SIDES = {
  veil: { name: 'Véu', color: '#bfe3ff' },
  impetus: { name: 'Ímpeto', color: '#ff9a3d' },
} as const;

/** rótulo curto do degrau */
export function tideLabel(level: number): string {
  if (level <= -2) return '«« Def +30%';
  if (level === -1) return '« Def +15%';
  if (level === 1) return 'Atk +15% »';
  if (level >= 2) return 'Atk +30% »»';
  return '• neutra';
}

// ---------------------------------------------------------------------------
// Modificadores do Fluxo vindos da Psique (GDD, "Emoções alteram o Fluxo em combate")
// ---------------------------------------------------------------------------

export interface FlowMods {
  outgoing: number;
  incoming: number;
  regen: number;
  /** multiplicador do custo de técnicas */
  techniqueCost: number;
  /** multiplicador do custo das posturas */
  postureDrain: number;
  /** multiplicador da drenagem da Maré fora do centro */
  tideDrain: number;
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

/** `tide` é o valor atual da Maré (0 = defesa, 1 = ataque). */
export function computeFlowMods(p: PsycheState, posture: Posture, tide = 0.5): FlowMods {
  const m: FlowMods = {
    outgoing: 1,
    incoming: 1,
    regen: 1,
    techniqueCost: 1,
    postureDrain: 1,
    tideDrain: 1,
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

  const level = tideLevel(tide);
  // Fúria: Ímpeto mais forte; Maré lenta para voltar à defesa.
  if (level > 0) m.outgoing *= 1 + 0.3 * fury;
  m.tideToDefense *= 1 - 0.6 * fury;
  // Medo: Véu mais forte; Ímpeto custa mais.
  if (level < 0) m.incoming *= 1 - 0.25 * fear;
  if (level > 0) m.tideDrain *= 1 + 0.6 * fear;
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
      m.tideDrain *= 2;
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
  // Descer rumo à defesa dentro da zona defensiva (« ou ««) abre a janela da Maré perfeita.
  if (t.value < before && t.value <= 0.3) t.lastDefenseShiftAt = playTime;
}

export function shiftTide(t: TideState, steps: number): void {
  const level = clamp(Math.round(tideLevels(t.target)) + steps, -TIDE_LEVELS, TIDE_LEVELS);
  t.target = 0.5 + level * TIDE_STEP;
}
