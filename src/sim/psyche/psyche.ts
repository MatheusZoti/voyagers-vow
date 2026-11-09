import { addEmotion, dominantEmotion, reactTo, tickEmotions, type EmotionMap, type PsycheEventKind } from './emotions';
import type { Values } from './values';

/**
 * Psique (simplificada em 09/11): Valores (quem você é) + emoções de combate (como você está).
 * O que você escolhe move os Valores; o que acontece na luta desperta emoções.
 */
export interface PsycheState {
  values: Values;
  emotions: EmotionMap;
}

export function createPsyche(values: Values): PsycheState {
  return { values, emotions: {} };
}

/** Um evento de combate desperta a emoção dele. A penitência apaga a Vergonha. */
export function psycheEvent(p: PsycheState, kind: PsycheEventKind, magnitude = 1): void {
  if (kind === 'redemption') delete p.emotions.shame;
  const r = reactTo(kind, magnitude);
  if (r) addEmotion(p.emotions, r.id, r.intensity, r.duration);
}

export function tickPsyche(p: PsycheState, dt: number): void {
  tickEmotions(p.emotions, dt);
}

export const dominant = (p: PsycheState) => dominantEmotion(p.emotions);
export { addEmotion };

const EVENT_TEXT: Record<PsycheEventKind, string> = {
  nearDeath: 'Esteve à beira da morte',
  heavyHit: 'Sofreu um golpe brutal',
  killBoss: 'Venceu o Guardião da Ponte',
  killStreak: 'Abateu vários inimigos em sequência',
  perfectTide: 'Leu o golpe do inimigo no instante certo',
  meditate: 'Meditou em silêncio',
  death: 'Caiu em combate',
  pactBroken: 'Quebrou um juramento',
  redemption: 'Redimiu-se de um juramento quebrado',
  retreat: 'Fugiu de uma luta perdida',
};

/** Frase que descreve um evento (para a história de mudanças). */
export const eventText = (kind: PsycheEventKind): string => EVENT_TEXT[kind];
