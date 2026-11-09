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
  /** uma ação (mostrada como [gesto]) em vez de uma fala */
  gesture?: boolean;
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
/** Opção que é um gesto (uma ação no mundo), não uma fala. */
const g = (
  text: string,
  reply: string,
  traits: Partial<Record<TraitId, 1 | -1>> = {},
  values: Partial<Record<ValueId, 1 | -1>> = {},
): DialogueOption => ({ text, reply, traits, values, gesture: true });

export const DIALOGUES: Record<DialogueId, DialogueDef> = {
  exercise: {
    id: 'exercise',
    npc: 'oren',
    text: 'Antes de sair, quero ver você girar a Maré para a defesa. Cinco vezes, aqui, na minha frente. Sei que parece inútil.',
    options: [
      g('Treinar agora, como ele mandou', 'Bom. Mostre: gire a Maré para a defesa (roda do mouse ↓ ou Z), cinco vezes.', { discipline: 1 }, { loyalty: 1 }),
      o('Para que serve isso?', 'Quando um golpe pesado vier, o chão fica vermelho. Gire para a defesa no último instante e ele perde metade da força: Maré perfeita. Pergunte sempre.', { curiosity: 1, sincerity: 1 }),
      g('Ir embora e treinar do seu jeito', 'Hm. Então que o seu jeito seja bom.', { stubbornness: 1 }, { freedom: 1 }),
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
    text: 'Um homem sentado na beira da trilha, a perna sangrando. "Por favor… pode me ajudar a chegar ao santuário?" (Algo no olhar dele não parece certo.)',
    options: [
      g('Apoiá-lo no ombro até o santuário', 'Obrigado… há quem diga que bondade não paga. Eu discordo.', { empathy: 1, trust: 1 }, { mercy: 1 }),
      g('Ajudar, mas fazê-lo andar na sua frente', 'Justo. Eu faria o mesmo.', { empathy: 1, anxiety: 1 }),
      g('Seguir caminho', '…Então siga. Que a trilha seja gentil com você.', { empathy: -1, trust: -1 }),
    ],
  },
  temple: {
    id: 'temple',
    npc: 'pilgrim',
    text: 'Lá em cima, na Colina Norte, há um altar abandonado. As moedas de ouro continuam lá. Ninguém viria cobrar. Você pegaria?',
    options: [
      o('Não. Deixo onde está.', 'Há quem respeite o que não é seu mesmo sem plateia. Vou lembrar disso.', { greed: -1 }, { law: 1 }),
      o('Se ninguém cobra, é de quem pega.', 'O ouro não pesa na mão. Pesa depois.', { greed: 1 }, { law: -1 }),
      o('Onde fica, exatamente?', 'Ao norte, subindo a rampa da colina. Marquei no seu mapa.', { curiosity: 1 }),
    ],
  },
  tournament: {
    id: 'tournament',
    npc: 'kael',
    requires: { after: 'rival' },
    text: 'Vamos duelar na trilha, a leste do santuário. Diga a Oren que treinamos juntos, e ninguém precisa saber que eu vou vencer roubando.',
    options: [
      o('Fechado. Eu minto para ele.', 'Sabia que você entendia como o mundo funciona. Te espero na trilha.', { sincerity: -1 }, { power: 1 }),
      o('Não. Vou contar a verdade a Oren.', 'Tch. Sem duelo, então. Você é mais chato do que parece.', { sincerity: 1 }, { loyalty: 1 }),
      o('E se a gente lutar de verdade, sem trapaça?', '…Você sempre acha uma terceira saída, né? Te espero na trilha.', { imagination: 1, stubbornness: 1 }),
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
    text: 'O Senhor de Varn procura gente forte. Ajoelhe e jure lealdade a ele: terá uma arma agora, e terras depois.',
    options: [
      g('Ajoelhar e jurar', 'Sábia escolha. Tome: uma lâmina digna de quem serve ao Senhor. Em Varn, ele vai cobrar.', { competitiveness: 1 }, { power: 1 }),
      o('Recuso. E diga a ele que não tenho dono.', 'Palavras perigosas. Vou lembrar do seu rosto. E os homens dele também.', { courage: 1 }, { freedom: 1 }),
      g('Jurar com os dedos cruzados', 'Bem-vindo, então. Tome a lâmina.', { sincerity: -1 }, { vengeance: 1 }),
    ],
  },
  animal: {
    id: 'animal',
    npc: 'huntress',
    text: 'Uma raposa-de-cristal ferida bem no meio da minha caçada. Vale uma fortuna. Quer ela?',
    options: [
      g('Cuidar da ferida dela', 'Ela não vai esquecer. Elas nunca esquecem.', { empathy: 1 }, { nature: 1 }),
      g('Ficar com ela', 'Rápido e limpo, pelo menos. O cristal vira um bom amuleto.', { greed: 1 }, { nature: -1 }),
      g('Seguir as pegadas de quem a feriu', 'Pegadas grandes… vindas da ponte. E uma delas afunda menos: o Guardião poupa a perna esquerda.', { curiosity: 1, courage: 1 }),
    ],
  },
  prisoner: {
    id: 'prisoner',
    npc: 'lys',
    text: 'Pegamos um batedor dos Lançadores rondando o acampamento. Ele se rendeu. A decisão é sua, forasteiro.',
    options: [
      g('Executar o batedor', 'Feito. Os outros vão entender o recado — e não vão mais se render a você.', { wrath: 1 }, { vengeance: 1, mercy: -1 }),
      g('Cortar as cordas', 'Generoso. Ele vai contar aos outros que você poupa quem larga a arma.', { empathy: 1 }, { mercy: 1 }),
      g('Interrogá-lo antes', 'Ele fala muito quando tem medo. Os ninhos ficam nas encostas: marquei no seu mapa.', { curiosity: 1, discipline: 1 }, { knowledge: 1 }),
    ],
  },
  bridge: {
    id: 'bridge',
    npc: null,
    text: 'O Guardião bloqueia a única ponte do vale. Daqui dá para ouvir a respiração dele, lenta e pesada.',
    options: [
      g('Avançar e enfrentar', 'Você firma o passo na madeira da ponte.', { courage: 1, impulsivity: 1 }),
      g('Observar até achar uma fraqueza', 'Ele sempre gira o corpo antes do golpe pesado. Agora você vai ver chegando.', { discipline: 1, curiosity: 1 }),
      g('Voltar e se preparar melhor', 'Não há vergonha em escolher a hora da luta. Quando voltar, volte calmo.', { anxiety: 1, perseverance: 1 }),
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
