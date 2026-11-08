import { clamp, type Rng } from '../math';
import type { TraitId, Traits, ValueId, Values } from './traits';

/**
 * A personalidade não é decidida num questionário: ela emerge do que o jogador responde aos
 * NPCs e do que ele faz no mundo. Estes são os dilemas do GDD, agora vividos em conversas.
 * As direções (traços e valores) nunca aparecem para o jogador.
 */

export type NpcId = 'oren' | 'kael' | 'traveler' | 'pilgrim' | 'herald' | 'huntress' | 'lys';

export interface NpcDef {
  id: NpcId;
  name: string;
  title: string;
  color: string;
}

export const NPCS: Record<NpcId, NpcDef> = {
  oren: { id: 'oren', name: 'Mestre Oren', title: 'guardião do santuário', color: '#d9cfb4' },
  kael: { id: 'kael', name: 'Kael', title: 'rival', color: '#c0504a' },
  traveler: { id: 'traveler', name: 'Viajante ferido', title: 'na trilha', color: '#8a7a5a' },
  pilgrim: { id: 'pilgrim', name: 'Peregrina Ilsa', title: 'diante do altar', color: '#9a86c8' },
  herald: { id: 'herald', name: 'Arauto de Varn', title: 'mensageiro do Senhor do Vale', color: '#5a6a9a' },
  huntress: { id: 'huntress', name: 'Caçadora Mira', title: 'na mata', color: '#6a9a5a' },
  lys: { id: 'lys', name: 'Capitã Lys', title: 'guarda do acampamento de Varn', color: '#c8843a' },
};

export interface DialogueOption {
  text: string;
  /** reação de quem fala, depois da escolha */
  reply: string;
  traits: Partial<Record<TraitId, 1 | -1>>;
  values: Partial<Record<ValueId, 1 | -1>>;
}

export type DialogueId =
  | 'exercise'
  | 'rival'
  | 'stranger'
  | 'temple'
  | 'tournament'
  | 'freeNight'
  | 'lostFight'
  | 'herald'
  | 'animal'
  | 'bridge'
  | 'prisoner';

export interface DialogueDef {
  id: DialogueId;
  /** null = evento do mundo, sem NPC */
  npc: NpcId | null;
  text: string;
  options: [DialogueOption, DialogueOption, DialogueOption];
  /** condições para aparecer */
  requires?: { after?: DialogueId; level?: number; deaths?: number };
}

const o = (
  text: string,
  reply: string,
  traits: Partial<Record<TraitId, 1 | -1>> = {},
  values: Partial<Record<ValueId, 1 | -1>> = {},
): DialogueOption => ({ text, reply, traits, values });

