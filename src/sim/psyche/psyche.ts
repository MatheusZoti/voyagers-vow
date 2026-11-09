import { clamp } from '../math';
import {
  addEmotion,
  dominantEmotion,
  NEGATIVE_EMOTIONS,
  POSITIVE_EMOTIONS,
  reactTo,
  tickEmotions,
  type Emotion,
  type EmotionId,
  type EmotionMap,
  type PsycheEventKind,
} from './emotions';
import type { TraitId, Traits, Values } from './traits';

// ---------------------------------------------------------------------------
// Estresse e estados extremos
// ---------------------------------------------------------------------------

export type StressBand = 'inspired' | 'stable' | 'shaken' | 'crisis';
export const STRESS_BAND_NAMES: Record<StressBand, string> = {
  inspired: 'Inspirado',
  stable: 'Estável',
  shaken: 'Abalado',
  crisis: 'Crise',
};

export const STRESS_INSPIRED_MAX = 15;
export const STRESS_STABLE_MAX = 60;
export const STRESS_CRISIS = 85;

export function stressBand(stress: number): StressBand {
  if (stress < STRESS_INSPIRED_MAX) return 'inspired';
  if (stress < STRESS_STABLE_MAX) return 'stable';
  if (stress < STRESS_CRISIS) return 'shaken';
  return 'crisis';
}

export type CrisisId = 'frenzy' | 'panic' | 'apathy' | 'rupture';
export const CRISIS_NAMES: Record<CrisisId, string> = {
  frenzy: 'Frenesi',
  panic: 'Pânico',
  apathy: 'Apatia',
  rupture: 'Ruptura',
};
export const CRISIS_DESC: Record<CrisisId, string> = {
  frenzy: 'Dano muito maior, Maré travada no ataque, Fluxo custa o dobro.',
  panic: 'Velocidade alta, Silêncio forçado, técnicas bloqueadas.',
  apathy: 'O Fluxo não regenera até você meditar.',
  rupture: 'A Assinatura muta de forma imprevisível nesta luta.',
};

/** Crises com efeito implementado nesta fatia. Ruptura chega com o editor de Assinatura. */
export const IMPLEMENTED_CRISES: readonly CrisisId[] = ['frenzy', 'panic', 'apathy'];

/** Escolhe o estado extremo pelos traços (o mais extremo entre os implementados). */
export function chooseCrisis(tr: Traits): CrisisId {
  const score: Record<CrisisId, number> = {
    frenzy: tr.wrath,
    panic: tr.anxiety,
    apathy: 100 - tr.perseverance,
    rupture: Math.max(tr.stubbornness, tr.pride),
  };
  let best: CrisisId = 'frenzy';
  for (const c of IMPLEMENTED_CRISES) if (score[c] > score[best]) best = c;
  return best;
}

export const CRISIS_WARNING_S = 3;
export const CRISIS_DURATION_S: Record<CrisisId, number> = { frenzy: 12, panic: 8, apathy: 9999, rupture: 30 };
export const CRISIS_COOLDOWN_S = 30;
export const STRESS_AFTER_CRISIS = 45;

export type CrisisState =
  | { phase: 'none'; cooldown: number }
  | { phase: 'warning'; id: CrisisId; remaining: number }
  | { phase: 'active'; id: CrisisId; remaining: number };

// ---------------------------------------------------------------------------
// Memórias
// ---------------------------------------------------------------------------

export interface Memory {
  kind: PsycheEventKind;
  text: string;
  emotion: EmotionId;
  intensity: number;
  /** tempo jogado (s) do evento mais recente */
  at: number;
  count: number;
}

export const SHORT_MEMORY_MAX = 8;
export const WEAK_MEMORY = 0.3;
export const WEAK_MEMORY_FADE_S = 180;
export const STRONG_MEMORY = 0.75;
export const REPEAT_TO_PROMOTE = 3;

/** Memórias longas deslocam traços aos poucos (aplicado uma vez, na promoção). */
const LONG_MEMORY_DRIFT: Partial<Record<PsycheEventKind, Partial<Record<TraitId, number>>>> = {
  killBoss: { courage: 3, trust: -1 },
  killElite: { courage: 1, competitiveness: 1 },
  death: { anxiety: 2, courage: -1 },
  nearDeath: { courage: 1, anxiety: 1 },
  pactBroken: { pride: -2, sincerity: -1 },
  perfectTide: { discipline: 2 },
  meditate: { discipline: 1, anxiety: -1 },
  heavyHit: { wrath: 1 },
  killStreak: { impulsivity: 1 },
  redemption: { perseverance: 1 },
  retreat: { anxiety: 2, courage: -2 },
};

