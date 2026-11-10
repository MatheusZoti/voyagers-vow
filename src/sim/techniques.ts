import { PACT_IDS, type EloSlot, type ModId, type PactId } from './elos';
import type { Affinity } from './flow/affinity';
import type { Posture } from './flow/flow';

/**
 * Magias determinísticas, feitas por nós (sem fábrica de magias). Cada uma tem uma afinidade
 * (o tipo principal) e um papel. Caem de criaturas e de livros; o jogador as equipa nos Elos.
 */

export const SPELL_IDS = [
  'votePunch',
  'point',
  'flowLance',
  'orbRain',
  'elasticPull',
  'discharge',
  'chains',
  'conjuredBlade',
  'repel',
  'discord',
  // Segunda leva: duas por afinidade, para os Elos mais altos.
  'secondWind',
  'quake',
  'needleFan',
  'fallingStar',
  'acidPool',
  'razorWhip',
  'conjuredWard',
  'groundSpikes',
  'kneel',
  'gravityWell',
  // Terceira leva: completa duas magias por nível (1 a 8) em cada afinidade.
  'ironSkin',
  'bullRush',
  'risingUppercut',
  'bloodFrenzy',
  'leechStrike',
  'warCry',
  'meteorLeap',
  'unbreakable',
  'thousandFists',
  'executioner',
  'titanWrath',
  'lastStand',
  'seekerBolt',
  'twinLance',
  'burstOrb',
  'flowBarrage',
  'piercingRay',
  'clusterRain',
  'arcaneMortar',
  'ricochet',
  'starfall',
  'sunderingLance',
  'cataclysm',
  'needleStorm',
  'staticTouch',
  'elasticSnare',
  'forkLightning',
  'venomWhip',
  'stormVortex',
  'rubberBody',
  'acidRain',
  'thunderLash',
  'chainStorm',
  'livingWires',
  'metamorphosis',
  'plasmaNova',
  'conjuredKnives',
  'conjuredHammer',
  'bladeFence',
  'greatsword',
  'ironCage',
  'bulwark',
  'ballista',
  'spikeField',
  'swordRain',
  'guillotine',
  'endlessArmory',
  'fortress',
  'backOff',
  'mindSpike',
  'discordChoir',
  'weightOfCommand',
  'sleepOrder',
  'puppetStrings',
  'blackHole',
  'sovereignVoice',
  'sentence',
  'rebellion',
  'singularity',
  'absoluteOrder',
] as const;
export type SpellId = (typeof SPELL_IDS)[number];
/** Nome antigo, mantido para não espalhar renomeações. */
export type TechniqueId = SpellId;

export interface SpellDef {
  id: SpellId;
  name: string;
  affinity: Affinity;
  /** papel da magia, como o jogador lê */
  role: string;
  /** nível mínimo na própria afinidade (o Elo mínimo soma a distância no pentágono) */
  minLevel: number;
  baseDamage: number;
  /** alcance base (m) */
  range: number;
  /** raio base do efeito (m) */
  radius: number;
  desc: string;
  /** ícone de linha (client/ui/icons) */
  icon: string;
  /** Restrições que fazem sentido para esta magia; as outras nem aparecem. */
  pacts: PactId[];
  /** Modificadores de forja com efeito nesta magia. */
  mods: ModId[];
  /** Números de comportamento próprios da magia: a simulação lê daqui e o Grimório mostra. */
  fx: SpellFx;
}

/** Como a magia escolhe e atinge os alvos. */
export type SpellShape =
  | 'dash'
  | 'charge'
  | 'beam'
  | 'delayed'
  | 'cone'
  | 'chain'
  | 'targetArea'
  | 'arc'
  | 'aura'
  | 'mark'
  | 'self'
  | 'fan'
  | 'zone'
  | 'ward'
  | 'single'
  | 'vortex'
  | 'leap';

export interface SpellFx {
  shape: SpellShape;
  /** atraso entre lançar e atingir (s) */
  delayS?: number;
  /** meia-abertura do cone (graus) */
  coneHalfDeg?: number;
  /** abertura do golpe em arco (graus) */
  arcDeg?: number;
  /** saltos extras do raio depois do primeiro alvo */
  jumps?: number;
  /** dano mantido a cada salto (0,85 = −15% por salto) */
  jumpFalloff?: number;
  /** prende no lugar (s); chefes ficam menos */
  rootS?: number;
  rootBossS?: number;
  /** atordoamento próprio da magia (s) */
  stunS?: number;
  /** empurrão (m) */
  pushM?: number;
  /** a cada N acertos no mesmo alvo, ignora a armadura */
  pierceEvery?: number;
  /** duração do controle da mente (s) e dano do controlado contra aliados */
  charmS?: number;
  charmDamageMult?: number;
  charmSeekM?: number;
  /** Ponto: janela da carga, defesa zero e multiplicadores do crítico */
  chargeS?: number;
  defenseZeroS?: number;
  critBase?: number;
  /** cura: fração da vida máxima; bônus extra abaixo de lowHpFrac */
  healFrac?: number;
  healLowBonus?: number;
  lowHpFrac?: number;
  /** leque: quantos disparos e abertura total (graus) */
  fanCount?: number;
  fanDeg?: number;
  /** zona: duração (s) e intervalo entre pulsos (s) */
  durationS?: number;
  tickS?: number;
  /** escudo: fração da vida máxima absorvida, por quanto tempo (s) */
  shieldFrac?: number;
  shieldS?: number;
  /** proteção: o dano que você recebe é multiplicado por guardMult durante guardS segundos */
  guardS?: number;
  guardMult?: number;
  /** fúria: o dano que você causa é multiplicado por empowerMult durante empowerS segundos */
  empowerS?: number;
  empowerMult?: number;
  /** fração do dano causado que volta como vida */
  lifesteal?: number;
  /** execução: dano × executeMult em alvos com vida abaixo de executeBelow */
  executeBelow?: number;
  executeMult?: number;
  /** sempre ignora a armadura */
  pierce?: boolean;
  /** dano contínuo: dotTicks pulsos (um a cada 0,5 s) de dotFrac do dano, ignorando armadura */
  dotTicks?: number;
  dotFrac?: number;
  /** repete o golpe: quantas ondas e o intervalo entre elas (s) */
  waves?: number;
  waveS?: number;
  /** leque: cada disparo atravessa todos os inimigos */
  through?: boolean;
  /** alvo único: puxa o alvo até você */
  pull?: boolean;
  /** zona: arrasta para o centro a cada pulso (m) */
  pullM?: number;
}

