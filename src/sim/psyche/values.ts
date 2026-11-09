/**
 * Valores: a identidade do personagem (GDD, Pilar 2, simplificado em 09/11).
 * Oito eixos de −50 a +50, movidos só por escolhas deliberadas (poupar, executar, situações,
 * livros, altares). O jogador nunca vê números: a ficha mostra a direção e frases.
 */

export const VALUE_IDS = ['law', 'freedom', 'power', 'loyalty', 'knowledge', 'nature', 'vengeance', 'mercy'] as const;
export type ValueId = (typeof VALUE_IDS)[number];
export type Values = Record<ValueId, number>;

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

export function valuePhrase(id: ValueId, v: number): string | null {
  const name = VALUE_NAMES[id];
  if (v >= 35) return `${name} guia suas escolhas`;
  if (v >= 15) return `dá valor a ${name}`;
  if (v <= -35) return `despreza ${name}`;
  if (v <= -15) return `pouco se importa com ${name}`;
  return null;
}

export function neutralValues(): Values {
  return Object.fromEntries(VALUE_IDS.map((v) => [v, 0])) as Values;
}

/** Valor considerado "forte": Restrições, itens e NPCs reagem a partir daqui. */
export const STRONG_VALUE = 25;
