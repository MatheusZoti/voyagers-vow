import { clamp } from '../math';
import type { Traits } from './traits';

/**
 * Emoções (GDD, Pilar 2). Todas existem no modelo; a fatia vertical dá efeito de combate a
 * Fúria, Medo, Calma e Euforia, mais Vergonha (enfraquece a Assinatura até a redenção).
 */
export const EMOTION_IDS = ['fury', 'fear', 'joy', 'grief', 'pride', 'shame', 'euphoria', 'calm'] as const;
export type EmotionId = (typeof EMOTION_IDS)[number];

export const EMOTION_NAMES: Record<EmotionId, string> = {
  fury: 'Fúria',
  fear: 'Medo',
  joy: 'Alegria',
  grief: 'Luto',
  pride: 'Orgulho',
  shame: 'Vergonha',
  euphoria: 'Euforia',
  calm: 'Calma',
};

export const EMOTION_COLORS: Record<EmotionId, string> = {
  fury: '#ff4a3d',
  fear: '#9a7bff',
  joy: '#ffd84a',
  grief: '#5a7a9a',
  pride: '#ffb03d',
  shame: '#c2577a',
  euphoria: '#ff8af0',
  calm: '#6fe0c8',
};

/** Emoções que somam estresse enquanto ativas. */
export const NEGATIVE_EMOTIONS: ReadonlySet<EmotionId> = new Set(['fury', 'fear', 'grief', 'shame']);
export const POSITIVE_EMOTIONS: ReadonlySet<EmotionId> = new Set(['joy', 'pride', 'euphoria', 'calm']);

export interface Emotion {
  id: EmotionId;
  /** 0–1 */
  intensity: number;
  /** segundos restantes */
  remaining: number;
  duration: number;
}

export type EmotionMap = Partial<Record<EmotionId, Emotion>>;

/**
 * Adiciona (ou reforça) uma emoção. Repetir a mesma emoção soma intensidade com retorno
 * decrescente e renova a duração.
 */
export function addEmotion(map: EmotionMap, id: EmotionId, intensity: number, duration: number, amplify = 1): void {
  const i = clamp(intensity * amplify, 0, 1);
  if (i <= 0.01) return;
  const cur = map[id];
  if (cur) {
    cur.intensity = clamp(cur.intensity + i * (1 - cur.intensity), 0, 1);
    cur.remaining = Math.max(cur.remaining, duration);
    cur.duration = Math.max(cur.duration, duration);
  } else {
    map[id] = { id, intensity: i, remaining: duration, duration };
  }
}

export function tickEmotions(map: EmotionMap, dt: number): void {
  for (const id of EMOTION_IDS) {
    const e = map[id];
    if (!e) continue;
    e.remaining -= dt;
    // Desvanece no último terço da duração.
    if (e.remaining < e.duration / 3) e.intensity -= (dt / Math.max(e.duration / 3, 0.1)) * e.intensity;
    if (e.remaining <= 0 || e.intensity < 0.02) delete map[id];
  }
}

export function dominantEmotion(map: EmotionMap): Emotion | null {
  let best: Emotion | null = null;
  for (const id of EMOTION_IDS) {
    const e = map[id];
    if (e && (!best || e.intensity > best.intensity)) best = e;
  }
  return best;
}

export const intensityOf = (map: EmotionMap, id: EmotionId): number => map[id]?.intensity ?? 0;

/** Eventos que a Psique interpreta. */
export type PsycheEventKind =
  | 'nearDeath'
  | 'heavyHit'
  | 'killElite'
  | 'killBoss'
  | 'killStreak'
  | 'perfectTide'
  | 'meditate'
  | 'death'
  | 'pactBroken'
  | 'redemption'
  | 'retreat';

export interface EmotionReaction {
  id: EmotionId;
  intensity: number;
  duration: number;
}

const t01 = (v: number) => v / 100;

/**
 * O filtro dos traços: o mesmo evento gera emoções diferentes em personagens diferentes.
 * Ex.: quase-morte gera Medo forte num ansioso e Euforia num impulsivo.
 */
export function reactTo(kind: PsycheEventKind, tr: Traits, magnitude = 1): EmotionReaction[] {
  const m = magnitude;
  switch (kind) {
    case 'nearDeath': {
      const fear = (t01(tr.anxiety) + (1 - t01(tr.courage))) / 2;
      const eup = (t01(tr.impulsivity) + t01(tr.courage)) / 2;
      return fear >= eup
        ? [{ id: 'fear', intensity: 0.4 + fear * 0.6 * m, duration: 10 }]
        : [{ id: 'euphoria', intensity: 0.4 + eup * 0.6 * m, duration: 10 }];
    }
    case 'heavyHit': {
      const fury = t01(tr.wrath);
      const fear = t01(tr.anxiety) * (1 - t01(tr.courage) * 0.5);
      return fury >= fear
        ? [{ id: 'fury', intensity: 0.15 + fury * 0.45 * m, duration: 8 }]
        : [{ id: 'fear', intensity: 0.15 + fear * 0.45 * m, duration: 8 }];
    }
    case 'killElite':
      return [
        { id: 'euphoria', intensity: 0.2 + t01(tr.impulsivity) * 0.4 * m, duration: 10 },
        { id: 'pride', intensity: 0.2 + t01(tr.pride) * 0.4 * m, duration: 15 },
      ];
    case 'killBoss':
      return [
        { id: 'euphoria', intensity: 0.5 + t01(tr.impulsivity) * 0.5, duration: 20 },
        { id: 'pride', intensity: 0.4 + t01(tr.pride) * 0.6, duration: 40 },
        { id: 'joy', intensity: 0.6, duration: 40 },
      ];
    case 'killStreak':
      return [{ id: 'euphoria', intensity: 0.1 + t01(tr.impulsivity) * 0.3 * m, duration: 6 }];
    case 'perfectTide':
      return [{ id: 'calm', intensity: 0.15 + t01(tr.discipline) * 0.35 * m, duration: 8 }];
    case 'meditate':
      return [{ id: 'calm', intensity: 0.1 + t01(tr.discipline) * 0.2 * m, duration: 12 }];
    case 'death': {
      const shame = (t01(tr.pride) + t01(tr.competitiveness)) / 2;
      const fear = (t01(tr.anxiety) + 1 - t01(tr.courage)) / 2;
      return shame > fear
        ? [{ id: 'shame', intensity: 0.5 + shame * 0.5, duration: 60 }]
        : [{ id: 'fear', intensity: 0.5 + fear * 0.5, duration: 45 }];
    }
    case 'pactBroken':
      return [{ id: 'shame', intensity: 0.6 + t01(tr.pride) * 0.4, duration: 9999 }];
    case 'redemption':
      return [{ id: 'calm', intensity: 0.5, duration: 15 }];
    case 'retreat':
      return t01(tr.pride) > t01(tr.anxiety)
        ? [{ id: 'shame', intensity: 0.2 + t01(tr.pride) * 0.4, duration: 30 }]
        : [{ id: 'fear', intensity: 0.15 + t01(tr.anxiety) * 0.35, duration: 15 }];
  }
}