/** Regras comuns a todas as magias (a simulação lê daqui; o Grimório mostra). */
export const SPELL_RULES = {
  /** recuo de cada acerto de magia (m/s de impulso) */
  knockback: 4,
  /** elites sofrem só 35% do recuo; o chefe não se move */
  eliteKnockMult: 0.35,
  /** puxões e empurrões movem elites pela metade */
  eliteShoveMult: 0.5,
  /** chefes sofrem 40% de qualquer atordoamento */
  bossStunMult: 0.4,
  /** Abalo: atordoa por 0,8 s ao acertar */
  stunModS: 0.8,
  /** Restaurar: cura 6% da vida máxima se acertar alguém */
  restoreFrac: 0.06,
} as const;

const ALL_PACTS: PactId[] = [...PACT_IDS];
const NO_MISS: PactId[] = PACT_IDS.filter((id) => id !== 'missLock');

const SELF_PACTS: PactId[] = NO_MISS.filter((id) => id !== 'eliteOnly' && id !== 'closeQuarters' && id !== 'surrounded');
const MARK_PACTS: PactId[] = PACT_IDS.filter((id) => id !== 'eliteOnly' && id !== 'missLock');
/** Restrições e forja que fazem sentido para cada forma de magia. */
const SHAPE_PACTS: Record<SpellShape, PactId[]> = {
  dash: ALL_PACTS,
  leap: ALL_PACTS,
  charge: NO_MISS,
  beam: ALL_PACTS,
  delayed: ALL_PACTS,
  cone: NO_MISS,
  chain: ALL_PACTS,
  targetArea: NO_MISS,
  arc: ALL_PACTS,
  aura: ALL_PACTS,
  mark: MARK_PACTS,
  self: SELF_PACTS,
  ward: SELF_PACTS,
  fan: ALL_PACTS,
  zone: NO_MISS,
  single: ALL_PACTS,
  vortex: ALL_PACTS,
};
const SHAPE_MODS: Record<SpellShape, ModId[]> = {
  dash: ['damage', 'area', 'range', 'cadence', 'restore', 'stun', 'shatter'],
  leap: ['damage', 'area', 'range', 'cadence', 'restore', 'stun', 'shatter'],
  charge: ['damage', 'cadence', 'restore', 'stun', 'shatter'],
  beam: ['damage', 'area', 'range', 'cadence', 'restore', 'stun', 'shatter'],
  delayed: ['damage', 'area', 'range', 'cadence', 'stun', 'shatter'],
  cone: ['damage', 'range', 'cadence', 'stun', 'restore'],
  chain: ['damage', 'area', 'range', 'cadence', 'stun', 'shatter'],
  targetArea: ['damage', 'area', 'range', 'cadence', 'stun'],
  arc: ['damage', 'range', 'cadence', 'restore', 'stun', 'shatter'],
  aura: ['damage', 'area', 'cadence', 'restore', 'stun', 'shatter'],
  mark: ['range', 'cadence'],
  self: ['cadence'],
  ward: ['cadence'],
  fan: ['damage', 'range', 'cadence', 'restore', 'stun', 'shatter'],
  zone: ['damage', 'area', 'range', 'cadence'],
  single: ['damage', 'range', 'cadence', 'restore', 'shatter'],
  vortex: ['damage', 'area', 'range', 'cadence', 'stun'],
};

/** Magia descrita só pelos dados; Restrições e forja vêm da forma. */
function mk(
  id: SpellId,
  name: string,
  affinity: Affinity,
  minLevel: number,
  role: string,
  icon: string,
  baseDamage: number,
  range: number,
  radius: number,
  desc: string,
  fx: SpellFx,
): SpellDef {
  const mods = SHAPE_MODS[fx.shape].filter((m) => (m !== 'shatter' || !fx.pierce) && (m !== 'area' || radius > 0 || fx.shape === 'chain'));
  return { id, name, affinity, role, minLevel, baseDamage, range, radius, desc, icon, pacts: SHAPE_PACTS[fx.shape], mods: fx.shape === 'mark' && radius > 0 ? [...mods, 'area'] : mods, fx };
}

