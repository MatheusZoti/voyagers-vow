import type { NpcId } from './dialogues';
import type { EmotionId } from './emotions';
import { STRONG_VALUE, VALUE_IDS, type ValueId, type Values } from './values';

/**
 * O mundo nota quem você é: NPCs comentam, sem clique, uma emoção forte ou o seu Valor
 * mais marcado (a favor ou contra). Não há números nem fama separada: são os seus Valores.
 */

export interface GreetContext {
  emotion: { id: EmotionId; intensity: number } | null;
  values: Values;
}

/** Emoção forte o bastante para alguém notar. */
export const GREET_EMOTION = 0.45;
/** Cada NPC comenta no máximo a cada tantos segundos; e entre um NPC e outro, este intervalo. */
export const GREET_EACH_S = 150;
export const GREET_GAP_S = 20;
export const GREET_DIST = 4.5;

const EMOTION_LINES: Partial<Record<NpcId, Partial<Record<EmotionId, string>>>> = {
  oren: {
    fear: 'Você voltou tremendo. Sente aqui, perto do fogo.',
    fury: 'Essa raiva vai te queimar antes de queimar eles.',
    shame: 'Todos caem. Levantar é o que conta.',
    calm: 'Assim. Respire assim lá fora também.',
  },
  kael: {
    fear: 'Tá com medo? Dá para ver daqui.',
    fury: 'Opa. Guarda isso para os Carniçais.',
    shame: 'Cara de quem apanhou. Bem-vindo ao clube.',
  },
  lys: {
    fear: 'Respira, forasteiro. Ninguém atira em você dentro do acampamento.',
    fury: 'Guarde a fúria para as encostas.',
  },
  huntress: {
    fear: 'Bicho assustado faz barulho. Você está fazendo barulho.',
    calm: 'Bom. Passo leve, olho aberto.',
  },
};

/** Valor forte a favor: quem fala e o que diz. */
const VALUE_LINES: Partial<Record<NpcId, Partial<Record<ValueId, string>>>> = {
  oren: {
    mercy: 'Ouvi que você poupa quem se rende. Isso também é força.',
    knowledge: 'Sempre perguntando. Continue.',
    vengeance: 'Contas a acertar pesam mais que espada. Cuidado.',
  },
  kael: {
    mercy: 'Poupando inimigo? Você é estranho. Gosto.',
    power: 'Você quer ser o mais forte do vale, né? Entra na fila.',
  },
  lys: {
    mercy: 'Os Lançadores falam de você. Dizem que você poupa quem larga a arma.',
    law: 'O acampamento confia em você. Isso é raro em Varn.',
  },
  huntress: { nature: 'Você anda leve na mata. Os bichos sentem.' },
  pilgrim: { law: 'Você respeita o que não é seu. Raro.' },
  herald: { power: 'O Senhor gostaria de você. Você olha para tudo como se fosse seu.' },
};
const VALUE_GENERIC: Record<ValueId, string> = {
  mercy: 'Você tem coração mole. Ainda bem.',
  vengeance: 'Você carrega contas a acertar, não é?',
  power: 'Você olha para tudo como se fosse seu.',
  freedom: 'Você não para em lugar nenhum, hein?',
  loyalty: 'Gente como você não deixa ninguém para trás.',
  knowledge: 'Sempre lendo, sempre perguntando.',
  law: 'Gente correta é rara por aqui.',
  nature: 'Você cheira a mata.',
};
/** Valor forte contra: também é notado. */
const VALUE_AGAINST_LINES: Partial<Record<NpcId, Partial<Record<ValueId, string>>>> = {
  oren: { mercy: 'Dizem que você não deixa ninguém de pé. Cuidado com o que isso faz com você.' },
  lys: { mercy: 'Os Lançadores fogem quando te veem chegar.' },
  pilgrim: { law: 'Dizem que você tem mãos rápidas. Que o ouro não pese demais.' },
};
const VALUE_AGAINST: Partial<Record<ValueId, string>> = {
  mercy: 'Você não tem pena de ninguém, né?',
  law: 'Regras não são para você, pelo jeito.',
  nature: 'Os bichos fogem quando você passa.',
  loyalty: 'Você não espera por ninguém.',
};

/** O Valor mais marcado (a favor ou contra), se algum passar do limite de "forte". */
export function strongestValue(values: Values): ValueId | null {
  let best: ValueId | null = null;
  for (const v of VALUE_IDS) if (Math.abs(values[v]) >= STRONG_VALUE && (!best || Math.abs(values[v]) > Math.abs(values[best]))) best = v;
  return best;
}

/** O que este NPC diz ao te ver (ou null: nada a comentar agora). */
export function greeting(npc: NpcId, ctx: GreetContext): string | null {
  const e = ctx.emotion;
  if (e && e.intensity >= GREET_EMOTION) {
    const line = EMOTION_LINES[npc]?.[e.id];
    if (line) return line;
  }
  const best = strongestValue(ctx.values);
  if (!best) return null;
  return ctx.values[best] > 0
    ? (VALUE_LINES[npc]?.[best] ?? VALUE_GENERIC[best])
    : (VALUE_AGAINST_LINES[npc]?.[best] ?? VALUE_AGAINST[best] ?? null);
}