export const DIALOGUES: Record<DialogueId, DialogueDef> = {
  exercise: {
    id: 'exercise',
    npc: 'oren',
    text: 'Antes de sair, quero que repita a postura do Véu mil vezes. Sei que parece inútil.',
    options: [
      o('Faço sem questionar, mestre.', 'Bom. A obediência também é uma forma de força.', { discipline: 1 }, { loyalty: 1 }),
      o('Para que serve isso?', 'Serve para que, no dia em que precisar, você nem pense. Pergunte sempre.', { curiosity: 1, sincerity: 1 }),
      o('Vou treinar do meu jeito.', 'Hm. Então que o seu jeito seja bom.', { stubbornness: 1 }, { freedom: 1 }),
    ],
  },
  rival: {
    id: 'rival',
    npc: 'kael',
    text: 'Olha só! O novato que o velho Oren acolheu. Aposto que apanha até de Carniçal.',
    options: [
      o('Repete isso de perto.', 'Calma, calma… Vamos ver se esse fogo dura lá fora.', { wrath: 1, pride: 1 }),
      o('(Fico calado. Um dia eu te alcanço.)', '…Nada a dizer? Melhor assim.', { competitiveness: 1 }, { vengeance: 1 }),
      o('Pode ser! Mas pelo menos eu tento.', 'Ha. Você é estranho. Gostei.', { detachment: 1, pride: -1 }),
    ],
  },
  stranger: {
    id: 'stranger',
    npc: 'traveler',
    text: 'Por favor… fui atacado na trilha. Pode me ajudar a chegar ao santuário? (Algo no olhar dele não parece certo.)',
    options: [
      o('Claro. Apoie-se em mim.', 'Obrigado… há quem diga que bondade não paga. Eu discordo.', { empathy: 1, trust: 1 }, { mercy: 1 }),
      o('Ajudo, mas fique à minha frente.', 'Justo. Eu faria o mesmo.', { empathy: 1, anxiety: 1 }),
      o('Não tenho tempo para isso.', '…Então siga. Que a trilha seja gentil com você.', { empathy: -1, trust: -1 }),
    ],
  },
  temple: {
    id: 'temple',
    npc: 'pilgrim',
    text: 'Este altar foi abandonado há anos, mas as moedas de ouro continuam aqui. Ninguém viria cobrar.',
    options: [
      o('Então eu levo.', 'O ouro não pesa na mão. Pesa depois.', { greed: 1 }, { law: -1 }),
      o('Deixo onde está.', 'Há quem respeite o que não é seu mesmo sem plateia.', { greed: -1 }, { law: 1 }),
      o('Pego uma moeda e deixo uma oferenda.', 'Uma troca com o que não se vê. Bonito.', { imagination: 1 }, { nature: 1 }),
    ],
  },
  tournament: {
    id: 'tournament',
    npc: 'kael',
    requires: { after: 'rival' },
    text: 'Vai ter um duelo no santuário. Diga a Oren que treinamos juntos e ninguém precisa saber que eu vou vencer roubando.',
    options: [
      o('Fechado. Eu minto para ele.', 'Sabia que você entendia como o mundo funciona.', { sincerity: -1 }, { power: 1 }),
      o('Não. Vou contar a verdade a Oren.', 'Tch. Você é mais chato do que parece.', { sincerity: 1 }, { loyalty: 1 }),
      o('E se a gente lutar de verdade, sem trapaça?', '…Você sempre acha uma terceira saída, né?', { imagination: 1, stubbornness: 1 }),
    ],
  },
  freeNight: {
    id: 'freeNight',
    npc: 'oren',
    requires: { after: 'exercise', level: 2 },
    text: 'Você está mais forte. Tire a noite de folga. O que vai fazer com ela?',
    options: [
      o('Ficar com os outros no fogo.', 'Ninguém atravessa o vale sozinho.', { trust: 1, empathy: 1 }),
      o('Estudar os pergaminhos do santuário.', 'Leia o terceiro rolo. Ninguém lê o terceiro rolo.', { curiosity: 1 }, { knowledge: 1 }),
      o('Treinar até cansar.', 'Folga também é treino, mas… faça como achar melhor.', { perseverance: 1, competitiveness: 1 }),
    ],
  },
  lostFight: {
    id: 'lostFight',
    npc: 'oren',
    requires: { after: 'exercise', deaths: 1 },
    text: 'Você caiu lá fora. Todos caem. O que importa é o que fará agora.',
    options: [
      o('Treinar o dobro.', 'O dobro não. O certo. Mas gosto da vontade.', { perseverance: 1, stubbornness: 1 }),
      o('Repassar cada erro antes de dormir.', 'Cuidado para não carregar a luta para dentro do sono.', { discipline: 1, anxiety: 1 }),
      o('Esquecer essa luta e seguir em frente.', 'Há sabedoria em soltar. E perigo também.', { detachment: 1, impulsivity: 1 }),
    ],
  },
  herald: {
    id: 'herald',
    npc: 'herald',
    text: 'O Senhor de Varn procura gente forte. Jure lealdade a ele e terá terras, armas e homens.',
    options: [
      o('Aceito.', 'Sábia escolha. O Senhor recompensa os seus.', { competitiveness: 1 }, { power: 1 }),
      o('Recuso. E diga a ele que não tenho dono.', 'Palavras perigosas. Vou lembrar do seu rosto.', { courage: 1 }, { freedom: 1 }),
      o('Aceito… (e um dia derrubo ele por dentro).', 'Bem-vindo, então.', { sincerity: -1 }, { vengeance: 1 }),
    ],
  },
  animal: {
    id: 'animal',
    npc: 'huntress',
    text: 'Uma raposa-de-cristal ferida bem no meio da minha caçada. Vale uma fortuna. Quer ela?',
    options: [
      o('Vamos cuidar dela.', 'Ela não vai esquecer. Elas nunca esquecem.', { empathy: 1 }, { nature: 1 }),
      o('Presa fácil. Eu fico com ela.', 'Rápido e limpo, pelo menos.', { greed: 1 }, { nature: -1 }),
      o('Antes, quero ver o que a feriu.', 'Boa pergunta. Pegadas grandes… vindas da ponte.', { curiosity: 1, courage: 1 }),
    ],
  },
  prisoner: {
    id: 'prisoner',
    npc: 'lys',
    text: 'Pegamos um batedor dos Lançadores rondando o acampamento. Ele se rendeu. A decisão é sua, forasteiro.',
    options: [
      o('Ele teria matado a gente. Que pague.', 'Feito. Os outros vão entender o recado.', { wrath: 1 }, { vengeance: 1, mercy: -1 }),
      o('Soltem ele. Quem se rende merece viver.', 'Generoso. Espero que ele lembre disso.', { empathy: 1 }, { mercy: 1 }),
      o('Primeiro quero saber o que ele viu.', 'Ele fala muito quando tem medo. Os ninhos ficam nas encostas.', { curiosity: 1, discipline: 1 }, { knowledge: 1 }),
    ],
  },
  bridge: {
    id: 'bridge',
    npc: null,
    text: 'O Guardião bloqueia a única ponte do vale. Daqui dá para ouvir a respiração dele, lenta e pesada.',
    options: [
      o('Avanço e enfrento.', 'Você firma o passo na madeira da ponte.', { courage: 1, impulsivity: 1 }),
      o('Observo até achar uma fraqueza.', 'Ele sempre gira o corpo antes do golpe pesado. Anotado.', { discipline: 1, curiosity: 1 }),
      o('Volto e me preparo melhor.', 'Não há vergonha em escolher a hora da luta.', { anxiety: 1, perseverance: 1 }),
    ],
  },
};

export const DIALOGUE_TRAIT_STEP = 8;
export const DIALOGUE_TRAIT_JITTER = 3;
export const DIALOGUE_VALUE_STEP = 12;

export function applyDialogueChoice(traits: Traits, values: Values, opt: DialogueOption, rng: Rng): void {
  for (const [t, dir] of Object.entries(opt.traits) as Array<[TraitId, 1 | -1]>) {
    traits[t] = clamp(traits[t] + dir * (DIALOGUE_TRAIT_STEP + rng.range(-DIALOGUE_TRAIT_JITTER, DIALOGUE_TRAIT_JITTER)), 0, 100);
  }
  for (const [v, dir] of Object.entries(opt.values) as Array<[ValueId, 1 | -1]>) {
    values[v] = clamp(values[v] + dir * DIALOGUE_VALUE_STEP, -50, 50);
  }
}