export const SPELLS: Record<SpellId, SpellDef> = {
  // ----- Vigor
  votePunch: {
    id: 'votePunch',
    name: 'Punho do Voto',
    affinity: 'vigor',
    role: 'Golpe',
    minLevel: 1,
    baseDamage: 20,
    range: 2.4,
    radius: 1.1,
    desc: 'Avança e golpeia com o Fluxo no punho. A cada 3 acertos no mesmo alvo, ignora a armadura.',
    icon: 'signature',
    pacts: ALL_PACTS,
    mods: ['damage', 'area', 'range', 'cadence', 'restore', 'stun', 'shatter'],
    fx: { shape: 'dash', pierceEvery: 3 },
  },
  point: {
    id: 'point',
    name: 'Ponto',
    affinity: 'vigor',
    role: 'Reforço',
    minLevel: 1,
    baseDamage: 0,
    range: 0,
    radius: 0,
    desc: 'Concentra todo o Fluxo no próximo golpe: crítico gigante. Defesa zero por 2 s.',
    icon: 'point',
    // Ponto não é um golpe em si (carrega o próximo): "se errar" não se aplica.
    pacts: NO_MISS,
    mods: ['damage', 'cadence', 'restore', 'stun', 'shatter'],
    fx: { shape: 'charge', chargeS: 4, defenseZeroS: 2, critBase: 2.6 },
  },
  // ----- Projeção
  flowLance: {
    id: 'flowLance',
    name: 'Lança de Fluxo',
    affinity: 'projection',
    role: 'Projétil',
    minLevel: 1,
    baseDamage: 14,
    range: 9,
    radius: 0.55,
    desc: 'Dispara uma lança de Fluxo em linha reta que atravessa todos os inimigos no caminho.',
    icon: 'lance',
    pacts: ALL_PACTS,
    mods: ['damage', 'area', 'range', 'cadence', 'restore', 'stun', 'shatter'],
    fx: { shape: 'beam' },
  },
  orbRain: {
    id: 'orbRain',
    name: 'Chuva de Esferas',
    affinity: 'projection',
    role: 'Área',
    minLevel: 1,
    baseDamage: 16,
    range: 8,
    radius: 2.2,
    desc: 'Marca um ponto à distância; meio segundo depois, esferas de Fluxo caem sobre ele.',
    icon: 'orbs',
    pacts: ALL_PACTS,
    mods: ['damage', 'area', 'range', 'cadence', 'stun', 'shatter'],
    fx: { shape: 'delayed', delayS: 0.6 },
  },
  // ----- Mutação
  elasticPull: {
    id: 'elasticPull',
    name: 'Fluxo Elástico',
    affinity: 'mutation',
    role: 'Puxão',
    minLevel: 1,
    baseDamage: 9,
    range: 6.5,
    radius: 0,
    desc: 'Lança fios elásticos num cone e puxa os inimigos para perto de você. O chefe não se move.',
    icon: 'pull',
    pacts: NO_MISS,
    mods: ['damage', 'range', 'cadence', 'stun', 'restore'],
    fx: { shape: 'cone', coneHalfDeg: 40 },
  },
  discharge: {
    id: 'discharge',
    name: 'Descarga',
    affinity: 'mutation',
    role: 'Elétrico',
    minLevel: 1,
    baseDamage: 13,
    range: 7,
    radius: 4,
    desc: 'Um raio que salta do alvo mais próximo da mira para até 3 inimigos vizinhos.',
    icon: 'bolt',
    pacts: ALL_PACTS,
    mods: ['damage', 'area', 'range', 'cadence', 'stun', 'shatter'],
    fx: { shape: 'chain', jumps: 3, jumpFalloff: 0.85 },
  },
  // ----- Forja
  chains: {
    id: 'chains',
    name: 'Correntes',
    affinity: 'forge',
    role: 'Controle',
    minLevel: 1,
    baseDamage: 8,
    range: 7,
    radius: 2.4,
    desc: 'Correntes de Fluxo brotam do chão e prendem os inimigos na área por 2,5 s. Funcionam em elites.',
    icon: 'chains',
    pacts: NO_MISS,
    mods: ['damage', 'area', 'range', 'cadence', 'stun'],
    fx: { shape: 'targetArea', rootS: 2.5, rootBossS: 1.2 },
  },
  conjuredBlade: {
    id: 'conjuredBlade',
    name: 'Lâmina Conjurada',
    affinity: 'forge',
    role: 'Golpe amplo',
    minLevel: 1,
    baseDamage: 20,
    range: 3,
    radius: 0,
    desc: 'Materializa uma lâmina e corta em meia-lua à sua frente.',
    icon: 'blade',
    pacts: ALL_PACTS,
    mods: ['damage', 'range', 'cadence', 'restore', 'stun', 'shatter'],
    fx: { shape: 'arc', arcDeg: 180 },
  },
  // ----- Domínio
  repel: {
    id: 'repel',
    name: 'Comando de Recuo',
    affinity: 'dominion',
    role: 'Empurrão',
    minLevel: 1,
    baseDamage: 8,
    range: 0,
    radius: 3.5,
    desc: 'Uma ordem que empurra todos os inimigos ao redor e os atordoa por um instante. O chefe resiste.',
    icon: 'repel',
    pacts: NO_MISS,
    mods: ['damage', 'area', 'cadence', 'stun', 'restore'],
    fx: { shape: 'aura', pushM: 3, stunS: 0.6 },
  },
  discord: {
    id: 'discord',
    name: 'Marca da Discórdia',
    affinity: 'dominion',
    role: 'Controle',
    minLevel: 1,
    baseDamage: 0,
    range: 8,
    radius: 0,
    desc: 'Marca o inimigo comum mais próximo da mira: por 6 s ele luta contra os próprios aliados.',
    icon: 'discord',
    // Só funciona em comuns: "só contra elites" não faz sentido.
    pacts: PACT_IDS.filter((id) => id !== 'eliteOnly' && id !== 'missLock'),
    mods: ['range', 'cadence'],
    fx: { shape: 'mark', charmS: 6, charmDamageMult: 1.5, charmSeekM: 12 },
  },
  // ===== Segunda leva =====
  // ----- Vigor
  secondWind: {
    id: 'secondWind',
    name: 'Segundo Fôlego',
    affinity: 'vigor',
    role: 'Cura',
    minLevel: 2,
    baseDamage: 0,
    range: 0,
    radius: 0,
    desc: 'Puxa o Fluxo de volta para o corpo e fecha as feridas. Cura mais quando você está por um fio.',
    icon: 'heart',
    pacts: NO_MISS.filter((id) => id !== 'eliteOnly' && id !== 'closeQuarters' && id !== 'surrounded'),
    mods: ['cadence'],
    fx: { shape: 'self', healFrac: 0.18, healLowBonus: 0.12, lowHpFrac: 0.35 },
  },
  quake: {
    id: 'quake',
    name: 'Pisão Sísmico',
    affinity: 'vigor',
    role: 'Área',
    minLevel: 3,
    baseDamage: 22,
    range: 0,
    radius: 2.8,
    desc: 'Bate o pé com o Fluxo nas pernas: o chão treme ao seu redor, fere e desequilibra quem estiver perto.',
    icon: 'quake',
    pacts: ALL_PACTS,
    mods: ['damage', 'area', 'cadence', 'restore', 'stun', 'shatter'],
    fx: { shape: 'aura', pushM: 1, stunS: 0.4 },
  },
  // ----- Projeção
  needleFan: {
    id: 'needleFan',
    name: 'Leque de Agulhas',
    affinity: 'projection',
    role: 'Leque',
    minLevel: 2,
    baseDamage: 9,
    range: 7,
    radius: 0.35,
    desc: 'Cinco agulhas de Fluxo em leque. Cada uma para no primeiro inimigo: de perto, várias acertam o mesmo alvo.',
    icon: 'fan',
    pacts: ALL_PACTS,
    mods: ['damage', 'range', 'cadence', 'restore', 'stun', 'shatter'],
    fx: { shape: 'fan', fanCount: 5, fanDeg: 50 },
  },
  fallingStar: {
    id: 'fallingStar',
    name: 'Estrela Cadente',
    affinity: 'projection',
    role: 'Bombardeio',
    minLevel: 4,
    baseDamage: 36,
    range: 9,
    radius: 3,
    desc: 'Chama uma estrela de Fluxo sobre o ponto mirado. Demora a cair, mas atordoa quem estiver embaixo.',
    icon: 'star',
    pacts: ALL_PACTS,
    mods: ['damage', 'area', 'range', 'cadence', 'stun', 'shatter'],
    fx: { shape: 'delayed', delayS: 1.2, stunS: 0.8 },
  },
  // ----- Mutação
  acidPool: {
    id: 'acidPool',
    name: 'Poça Corrosiva',
    affinity: 'mutation',
    role: 'Zona',
    minLevel: 2,
    baseDamage: 5,
    range: 7,
    radius: 2.2,
    desc: 'Transforma o Fluxo em ácido no chão. Quem pisa na poça sofre a cada meio segundo, e o ácido ignora armadura.',
    icon: 'drop',
    pacts: NO_MISS,
    mods: ['damage', 'area', 'range', 'cadence'],
    fx: { shape: 'zone', durationS: 4, tickS: 0.5 },
  },
  razorWhip: {
    id: 'razorWhip',
    name: 'Chicote Cortante',
    affinity: 'mutation',
    role: 'Golpe longo',
    minLevel: 3,
    baseDamage: 19,
    range: 4.8,
    radius: 0,
    desc: 'O Fluxo vira um chicote afiado que estala num arco estreito e longo à sua frente.',
    icon: 'whip',
    pacts: ALL_PACTS,
    mods: ['damage', 'range', 'cadence', 'restore', 'stun', 'shatter'],
    fx: { shape: 'arc', arcDeg: 70 },
  },
  // ----- Forja
  conjuredWard: {
    id: 'conjuredWard',
    name: 'Égide Conjurada',
    affinity: 'forge',
    role: 'Escudo',
    minLevel: 2,
    baseDamage: 0,
    range: 0,
    radius: 0,
    desc: 'Materializa uma carapaça de Fluxo que absorve o dano até quebrar ou se desfazer.',
    icon: 'shield',
    pacts: NO_MISS.filter((id) => id !== 'eliteOnly' && id !== 'closeQuarters' && id !== 'surrounded'),
    mods: ['cadence'],
    fx: { shape: 'ward', shieldFrac: 0.25, shieldS: 6 },
  },
  groundSpikes: {
    id: 'groundSpikes',
    name: 'Estacas do Chão',
    affinity: 'forge',
    role: 'Emboscada',
    minLevel: 3,
    baseDamage: 26,
    range: 7,
    radius: 1.7,
    desc: 'Estacas de Fluxo brotam no ponto mirado logo depois de lançar, ferem e prendem quem estiver ali.',
    icon: 'spikes',
    pacts: ALL_PACTS,
    mods: ['damage', 'area', 'range', 'cadence', 'stun', 'shatter'],
    fx: { shape: 'delayed', delayS: 0.4, rootS: 1, rootBossS: 0.4 },
  },
  // ----- Domínio
  kneel: {
    id: 'kneel',
    name: 'Ordem: Ajoelhe',
    affinity: 'dominion',
    role: 'Atordoar',
    minLevel: 2,
    baseDamage: 10,
    range: 7,
    radius: 0,
    desc: 'Uma ordem a um só inimigo, o mais perto da mira: ele cai de joelhos e fica atordoado. Funciona em elites.',
    icon: 'kneel',
    pacts: ALL_PACTS,
    mods: ['damage', 'range', 'cadence', 'restore', 'shatter'],
    fx: { shape: 'single', stunS: 2 },
  },
  gravityWell: {
    id: 'gravityWell',
    name: 'Poço de Gravidade',
    affinity: 'dominion',
    role: 'Agrupar',
    minLevel: 3,
    baseDamage: 10,
    range: 8,
    radius: 3.6,
    desc: 'Dobra o espaço no ponto mirado e arrasta todos ao redor para o centro. Ótimo antes de uma magia de área.',
    icon: 'well',
    pacts: ALL_PACTS,
    mods: ['damage', 'area', 'range', 'cadence', 'stun'],
    fx: { shape: 'vortex' },
  },
  // ===== Terceira leva: duas magias por nível (1 a 8) em cada afinidade =====
  // ----- Vigor
  ironSkin: mk('ironSkin', 'Pele de Ferro', 'vigor', 2, 'Proteção', 'ironSkin', 0, 0, 0, 'Endurece o corpo com o Fluxo: por alguns segundos, todo golpe dói bem menos.', {
    shape: 'self', healFrac: 0, healLowBonus: 0, lowHpFrac: 0, guardS: 5, guardMult: 0.6,
  }),
  bullRush: mk('bullRush', 'Investida do Touro', 'vigor', 3, 'Investida', 'bullRush', 22, 5, 1.3, 'Uma investida longa de ombro: atropela, empurra e deixa tonto quem estiver no fim do caminho.', {
    shape: 'dash', pierceEvery: 3, pushM: 2.5, stunS: 0.5,
  }),
  risingUppercut: mk('risingUppercut', 'Gancho Ascendente', 'vigor', 4, 'Atordoar', 'risingUppercut', 34, 2.6, 0, 'Um gancho de baixo para cima com todo o peso do corpo. Quem leva fica atordoado.', {
    shape: 'arc', arcDeg: 120, stunS: 1.2,
  }),
  bloodFrenzy: mk('bloodFrenzy', 'Fúria de Sangue', 'vigor', 4, 'Fúria', 'bloodFrenzy', 0, 0, 0, 'Deixa o Fluxo ferver nas veias: por alguns segundos, todos os seus golpes e magias ferem mais.', {
    shape: 'self', healFrac: 0, healLowBonus: 0, lowHpFrac: 0, empowerS: 6, empowerMult: 1.35,
  }),
  leechStrike: mk('leechStrike', 'Golpe Vampírico', 'vigor', 5, 'Roubo de vida', 'leechStrike', 36, 2.8, 1.2, 'Avança e golpeia arrancando o Fluxo do inimigo: metade do dano causado volta como vida.', {
    shape: 'dash', pierceEvery: 3, lifesteal: 0.5,
  }),
  warCry: mk('warCry', 'Brado de Guerra', 'vigor', 5, 'Atordoar em área', 'warCry', 14, 0, 5, 'Um grito carregado de Fluxo que paralisa de medo todos ao redor.', {
    shape: 'aura', pushM: 0.5, stunS: 1.5,
  }),
  meteorLeap: mk('meteorLeap', 'Salto do Meteoro', 'vigor', 6, 'Salto', 'meteorLeap', 44, 7, 3, 'Salta até o ponto mirado e cai como um meteoro: fere, empurra e desequilibra todos na queda.', {
    shape: 'leap', pushM: 1.5, stunS: 0.6,
  }),
  unbreakable: mk('unbreakable', 'Inquebrável', 'vigor', 6, 'Proteção', 'unbreakable', 0, 0, 0, 'Fecha as feridas e trava o corpo: cura na hora e reduz muito o dano recebido por alguns segundos.', {
    shape: 'self', healFrac: 0.12, healLowBonus: 0.08, lowHpFrac: 0.35, guardS: 4, guardMult: 0.4,
  }),
  thousandFists: mk('thousandFists', 'Mil Punhos', 'vigor', 7, 'Rajada', 'thousandFists', 15, 3, 0, 'Uma saraivada de socos à sua frente: cinco golpes seguidos em menos de um segundo.', {
    shape: 'arc', arcDeg: 100, waves: 5, waveS: 0.15,
  }),
  executioner: mk('executioner', 'Golpe do Carrasco', 'vigor', 7, 'Execução', 'executioner', 50, 3, 1.2, 'Avança para o golpe final. Ignora a armadura e fere muito mais quem já está quase caindo.', {
    shape: 'dash', pierceEvery: 1, pierce: true, executeBelow: 0.35, executeMult: 2.5,
  }),
  titanWrath: mk('titanWrath', 'Ira do Titã', 'vigor', 8, 'Devastação', 'titanWrath', 70, 0, 5.5, 'Golpeia o chão com tudo o que tem: a terra explode ao redor, arremessa e atordoa todos por perto.', {
    shape: 'aura', pushM: 4, stunS: 1.5,
  }),
  lastStand: mk('lastStand', 'Último Voto', 'vigor', 8, 'Superação', 'lastStand', 0, 0, 0, 'Seu voto final: cura muito, reduz o dano recebido e aumenta o dano causado por vários segundos.', {
    shape: 'self', healFrac: 0.35, healLowBonus: 0.25, lowHpFrac: 0.35, guardS: 6, guardMult: 0.5, empowerS: 6, empowerMult: 1.5,
  }),
  // ----- Projeção
  seekerBolt: mk('seekerBolt', 'Dardo Guiado', 'projection', 2, 'Alvo único', 'seekerBolt', 22, 9, 0, 'Um dardo de Fluxo que persegue o inimigo mais próximo da mira. Não precisa de pontaria.', {
    shape: 'single', stunS: 0,
  }),
  twinLance: mk('twinLance', 'Lanças Trigêmeas', 'projection', 3, 'Leque perfurante', 'twinLance', 16, 9, 0.45, 'Três lanças de Fluxo num leque estreito. Cada uma atravessa todos os inimigos no caminho.', {
    shape: 'fan', fanCount: 3, fanDeg: 24, through: true,
  }),
  burstOrb: mk('burstOrb', 'Esfera Explosiva', 'projection', 3, 'Explosão', 'burstOrb', 26, 9, 2.4, 'Uma esfera que estoura quase na hora no ponto mirado e espalha os inimigos para longe do centro.', {
    shape: 'delayed', delayS: 0.35, pushM: 2,
  }),
  flowBarrage: mk('flowBarrage', 'Rajada de Fluxo', 'projection', 4, 'Rajada', 'flowBarrage', 13, 9, 0.5, 'Quatro disparos seguidos em linha reta, cada um na direção para onde você está virado na hora.', {
    shape: 'beam', waves: 4, waveS: 0.2,
  }),
  piercingRay: mk('piercingRay', 'Raio Perfurante', 'projection', 5, 'Perfurar', 'piercingRay', 46, 12, 0.9, 'Um raio largo e concentrado que atravessa tudo e ignora a armadura.', {
    shape: 'beam', pierce: true,
  }),
  clusterRain: mk('clusterRain', 'Chuva de Estilhaços', 'projection', 5, 'Bombardeio', 'clusterRain', 15, 9, 3, 'Quatro levas de estilhaços caem sobre o ponto mirado, uma a cada meio segundo.', {
    shape: 'delayed', delayS: 0.5, waves: 4, waveS: 0.5,
  }),
  arcaneMortar: mk('arcaneMortar', 'Morteiro Arcano', 'projection', 6, 'Bombardeio', 'arcaneMortar', 55, 10, 3.6, 'Um projétil pesado em arco alto. Quem sobrevive ao impacto continua queimando por 1,5 s.', {
    shape: 'delayed', delayS: 0.9, dotTicks: 3, dotFrac: 0.15,
  }),
  ricochet: mk('ricochet', 'Ricochete', 'projection', 6, 'Saltos', 'ricochet', 26, 10, 5, 'Um disparo que quica de inimigo em inimigo sem perder força.', {
    shape: 'chain', jumps: 5, jumpFalloff: 1,
  }),
  starfall: mk('starfall', 'Chuva de Estrelas', 'projection', 7, 'Bombardeio', 'starfall', 34, 10, 3.4, 'Três estrelas caem em sequência sobre o ponto mirado. Cada uma atordoa quem estiver embaixo.', {
    shape: 'delayed', delayS: 0.8, waves: 3, waveS: 0.7, stunS: 0.5,
  }),
  sunderingLance: mk('sunderingLance', 'Lança do Juízo', 'projection', 7, 'Canhão', 'sunderingLance', 72, 12, 1.2, 'Uma lança enorme de Fluxo: atravessa a fileira inteira, empurra e atordoa.', {
    shape: 'beam', pushM: 3, stunS: 0.6,
  }),
  cataclysm: mk('cataclysm', 'Cataclismo', 'projection', 8, 'Devastação', 'cataclysm', 110, 10, 5, 'Rasga o céu sobre o ponto mirado. Demora a cair, mas nada que estiver embaixo fica de pé.', {
    shape: 'delayed', delayS: 1.6, stunS: 1.5,
  }),
  needleStorm: mk('needleStorm', 'Tempestade de Agulhas', 'projection', 8, 'Leque', 'needleStorm', 18, 9, 0.35, 'Quinze agulhas num leque enorme. De perto, quase todas acertam o mesmo alvo.', {
    shape: 'fan', fanCount: 15, fanDeg: 120,
  }),
  // ----- Mutação
  staticTouch: mk('staticTouch', 'Toque Estático', 'mutation', 2, 'Atordoar', 'staticTouch', 16, 2.6, 0, 'Uma descarga curta à sua frente que trava os músculos de quem estiver perto.', {
    shape: 'arc', arcDeg: 90, stunS: 0.8,
  }),
  elasticSnare: mk('elasticSnare', 'Laço Elástico', 'mutation', 3, 'Puxar e prender', 'elasticSnare', 12, 8, 0, 'Um fio elástico agarra o inimigo mais perto da mira, traz até você e o deixa preso.', {
    shape: 'single', stunS: 0, pull: true, rootS: 1.5, rootBossS: 0.6,
  }),
  forkLightning: mk('forkLightning', 'Relâmpago Bifurcado', 'mutation', 4, 'Elétrico', 'forkLightning', 22, 8, 5, 'Um relâmpago que salta entre até seis inimigos e deixa cada um tonto por um instante.', {
    shape: 'chain', jumps: 5, jumpFalloff: 0.9, stunS: 0.3,
  }),
  venomWhip: mk('venomWhip', 'Chicote Venenoso', 'mutation', 4, 'Veneno', 'venomWhip', 18, 5, 0, 'O chicote de Fluxo vira veneno: o corte continua ferindo por 2 s, sem ligar para a armadura.', {
    shape: 'arc', arcDeg: 80, dotTicks: 4, dotFrac: 0.3,
  }),
  stormVortex: mk('stormVortex', 'Vórtice Elétrico', 'mutation', 5, 'Zona que suga', 'stormVortex', 8, 8, 3, 'Uma zona de eletricidade que fere a cada meio segundo e arrasta quem está dentro para o centro.', {
    shape: 'zone', durationS: 5, tickS: 0.5, pullM: 0.7,
  }),
  rubberBody: mk('rubberBody', 'Corpo de Borracha', 'mutation', 5, 'Proteção', 'rubberBody', 0, 0, 0, 'Seu corpo fica elástico: um escudo absorve os golpes e o que passa dói menos.', {
    shape: 'ward', shieldFrac: 0.3, shieldS: 6, guardS: 6, guardMult: 0.75,
  }),
  acidRain: mk('acidRain', 'Chuva Ácida', 'mutation', 6, 'Zona', 'acidRain', 10, 9, 4, 'Uma chuva corrosiva cobre uma área grande por 6 s. O ácido ignora armadura.', {
    shape: 'zone', durationS: 6, tickS: 0.5,
  }),
  thunderLash: mk('thunderLash', 'Açoite Trovejante', 'mutation', 6, 'Golpe longo', 'thunderLash', 48, 6.5, 0, 'Um chicote de raio, estreito e muito longo. Quem é atingido fica atordoado.', {
    shape: 'arc', arcDeg: 60, stunS: 1,
  }),
  chainStorm: mk('chainStorm', 'Tempestade em Cadeia', 'mutation', 7, 'Elétrico', 'chainStorm', 34, 9, 6, 'A descarga definitiva: salta entre até nove inimigos quase sem perder força.', {
    shape: 'chain', jumps: 8, jumpFalloff: 0.95,
  }),
  livingWires: mk('livingWires', 'Fios Vivos', 'mutation', 7, 'Puxar e prender', 'livingWires', 26, 8, 0, 'Fios elásticos num cone largo: puxam todos para perto de você e os deixam presos no lugar.', {
    shape: 'cone', coneHalfDeg: 60, rootS: 2, rootBossS: 0.8,
  }),
  metamorphosis: mk('metamorphosis', 'Metamorfose', 'mutation', 8, 'Transformação', 'metamorphosis', 0, 0, 0, 'Você muda a própria natureza: cura um pouco, causa muito mais dano e recebe menos por 8 s.', {
    shape: 'self', healFrac: 0.15, healLowBonus: 0, lowHpFrac: 0, guardS: 8, guardMult: 0.7, empowerS: 8, empowerMult: 1.6,
  }),
  plasmaNova: mk('plasmaNova', 'Nova de Plasma', 'mutation', 8, 'Devastação', 'plasmaNova', 80, 0, 6, 'Seu Fluxo vira plasma e explode ao redor: fere, atordoa e continua queimando por 2 s.', {
    shape: 'aura', pushM: 1, stunS: 1.2, dotTicks: 4, dotFrac: 0.2,
  }),
  // ----- Forja
  conjuredKnives: mk('conjuredKnives', 'Facas Conjuradas', 'forge', 2, 'Leque', 'conjuredKnives', 13, 8, 0.35, 'Materializa três facas e as arremessa num leque curto. Cada uma para no primeiro inimigo.', {
    shape: 'fan', fanCount: 3, fanDeg: 20,
  }),
  conjuredHammer: mk('conjuredHammer', 'Martelo Conjurado', 'forge', 3, 'Esmagar', 'conjuredHammer', 30, 4, 2, 'Um martelo enorme aparece no ar e desce perto de você. Quem leva fica atordoado.', {
    shape: 'delayed', delayS: 0.5, stunS: 0.7,
  }),
  bladeFence: mk('bladeFence', 'Cerca de Lâminas', 'forge', 4, 'Zona', 'bladeFence', 9, 8, 2.4, 'Lâminas giram no ponto mirado por 5 s e cortam quem ficar ali, sem ligar para a armadura.', {
    shape: 'zone', durationS: 5, tickS: 0.5,
  }),
  greatsword: mk('greatsword', 'Montante Conjurado', 'forge', 4, 'Golpe amplo', 'greatsword', 38, 3.8, 0, 'Uma espada de duas mãos feita de Fluxo: um giro quase completo que afasta todos.', {
    shape: 'arc', arcDeg: 220, pushM: 1.5,
  }),
  ironCage: mk('ironCage', 'Jaula de Ferro', 'forge', 5, 'Controle', 'ironCage', 20, 8, 3, 'Uma jaula se fecha sobre a área mirada e prende todos por muito tempo. Funciona em elites.', {
    shape: 'targetArea', rootS: 4, rootBossS: 1.5,
  }),
  bulwark: mk('bulwark', 'Baluarte', 'forge', 5, 'Escudo', 'bulwark', 0, 0, 0, 'Uma muralha de Fluxo ao redor do corpo: um escudo grande e duradouro.', {
    shape: 'ward', shieldFrac: 0.45, shieldS: 8,
  }),
  ballista: mk('ballista', 'Balista Conjurada', 'forge', 6, 'Canhão', 'ballista', 62, 12, 0.8, 'Um virote gigante atravessa a fileira e crava todos os atingidos no chão.', {
    shape: 'beam', rootS: 1.5, rootBossS: 0.6,
  }),
  spikeField: mk('spikeField', 'Campo de Estacas', 'forge', 6, 'Emboscada', 'spikeField', 24, 8, 2.6, 'Três levas de estacas brotam no ponto mirado. Cada leva fere e prende de novo.', {
    shape: 'delayed', delayS: 0.4, waves: 3, waveS: 0.4, rootS: 0.8, rootBossS: 0.3,
  }),
  swordRain: mk('swordRain', 'Chuva de Espadas', 'forge', 7, 'Bombardeio', 'swordRain', 20, 9, 3.4, 'Cinco levas de espadas caem do céu sobre o ponto mirado e atravessam qualquer armadura.', {
    shape: 'delayed', delayS: 0.5, waves: 5, waveS: 0.35, pierce: true,
  }),
  guillotine: mk('guillotine', 'Guilhotina', 'forge', 7, 'Execução', 'guillotine', 70, 8, 0, 'Uma lâmina cai sobre o inimigo mais perto da mira. Fere em dobro quem já está quase caindo.', {
    shape: 'single', stunS: 0, executeBelow: 0.3, executeMult: 2,
  }),
  endlessArmory: mk('endlessArmory', 'Arsenal Infinito', 'forge', 8, 'Devastação', 'endlessArmory', 30, 10, 0.45, 'Onze armas conjuradas voam num leque largo, e cada uma atravessa todos no caminho.', {
    shape: 'fan', fanCount: 11, fanDeg: 100, through: true,
  }),
  fortress: mk('fortress', 'Fortaleza', 'forge', 8, 'Escudo', 'fortress', 0, 0, 0, 'Você vira uma fortaleza: um escudo enorme por 10 s, e o que passar por ele dói bem menos.', {
    shape: 'ward', shieldFrac: 0.7, shieldS: 10, guardS: 10, guardMult: 0.6,
  }),
  // ----- Domínio
  backOff: mk('backOff', 'Ordem: Afaste-se', 'dominion', 2, 'Empurrão', 'backOff', 12, 5, 0, 'Uma ordem num cone à sua frente: quem escuta é arremessado para longe.', {
    shape: 'cone', coneHalfDeg: 45, pushM: 4,
  }),
  mindSpike: mk('mindSpike', 'Estaca Mental', 'dominion', 3, 'Alvo único', 'mindSpike', 28, 9, 0, 'Crava uma ordem direto na mente do inimigo mais perto da mira. Ignora a armadura e atordoa um instante.', {
    shape: 'single', stunS: 0.5, pierce: true,
  }),
  discordChoir: mk('discordChoir', 'Coro da Discórdia', 'dominion', 4, 'Controle em área', 'discordChoir', 0, 8, 3, 'Marca todos os inimigos comuns numa área: por 5 s eles lutam uns contra os outros.', {
    shape: 'mark', charmS: 5, charmDamageMult: 1.5, charmSeekM: 12,
  }),
  weightOfCommand: mk('weightOfCommand', 'Peso do Comando', 'dominion', 4, 'Esmagar', 'weightOfCommand', 34, 8, 2.4, 'Sua vontade cai como um peso sobre o ponto mirado: fere e atordoa quem estiver ali.', {
    shape: 'delayed', delayS: 0.5, stunS: 0.8,
  }),
  sleepOrder: mk('sleepOrder', 'Ordem: Durma', 'dominion', 5, 'Atordoar em área', 'sleepOrder', 8, 8, 3, 'Todos na área mirada caem no sono: ficam atordoados e não saem do lugar. Funciona em elites.', {
    shape: 'targetArea', rootS: 3, rootBossS: 1, stunS: 2.5,
  }),
  puppetStrings: mk('puppetStrings', 'Fios de Marionete', 'dominion', 5, 'Controle', 'puppetStrings', 0, 9, 0, 'Toma o controle de um inimigo comum por 10 s. Ele bate nos aliados com muito mais força.', {
    shape: 'mark', charmS: 10, charmDamageMult: 2.5, charmSeekM: 12,
  }),
  blackHole: mk('blackHole', 'Buraco Negro', 'dominion', 6, 'Agrupar', 'blackHole', 30, 9, 5, 'Dobra o espaço numa área grande: arrasta todos para o centro e os deixa atordoados lá.', {
    shape: 'vortex', stunS: 1,
  }),
  sovereignVoice: mk('sovereignVoice', 'Voz do Soberano', 'dominion', 6, 'Empurrão', 'sovereignVoice', 20, 0, 5, 'Uma ordem que ninguém ao redor consegue ignorar: todos são arremessados longe e ficam atordoados.', {
    shape: 'aura', pushM: 5, stunS: 1.5,
  }),
  sentence: mk('sentence', 'Sentença', 'dominion', 7, 'Execução', 'sentence', 60, 9, 0, 'Condena um inimigo: dano alto, atordoamento longo e dano em dobro em quem já está quase caindo.', {
    shape: 'single', stunS: 3, executeBelow: 0.25, executeMult: 2,
  }),
  rebellion: mk('rebellion', 'Rebelião', 'dominion', 7, 'Controle em área', 'rebellion', 0, 9, 5, 'Vira uma horda inteira: todos os inimigos comuns numa área grande lutam por você durante 8 s.', {
    shape: 'mark', charmS: 8, charmDamageMult: 2, charmSeekM: 12,
  }),
  singularity: mk('singularity', 'Singularidade', 'dominion', 8, 'Devastação', 'singularity', 60, 9, 6.5, 'Um ponto que engole tudo: arrasta todos numa área enorme, atordoa e continua esmagando por 2 s.', {
    shape: 'vortex', stunS: 1.5, dotTicks: 4, dotFrac: 0.25,
  }),
  absoluteOrder: mk('absoluteOrder', 'Ordem Absoluta', 'dominion', 8, 'Atordoar em área', 'absoluteOrder', 40, 0, 7, 'Uma única palavra, e todos ao redor ficam paralisados por muito tempo.', {
    shape: 'aura', pushM: 0, stunS: 3.5,
  }),
};

