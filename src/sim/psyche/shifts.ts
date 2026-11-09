import type { EmotionId } from './emotions';
import { STRONG_VALUE, TRAIT_NAMES, VALUE_IDS, VALUE_NAMES, type TraitId, type Traits, type ValueId, type Values } from './traits';

/**
 * Sinal e voz (Fase 1 do redesenho da Psique): a Psique continua sem números, mas toda
 * mudança aparece na hora — um sussurro com a direção e o nome, um marco quando um Valor
 * fica forte, o efeito de cada emoção em palavras e a voz interna do personagem.
 */

/** Uma mudança registrada na história do personagem ("Como você mudou"). */
export interface PsycheShift {
  /** tempo jogado (s) */
  t: number;
  /** o que causou (ato, conversa, memória) */
  cause: string;
  changes: Array<{ kind: 'trait' | 'value'; id: string; dir: 1 | -1 }>;
}
export const SHIFT_HISTORY_MAX = 40;
/** Mudanças menores que isto não entram na história (empurrõezinhos de combate se somam antes). */
export const SHIFT_MIN = 0.25;
/** Quanto precisa acumular para virar sussurro: Valores mudam devagar, traços um pouco mais. */
export const WHISPER_VALUE = 6;
export const WHISPER_TRAIT = 4;
/** Sussurros no máximo a cada tantos segundos (conversas sussurram na hora). */
export const WHISPER_GAP_S = 20;

const TRAIT_ART: Partial<Record<TraitId, 'O'>> = { pride: 'O', detachment: 'O' };
const VALUE_ART: Partial<Record<ValueId, 'O'>> = { power: 'O', knowledge: 'O' };

export const shiftName = (kind: 'trait' | 'value', id: string): string =>
  kind === 'value' ? VALUE_NAMES[id as ValueId] : TRAIT_NAMES[id as TraitId];

/** "A Misericórdia cresce em você." / "O Orgulho perde força em você." */
export function whisperText(kind: 'trait' | 'value', id: string, dir: 1 | -1): string {
  const art = (kind === 'value' ? VALUE_ART[id as ValueId] : TRAIT_ART[id as TraitId]) ?? 'A';
  return `${art} ${shiftName(kind, id)} ${dir > 0 ? 'cresce' : 'perde força'} em você.`;
}

export interface Snapshot {
  traits: Traits;
  values: Values;
}
export const snapshot = (p: { traits: Traits; values: Values }): Snapshot => ({ traits: { ...p.traits }, values: { ...p.values } });

/** Diferenças entre dois retratos da Psique. */
export function diff(a: Snapshot, b: Snapshot): Array<{ kind: 'trait' | 'value'; id: string; d: number }> {
  const out: Array<{ kind: 'trait' | 'value'; id: string; d: number }> = [];
  for (const id of Object.keys(b.traits) as TraitId[]) {
    const d = b.traits[id] - a.traits[id];
    if (Math.abs(d) > 1e-6) out.push({ kind: 'trait', id, d });
  }
  for (const id of VALUE_IDS) {
    const d = b.values[id] - a.values[id];
    if (Math.abs(d) > 1e-6) out.push({ kind: 'value', id, d });
  }
  return out;
}

export type StrongState = 'for' | 'against' | 'none';
export const strongState = (v: number): StrongState => (v >= STRONG_VALUE ? 'for' : v <= -STRONG_VALUE ? 'against' : 'none');

// ---------------------------------------------------------------------------
// O efeito de cada emoção, em palavras (espelha computeFlowMods)
// ---------------------------------------------------------------------------

export const EMOTION_EFFECTS: Record<EmotionId, string> = {
  fury: 'Ímpeto mais forte · Maré lenta para voltar à defesa',
  fear: 'Véu mais forte · Ímpeto custa mais Fluxo',
  calm: 'Maré mais rápida · Fluxo regenera mais',
  euphoria: 'Magias mais baratas · a barra de Fluxo engana',
  grief: 'Reserva de Fluxo menor',
  pride: 'Assinatura mais forte · sem Silêncio',
  shame: 'Assinatura enfraquecida até a redenção',
  joy: 'Sem efeito no combate',
};

// ---------------------------------------------------------------------------
// Voz interna: falas curtas, no tom dos traços mais marcantes
// ---------------------------------------------------------------------------

export type VoiceMoment = 'arena' | 'killBoss' | 'nearDeath' | 'respawn' | 'newRegion' | 'perfectTide' | 'killStreak' | 'nemesis';

const VOICE: Record<VoiceMoment, { lines: Partial<Record<TraitId, string>>; plain: string }> = {
  arena: {
    lines: { anxiety: 'Não gosto disso.', courage: 'Finalmente.', impulsivity: 'Agora!', discipline: 'Respira. Observa o golpe.', pride: 'Ele vai lembrar de mim.' },
    plain: 'Lá vamos nós.',
  },
  killBoss: {
    lines: { pride: 'Eu disse que conseguia.', empathy: '…Descansa, guardião.', greed: 'Agora, o que ele guardava?', competitiveness: 'Próximo.' },
    plain: 'Acabou.',
  },
  nearDeath: {
    lines: { anxiety: 'Não, não, não…', courage: 'Ainda não.', wrath: 'Isso só me deixa com mais raiva.', impulsivity: 'Que se dane, vai!' },
    plain: 'Preciso sair daqui.',
  },
  respawn: {
    lines: { pride: 'Isso não vai se repetir.', anxiety: 'Quase. Quase de novo.', perseverance: 'De novo. Agora com calma.' },
    plain: 'Ainda estou aqui.',
  },
  newRegion: {
    lines: { curiosity: 'O que será que tem aqui?', anxiety: 'Lugar estranho.', greed: 'Terra nova, tesouro novo.' },
    plain: 'Outro lugar, outra chance.',
  },
  perfectTide: {
    lines: { discipline: 'Assim.', pride: 'Fácil.' },
    plain: 'Peguei o tempo.',
  },
  killStreak: {
    lines: { wrath: 'Mais!', empathy: '…Chega disso.', impulsivity: 'Ninguém me para.' },
    plain: 'Um a menos.',
  },
  nemesis: {
    lines: { wrath: 'Agora estamos quites.', pride: 'Eu sempre volto.', empathy: '…Acabou. Não precisava ser assim.' },
    plain: 'Quites.',
  },
};
/** Momentos que sempre falam; os outros respeitam o intervalo. */
export const VOICE_ALWAYS: ReadonlySet<VoiceMoment> = new Set(['arena', 'killBoss', 'newRegion', 'nemesis']);
export const VOICE_GAP_S = 45;
/** Um traço só "fala" se estiver bem marcado (longe do meio). */
const VOICE_MIN_LEAN = 12;

/** A fala do momento, pelo traço mais marcado que tem algo a dizer (ou a fala neutra). */
export function voiceLine(moment: VoiceMoment, traits: Traits): string {
  const v = VOICE[moment];
  let best: string | null = null;
  let lean = VOICE_MIN_LEAN;
  for (const [t, line] of Object.entries(v.lines) as Array<[TraitId, string]>) {
    const l = traits[t] - 50;
    if (l > lean) {
      lean = l;
      best = line;
    }
  }
  return best ?? v.plain;
}