/**
 * O que você faz muda quem você é: cada ação empurra os traços um pouco, na hora.
 * Muito menor que um diálogo; o efeito aparece com a repetição.
 */
const ACTION_NUDGE: Partial<Record<PsycheEventKind, Partial<Record<TraitId, number>>>> = {
  killElite: { courage: 0.6, competitiveness: 0.3 },
  killBoss: { courage: 1.5 },
  killStreak: { impulsivity: 0.4, wrath: 0.2 },
  perfectTide: { discipline: 0.4 },
  meditate: { discipline: 0.3, anxiety: -0.3 },
  death: { anxiety: 0.8 },
  nearDeath: { courage: 0.3 },
  retreat: { courage: -0.8, anxiety: 0.6 },
  pactBroken: { sincerity: -0.5 },
  redemption: { perseverance: 0.5 },
};

const MEMORY_TEXT: Record<PsycheEventKind, string> = {
  nearDeath: 'Esteve à beira da morte',
  heavyHit: 'Sofreu um golpe brutal',
  killElite: 'Derrubou um inimigo de elite',
  killBoss: 'Venceu o Guardião da Ponte',
  killStreak: 'Abateu vários inimigos em sequência',
  perfectTide: 'Leu o golpe do inimigo no instante certo',
  meditate: 'Meditou em silêncio',
  death: 'Caiu em combate',
  pactBroken: 'Quebrou um juramento',
  redemption: 'Redimiu-se de um juramento quebrado',
  retreat: 'Fugiu de uma luta perdida',
};

// ---------------------------------------------------------------------------
// Estado agregado
// ---------------------------------------------------------------------------

export interface PsycheState {
  traits: Traits;
  values: Values;
  emotions: EmotionMap;
  stress: number;
  crisis: CrisisState;
  shortMemory: Memory[];
  longMemory: Memory[];
}

export function createPsyche(traits: Traits, values: Values): PsycheState {
  return {
    traits,
    values,
    emotions: {},
    stress: 20,
    crisis: { phase: 'none', cooldown: 0 },
    shortMemory: [],
    longMemory: [],
  };
}

export interface PsycheNotice {
  type: 'emotion' | 'memory' | 'longMemory' | 'crisisWarning' | 'crisisStart' | 'crisisEnd';
  text: string;
}

/**
 * Registra um evento: gera emoções filtradas pelos traços e uma memória curta.
 * Abalado amplifica emoções negativas.
 */
export function psycheEvent(p: PsycheState, kind: PsycheEventKind, playTime: number, magnitude = 1): PsycheNotice[] {
  const notices: PsycheNotice[] = [];
  const shaken = stressBand(p.stress) === 'shaken' || p.crisis.phase !== 'none';
  const reactions = reactTo(kind, p.traits, magnitude);
  let strongest = reactions[0];
  for (const r of reactions) {
    addEmotion(p.emotions, r.id, r.intensity, r.duration, shaken && NEGATIVE_EMOTIONS.has(r.id) ? 1.3 : 1);
    if (!strongest || r.intensity > strongest.intensity) strongest = r;
  }
  if (kind === 'redemption') delete p.emotions.shame;
  const nudge = ACTION_NUDGE[kind];
  if (nudge) for (const [t, d] of Object.entries(nudge) as Array<[TraitId, number]>) p.traits[t] = clamp(p.traits[t] + d * magnitude, 0, 100);
  if (strongest) {
    const n = remember(p, kind, strongest.id, Math.min(1, strongest.intensity), playTime);
    if (n) notices.push(n);
  }
  return notices;
}

