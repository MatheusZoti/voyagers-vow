import { clamp, type Rng } from '../math';
import { neutralTraits, neutralValues, type TraitId, type Traits, type ValueId, type Values } from './traits';

/**
 * Perguntas do Rito (GDD, Integrações). Todo traço começa em 50; cada resposta move os
 * traços indicados em 10 (±5 aleatório). Valores começam em 0 e se movem 15.
 * As direções ficam só no código: o jogador nunca vê o que cada resposta mede.
 */
export interface RiteOption {
  text: string;
  traits: Partial<Record<TraitId, 1 | -1>>;
  values: Partial<Record<ValueId, 1 | -1>>;
}
export interface RiteQuestion {
  prompt: string;
  options: [RiteOption, RiteOption, RiteOption];
}

const o = (
  text: string,
  traits: Partial<Record<TraitId, 1 | -1>> = {},
  values: Partial<Record<ValueId, 1 | -1>> = {},
): RiteOption => ({ text, traits, values });

export const RITE_QUESTIONS: RiteQuestion[] = [
  {
    prompt: 'Um monstro bloqueia a única ponte. Há uma trilha que leva um dia inteiro para contornar.',
    options: [
      o('Avanço e enfrento o monstro.', { courage: 1, impulsivity: 1 }),
      o('Observo o monstro até achar uma fraqueza.', { discipline: 1, curiosity: 1 }),
      o('Pego a trilha longa.', { anxiety: 1, perseverance: 1 }),
    ],
  },
  {
    prompt: 'Seu mestre manda você repetir um exercício que parece inútil.',
    options: [
      o('Cumpro sem questionar.', { discipline: 1 }, { loyalty: 1 }),
      o('Pergunto para que serve.', { curiosity: 1, sincerity: 1 }),
      o('Faço do meu jeito.', { stubbornness: 1 }, { freedom: 1 }),
    ],
  },
  {
    prompt: 'Um rival humilha você em público.',
    options: [
      o('Revido na hora.', { wrath: 1, pride: 1 }),
      o('Treino em silêncio para vencê-lo depois.', { competitiveness: 1 }, { vengeance: 1 }),
      o('Rio junto e sigo em frente.', { detachment: 1, pride: -1 }),
    ],
  },
  {
    prompt: 'Você acha ouro num templo abandonado.',
    options: [
      o('Levo tudo.', { greed: 1 }, { law: -1 }),
      o('Deixo intacto.', { greed: -1 }, { law: 1 }),
      o('Pego uma peça e deixo uma oferenda.', { imagination: 1 }, { nature: 1 }),
    ],
  },
  {
    prompt: 'Um estranho ferido pede ajuda na estrada. Pode ser uma armadilha.',
    options: [
      o('Ajudo sem pensar duas vezes.', { empathy: 1, trust: 1 }, { mercy: 1 }),
      o('Ajudo, mas com a arma em mãos.', { empathy: 1, anxiety: 1 }),
      o('Sigo o meu caminho.', { empathy: -1, trust: -1 }),
    ],
  },
  {
    prompt: 'Para vencer um torneio, você precisaria mentir para um aliado.',
    options: [
      o('Minto.', { sincerity: -1 }, { power: 1 }),
      o('Conto a verdade e aceito perder.', { sincerity: 1 }, { loyalty: 1 }),
      o('Invento uma terceira saída.', { imagination: 1, stubbornness: 1 }),
    ],
  },
  {
    prompt: 'Você tem uma noite livre.',
    options: [
      o('Passo com os amigos.', { trust: 1, empathy: 1 }),
      o('Estudo algo que não conheço.', { curiosity: 1 }, { knowledge: 1 }),
      o('Treino até cansar.', { perseverance: 1, competitiveness: 1 }),
    ],
  },
  {
    prompt: 'Você perdeu a luta mais importante da sua vida.',
    options: [
      o('Treino o dobro.', { perseverance: 1, stubbornness: 1 }),
      o('Repasso cada erro antes de dormir.', { discipline: 1, anxiety: 1 }),
      o('Largo essa luta e busco outro objetivo.', { detachment: 1, impulsivity: 1 }),
    ],
  },
  {
    prompt: 'Um governante injusto oferece poder em troca de lealdade.',
    options: [
      o('Aceito.', { competitiveness: 1 }, { power: 1 }),
      o('Recuso e me oponho a ele.', { courage: 1 }, { freedom: 1 }),
      o('Aceito, para derrubá-lo por dentro.', { sincerity: -1 }, { vengeance: 1 }),
    ],
  },
  {
    prompt: 'Um animal raro e ferido cruza a sua caçada.',
    options: [
      o('Cuido dele.', { empathy: 1 }, { nature: 1 }),
      o('Aproveito a presa fácil.', { greed: 1 }, { nature: -1 }),
      o('Paro e observo o que o feriu.', { curiosity: 1, courage: 1 }),
    ],
  },
];

export const TRAIT_STEP = 10;
export const TRAIT_JITTER = 5;
export const VALUE_STEP = 15;

/** Aplica as respostas (índice 0–2 por pergunta) e devolve traços e valores iniciais. */
export function runRite(answers: readonly number[], rng: Rng): { traits: Traits; values: Values } {
  if (answers.length !== RITE_QUESTIONS.length) {
    throw new Error(`Rito espera ${RITE_QUESTIONS.length} respostas, recebeu ${answers.length}`);
  }
  const traits = neutralTraits();
  const values = neutralValues();
  answers.forEach((a, qi) => {
    const opt = RITE_QUESTIONS[qi]?.options[a];
    if (!opt) throw new Error(`Resposta inválida ${a} na pergunta ${qi}`);
    for (const [t, dir] of Object.entries(opt.traits) as Array<[TraitId, 1 | -1]>) {
      const delta = TRAIT_STEP + rng.range(-TRAIT_JITTER, TRAIT_JITTER);
      traits[t] = clamp(traits[t] + dir * delta, 0, 100);
    }
    for (const [v, dir] of Object.entries(opt.values) as Array<[ValueId, 1 | -1]>) {
      values[v] = clamp(values[v] + dir * VALUE_STEP, -50, 50);
    }
  });
  return { traits, values };
}