/** As duas magias iniciais de cada afinidade. */
export const STARTER_SPELLS: Record<Affinity, [SpellId, SpellId]> = {
  vigor: ['votePunch', 'point'],
  projection: ['flowLance', 'orbRain'],
  mutation: ['discharge', 'elasticPull'],
  forge: ['conjuredBlade', 'chains'],
  dominion: ['repel', 'discord'],
};

/** Alias de compatibilidade. */
export const TECHNIQUES = SPELLS;
export type TechniqueDef = SpellDef;

/** Só as magias têm Maestria. */
export type MasteryId = SpellId;
export const MASTERY_IDS: readonly MasteryId[] = SPELL_IDS;
export const MASTERY_NAMES = Object.fromEntries(SPELL_IDS.map((id) => [id, SPELLS[id].name])) as Record<SpellId, string>;

export const isSpell = (v: unknown): v is SpellId => (SPELL_IDS as readonly unknown[]).includes(v);

/** Remove do Elo Restrições e modificadores que não se aplicam à magia equipada. */
export function sanitizeSlot(slot: EloSlot): void {
  const spell = slot.technique && isSpell(slot.technique) ? SPELLS[slot.technique] : null;
  if (!spell) {
    slot.technique = null;
    slot.restrictions = [];
    slot.mods = {};
    return;
  }
  slot.restrictions = slot.restrictions.filter((id) => spell.pacts.includes(id));
  for (const id of Object.keys(slot.mods) as ModId[]) if (!spell.mods.includes(id)) delete slot.mods[id];
}