function remember(p: PsycheState, kind: PsycheEventKind, emotion: EmotionId, intensity: number, at: number): PsycheNotice | null {
  const existing = p.shortMemory.find((m) => m.kind === kind);
  if (existing) {
    existing.count += 1;
    existing.at = at;
    existing.intensity = Math.max(existing.intensity, intensity);
    existing.emotion = emotion;
  } else {
    p.shortMemory.unshift({ kind, text: MEMORY_TEXT[kind], emotion, intensity, at, count: 1 });
  }
  const mem = existing ?? p.shortMemory[0]!;
  // Promoção para memória longa.
  if ((mem.intensity >= STRONG_MEMORY || mem.count >= REPEAT_TO_PROMOTE) && !p.longMemory.some((m) => m.kind === kind)) {
    p.longMemory.push({ ...mem });
    const drift = LONG_MEMORY_DRIFT[kind];
    if (drift) for (const [t, d] of Object.entries(drift) as Array<[TraitId, number]>) p.traits[t] = clamp(p.traits[t] + d, 0, 100);
    return { type: 'longMemory', text: `Memória marcante: ${mem.text.toLowerCase()}` };
  }
  // Mantém no máximo 8; os mais fracos saem primeiro.
  if (p.shortMemory.length > SHORT_MEMORY_MAX) {
    p.shortMemory.sort((a, b) => b.intensity - a.intensity);
    p.shortMemory.length = SHORT_MEMORY_MAX;
  }
  return existing ? null : { type: 'memory', text: mem.text };
}

export interface PsycheTickContext {
  playTime: number;
  inCombat: boolean;
  meditating: boolean;
  /** fração das necessidades vazias (0–1); a fatia usa só "lutar" e "descansar" */
  unmetNeeds: number;
}

export function tickPsyche(p: PsycheState, dt: number, ctx: PsycheTickContext): PsycheNotice[] {
  const notices: PsycheNotice[] = [];
  tickEmotions(p.emotions, dt);

  let neg = 0;
  let pos = 0;
  for (const e of Object.values(p.emotions) as Emotion[]) {
    if (NEGATIVE_EMOTIONS.has(e.id)) neg += e.intensity;
    else if (POSITIVE_EMOTIONS.has(e.id)) pos += e.intensity;
  }
  let dStress = neg * 2.2 - pos * 1.8 + ctx.unmetNeeds * 0.6;
  if (!ctx.inCombat) dStress -= 0.4;
  if (ctx.meditating) dStress -= 4;
  if (p.crisis.phase === 'none') p.stress = clamp(p.stress + dStress * dt, 0, 100);

  // Memórias fracas somem com o tempo.
  p.shortMemory = p.shortMemory.filter((m) => m.intensity >= WEAK_MEMORY || ctx.playTime - m.at < WEAK_MEMORY_FADE_S);

  const c = p.crisis;
  switch (c.phase) {
    case 'none':
      c.cooldown = Math.max(0, c.cooldown - dt);
      if (p.stress >= STRESS_CRISIS && c.cooldown <= 0) {
        const id = chooseCrisis(p.traits);
        p.crisis = { phase: 'warning', id, remaining: CRISIS_WARNING_S };
        notices.push({ type: 'crisisWarning', text: `${CRISIS_NAMES[id]} se aproxima…` });
      }
      break;
    case 'warning':
      c.remaining -= dt;
      if (c.remaining <= 0) {
        p.crisis = { phase: 'active', id: c.id, remaining: CRISIS_DURATION_S[c.id] };
        notices.push({ type: 'crisisStart', text: `${CRISIS_NAMES[c.id]}! ${CRISIS_DESC[c.id]}` });
      }
      break;
    case 'active':
      c.remaining -= dt;
      if (c.id === 'apathy' && ctx.meditating) c.remaining = Math.min(c.remaining, 0);
      if (c.remaining <= 0) {
        p.crisis = { phase: 'none', cooldown: CRISIS_COOLDOWN_S };
        p.stress = STRESS_AFTER_CRISIS;
        notices.push({ type: 'crisisEnd', text: `${CRISIS_NAMES[c.id]} passou.` });
      }
      break;
  }
  return notices;
}

export const activeCrisis = (p: PsycheState): CrisisId | null => (p.crisis.phase === 'active' ? p.crisis.id : null);
export const dominant = (p: PsycheState) => dominantEmotion(p.emotions);
export { addEmotion };

/** Frase que descreve um evento da Psique (memórias, história de mudanças). */
export const eventText = (kind: PsycheEventKind): string => MEMORY_TEXT[kind];
