import { clamp } from '../math';

/**
 * Emoções de combate: só quatro, cada uma com gatilho fixo e um efeito claro no Fluxo.
 * Fúria e Medo vêm da luta; Calma vem do controle; Vergonha vem de quebrar a palavra.
 */
export const EMOTION_IDS = ['fury', 'fear', 'calm', 'shame'] as const;
export type EmotionId = (typeof EMOTION_IDS)[number];

export const EMOTION_NAMES: Record<EmotionId, string> = {
  fury: 'Fúria',
  fear: 'Medo',
  calm: 'Calma',
  shame: 'Vergonha',
};

export const EMOTION_COLORS: Record<EmotionId, string> = {
  fury: '#ff4a3d',
  fear: '#9a7bff',
  calm: '#6fe0c8',
  shame: '#c2577a',
};

/** O efeito de cada emoção, em palavras (espelha computeFlowMods). */
export const EMOTION_EFFECTS: Record<EmotionId, string> = {
  fury: 'Ímpeto mais forte · Maré lenta para voltar à defesa',
  fear: 'Véu mais forte · Ímpeto custa mais Fluxo',
  calm: 'Maré mais rápida · Fluxo regenera mais',
  shame: 'Assinatura enfraquecida até a penitência',
};

/** De onde cada emoção vem (para a ficha). */
export const EMOTION_SOURCES: Record<EmotionId, string> = {
  fury: 'golpes pesados e abates em sequência',
  fear: 'ficar à beira da morte, cair, fugir de uma luta',
  calm: 'Marés perfeitas, meditar, vencer o Guardião',
  shame: 'quebrar um juramento ou a palavra dada',
};

export interface Emotion {
  id: EmotionId;
  /** 0–1 */
  intensity: number;
  /** segundos restantes */
  remaining: number;
  duration: number;
}

export type EmotionMap = Partial<Record<EmotionId, Emotion>>;

/** Adiciona (ou reforça) uma emoção; repetir soma com retorno decrescente e renova a duração. */
export function addEmotion(map: EmotionMap, id: EmotionId, intensity: number, duration: number): void {
  const i = clamp(intensity, 0, 1);
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

/** Eventos de combate que despertam emoções. */
export type PsycheEventKind =
  | 'nearDeath'
  | 'heavyHit'
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

/** Gatilhos fixos: o mesmo evento sempre gera a mesma emoção. */
export function reactTo(kind: PsycheEventKind, magnitude = 1): EmotionReaction | null {
  const m = magnitude;
  switch (kind) {
    case 'heavyHit':
      return { id: 'fury', intensity: 0.15 + 0.3 * m, duration: 8 };
    case 'killStreak':
      return { id: 'fury', intensity: 0.25, duration: 6 };
    case 'nearDeath':
      return { id: 'fear', intensity: 0.6, duration: 10 };
    case 'death':
      return { id: 'fear', intensity: 0.6, duration: 45 };
    case 'retreat':
      return { id: 'fear', intensity: 0.3, duration: 15 };
    case 'perfectTide':
      return { id: 'calm', intensity: 0.35, duration: 8 };
    case 'meditate':
      return { id: 'calm', intensity: 0.25, duration: 12 };
    case 'killBoss':
      return { id: 'calm', intensity: 0.5, duration: 30 };
    case 'redemption':
      return { id: 'calm', intensity: 0.5, duration: 15 };
    case 'pactBroken':
      return { id: 'shame', intensity: 0.8, duration: 9999 };
  }
}
