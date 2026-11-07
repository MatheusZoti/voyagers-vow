/**
 * Traços e valores da Psique (GDD, Pilar 2).
 * Traços: eixos 0–100, estáveis. Valores: -50 a +50.
 * O jogador nunca vê números: a ficha mostra frases.
 */

export const TRAIT_IDS = [
  // Temperamento
  'courage',
  'wrath',
  'anxiety',
  'impulsivity',
  // Mente
  'curiosity',
  'discipline',
  'imagination',
  'stubbornness',
  // Social
  'empathy',
  'pride',
  'trust',
  'sincerity',
  // Ambição
  'greed',
  'perseverance',
  'competitiveness',
  'detachment',
] as const;
export type TraitId = (typeof TRAIT_IDS)[number];

export const VALUE_IDS = ['law', 'freedom', 'power', 'loyalty', 'knowledge', 'nature', 'vengeance', 'mercy'] as const;
export type ValueId = (typeof VALUE_IDS)[number];

export type Traits = Record<TraitId, number>;
export type Values = Record<ValueId, number>;

export const TRAIT_GROUPS: Record<string, TraitId[]> = {
  Temperamento: ['courage', 'wrath', 'anxiety', 'impulsivity'],
  Mente: ['curiosity', 'discipline', 'imagination', 'stubbornness'],
  Social: ['empathy', 'pride', 'trust', 'sincerity'],
  'Ambição': ['greed', 'perseverance', 'competitiveness', 'detachment'],
};

export const TRAIT_NAMES: Record<TraitId, string> = {
  courage: 'Coragem',
  wrath: 'Ira',
  anxiety: 'Ansiedade',
  impulsivity: 'Impulsividade',
  curiosity: 'Curiosidade',
  discipline: 'Disciplina',
  imagination: 'Imaginação',
  stubbornness: 'Teimosia',
  empathy: 'Empatia',
  pride: 'Orgulho',
  trust: 'Confiança',
  sincerity: 'Sinceridade',
  greed: 'Ganância',
  perseverance: 'Perseverança',
  competitiveness: 'Competitividade',
  detachment: 'Desapego',
};

export const VALUE_NAMES: Record<ValueId, string> = {
  law: 'Lei',
  freedom: 'Liberdade',
  power: 'Poder',
  loyalty: 'Lealdade',
  knowledge: 'Conhecimento',
  nature: 'Natureza',
  vengeance: 'Vingança',
  mercy: 'Misericórdia',
};

/** [muito baixo, baixo, alto, muito alto] */
const TRAIT_PHRASES: Record<TraitId, [string, string, string, string]> = {
  courage: ['entra em pânico diante do perigo', 'assusta-se com facilidade', 'raramente sente medo', 'parece não conhecer o medo'],
  wrath: ['quase nunca se irrita', 'é difícil de provocar', 'perde a paciência com facilidade', 'explode ao menor desafio'],
  anxiety: ['vive em paz consigo mesmo', 'raramente se preocupa', 'preocupa-se com frequência', 'é consumido pela inquietação'],
  impulsivity: ['pensa demais antes de agir', 'age com cautela', 'age antes de pensar', 'segue cada impulso sem hesitar'],
  curiosity: ['não se interessa pelo desconhecido', 'prefere o que já conhece', 'quer entender como tudo funciona', 'é devorado pela curiosidade'],
  discipline: ['não suporta rotina alguma', 'desvia-se do treino com facilidade', 'cumpre o que se propõe', 'tem disciplina de ferro'],
  imagination: ['vê o mundo apenas como ele é', 'é pouco dado a fantasias', 'tem a cabeça cheia de ideias', 'vive entre mundos imaginados'],
  stubbornness: ['muda de ideia com qualquer conselho', 'aceita ser corrigido', 'dificilmente volta atrás', 'nunca admite um erro'],
  empathy: ['é indiferente à dor alheia', 'mantém distância dos problemas dos outros', 'sente a dor dos outros', 'carrega o sofrimento de todos'],
  pride: ['não tem amor-próprio', 'é modesto', 'tem orgulho de quem é', 'não tolera ser diminuído'],
  trust: ['desconfia de todos', 'é cauteloso com estranhos', 'confia nas pessoas', 'confia em qualquer um'],
  sincerity: ['mente com naturalidade', 'omite quando convém', 'diz o que pensa', 'é incapaz de mentir'],
  greed: ['despreza riquezas', 'contenta-se com pouco', 'deseja sempre mais', 'é dominado pela cobiça'],
  perseverance: ['desiste ao primeiro obstáculo', 'cansa-se de lutas longas', 'não desiste fácil', 'jamais abandona um objetivo'],
  competitiveness: ['não se importa em vencer', 'compete só quando precisa', 'odeia perder', 'precisa vencer a qualquer custo'],
  detachment: ['agarra-se a tudo o que tem', 'apega-se ao que conquista', 'larga o passado com facilidade', 'não se prende a nada nem a ninguém'],
};

export function traitPhrase(id: TraitId, v: number): string | null {
  const p = TRAIT_PHRASES[id];
  if (v <= 20) return p[0];
  if (v <= 38) return p[1];
  if (v >= 80) return p[3];
  if (v >= 62) return p[2];
  return null; // faixa neutra: não vale menção
}

export function valuePhrase(id: ValueId, v: number): string | null {
  const name = VALUE_NAMES[id];
  if (v >= 35) return `${name} guia suas escolhas`;
  if (v >= 15) return `dá valor a ${name}`;
  if (v <= -35) return `despreza ${name}`;
  if (v <= -15) return `pouco se importa com ${name}`;
  return null;
}

export function neutralTraits(): Traits {
  return Object.fromEntries(TRAIT_IDS.map((t) => [t, 50])) as Traits;
}

export function neutralValues(): Values {
  return Object.fromEntries(VALUE_IDS.map((v) => [v, 0])) as Values;
}

/** Valor considerado "forte" para Pactos e Restrições. */
export const STRONG_VALUE = 25;
