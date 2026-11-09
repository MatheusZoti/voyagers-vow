import type { NpcId } from './dialogues';
import type { EmotionId } from './emotions';
import { STRONG_VALUE, VALUE_IDS, type ValueId, type Values } from './traits';

/**
 * O mundo lembra (Fase 4 do redesenho da Psique): o que você faz numa região vira fama
 * ali, e NPCs e inimigos respondem a quem você é — sem mostrar número nenhum.
 */

export const FAME_TAGS = ['mercy', 'ruthless', 'greedy', 'honest', 'brave'] as const;
export type FameTag = (typeof FAME_TAGS)[number];
/** "conhecido pela …" */
export const FAME_NOUN: Record<FameTag, string> = {
  mercy: 'piedade',
  ruthless: 'crueldade',
  greedy: 'ganância',
  honest: 'honra',
  brave: 'coragem',
};
export const FAME_COLOR: Record<FameTag, string> = {
  mercy: '#7ee0a8',
  ruthless: '#ff6a5a',
  greedy: '#e2b65a',
  honest: '#6fd0ff',
  brave: '#f2a640',
};
/** Precisa de pelo menos isto (e estar à frente da segunda) para virar fama. */
export const FAME_MIN = 2;

export type FameCounts = Partial<Record<FameTag, number>>;

/** A fama que pegou numa região (ou null, se ninguém ainda fala de você ali). */
export function fameOf(counts: FameCounts | undefined): FameTag | null {
  if (!counts) return null;
  const sorted = FAME_TAGS.map((t) => [t, counts[t] ?? 0] as const).sort((a, b) => b[1] - a[1]);
  const [top, second] = sorted;
  if (!top || top[1] < FAME_MIN || (second && top[1] === second[1])) return null;
  return top[0];
}

export const fameLabel = (tag: FameTag | null) => (tag ? `conhecido pela ${FAME_NOUN[tag]}` : null);

// ---------------------------------------------------------------------------
// Falas que notam você (saudações sem clique)
// ---------------------------------------------------------------------------

export interface GreetContext {
  emotion: { id: EmotionId; intensity: number } | null;
  fame: FameTag | null;
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
    pride: 'Orgulho é bom até o primeiro tropeço.',
    grief: 'Pode chorar aqui. O santuário não conta para ninguém.',
    calm: 'Assim. Respire assim lá fora também.',
  },
  kael: {
    fear: 'Tá com medo? Dá para ver daqui.',
    pride: 'Ainda se achando? Que bom, eu também.',
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

const FAME_LINES: Partial<Record<NpcId, Partial<Record<FameTag, string>>>> = {
  oren: {
    mercy: 'Ouvi que você poupa quem se rende. Isso também é força.',
    ruthless: 'Dizem que você não deixa ninguém de pé. Cuidado com o que isso faz com você.',
    greedy: 'O vale comenta o que some quando você passa.',
    honest: 'O vale fala bem de você. Não é pouco.',
    brave: 'O Guardião caiu. O vale respira melhor.',
  },
  kael: {
    brave: 'Você derrubou o Guardião. Tá… impressionante.',
    ruthless: 'Até eu fiquei com medo de você. Quase.',
    mercy: 'Poupando inimigo? Você é estranho. Gosto.',
  },
  lys: {
    mercy: 'Os Lançadores falam de você. Dizem que você poupa quem larga a arma.',
    ruthless: 'Os Lançadores falam de você. Eles fogem quando te veem chegar.',
    greedy: 'Cuidado com o que pega por aí, forasteiro.',
    honest: 'O acampamento confia em você. Isso é raro em Varn.',
    brave: 'Dizem que você não recua. Bom. Precisamos disso aqui.',
  },
  pilgrim: {
    greedy: 'Dizem que você tem mãos rápidas. Que o ouro não pese demais.',
    honest: 'Gente de palavra. Que bom te ver.',
  },
};
const FAME_GENERIC: Record<FameTag, string> = {
  mercy: 'Dizem por aí que você poupa quem se rende.',
  ruthless: 'Dizem por aí que você não deixa ninguém de pé.',
  greedy: 'Dizem que suas mãos são rápidas com o que não é seu.',
  honest: 'Dizem que você é gente de palavra.',
  brave: 'Dizem que você não recua de nada.',
};

const VALUE_LINES: Partial<Record<NpcId, Partial<Record<ValueId, string>>>> = {
  huntress: { nature: 'Você anda leve na mata. Os bichos sentem.' },
  pilgrim: { law: 'Você respeita o que não é seu. Raro.' },
  herald: { power: 'O Senhor gostaria de você. Você olha para tudo como se fosse seu.' },
  oren: { knowledge: 'Sempre perguntando. Continue.' },
};
const VALUE_GENERIC: Partial<Record<ValueId, string>> = {
  mercy: 'Você tem coração mole. Ainda bem.',
  vengeance: 'Você carrega contas a acertar, não é?',
  power: 'Você olha para tudo como se fosse seu.',
  freedom: 'Você não para em lugar nenhum, hein?',
  loyalty: 'Gente como você não deixa ninguém para trás.',
  knowledge: 'Sempre lendo, sempre perguntando.',
  law: 'Gente correta é rara por aqui.',
  nature: 'Você cheira a mata.',
};
/** Quem se opõe a um Valor também é notado. */
const VALUE_AGAINST: Partial<Record<ValueId, string>> = {
  mercy: 'Você não tem pena de ninguém, né?',
  law: 'Regras não são para você, pelo jeito.',
  nature: 'Os bichos fogem quando você passa.',
  loyalty: 'Você não espera por ninguém.',
};

/** O que este NPC diz ao te ver (ou null: nada a comentar agora). */
export function greeting(npc: NpcId, ctx: GreetContext): string | null {
  const e = ctx.emotion;
  if (e && e.intensity >= GREET_EMOTION) {
    const line = EMOTION_LINES[npc]?.[e.id];
    if (line) return line;
  }
  if (ctx.fame) return FAME_LINES[npc]?.[ctx.fame] ?? FAME_GENERIC[ctx.fame];
  let best: ValueId | null = null;
  for (const v of VALUE_IDS) if (Math.abs(ctx.values[v]) >= STRONG_VALUE && (!best || Math.abs(ctx.values[v]) > Math.abs(ctx.values[best]))) best = v;
  if (best) return ctx.values[best] > 0 ? (VALUE_LINES[npc]?.[best] ?? VALUE_GENERIC[best] ?? null) : (VALUE_AGAINST[best] ?? null);
  return null;
}
