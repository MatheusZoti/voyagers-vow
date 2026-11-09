import { PACT_IDS, type EloSlot, type ModId, type PactId } from './elos';
import type { Affinity } from './flow/affinity';
import type { Posture } from './flow/flow';

/**
 * Magias determinísticas, feitas por nós (sem fábrica de magias). Cada uma tem uma afinidade
 * (o tipo principal) e um papel. Caem de criaturas e de livros; o jogador as equipa nos Elos.
 */

/** Etiquetas de natureza: definem a Ressonância com a Psique. */
export type NatureTag = 'aggressive' | 'protective' | 'deceptive' | 'patient';
export const NATURE_NAMES: Record<NatureTag, string> = {
  aggressive: 'agressiva',
  protective: 'protetora',
  deceptive: 'enganadora',
  patient: 'paciente',
};

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
  tags: NatureTag[];
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
  | 'vortex';

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
  critPerMastery?: number;
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
  /** Maestria da magia: +2% de efeito por nível */
  masteryPerLevel: 0.02,
} as const;

const ALL_PACTS: PactId[] = [...PACT_IDS];
const NO_MISS: PactId[] = PACT_IDS.filter((id) => id !== 'missLock');

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
    tags: ['aggressive', 'patient'],
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
    tags: ['aggressive'],
    desc: 'Concentra todo o Fluxo no próximo golpe: crítico gigante. Defesa zero por 2 s.',
    icon: 'point',
    // Ponto não é um golpe em si (carrega o próximo): "se errar" não se aplica.
    pacts: NO_MISS,
    mods: ['damage', 'cadence', 'restore', 'stun', 'shatter'],
    fx: { shape: 'charge', chargeS: 4, defenseZeroS: 2, critBase: 2.5, critPerMastery: 0.1 },
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
    tags: ['aggressive'],
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
    tags: ['patient'],
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
    tags: ['deceptive'],
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
    tags: ['aggressive', 'deceptive'],
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
    tags: ['patient', 'protective'],
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
    tags: ['aggressive', 'patient'],
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
    tags: ['protective'],
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
    tags: ['deceptive'],
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
    tags: ['protective', 'patient'],
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
    tags: ['aggressive'],
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
    tags: ['aggressive'],
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
    tags: ['patient'],
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
    tags: ['deceptive', 'patient'],
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
    tags: ['aggressive', 'deceptive'],
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
    tags: ['protective'],
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
    tags: ['patient', 'aggressive'],
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
    tags: ['protective', 'aggressive'],
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
    tags: ['deceptive', 'patient'],
    desc: 'Dobra o espaço no ponto mirado e arrasta todos ao redor para o centro. Ótimo antes de uma magia de área.',
    icon: 'well',
    pacts: ALL_PACTS,
    mods: ['damage', 'area', 'range', 'cadence', 'stun'],
    fx: { shape: 'vortex' },
  },
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

/** Tudo o que tem Maestria. */
export type MasteryId = SpellId | Exclude<Posture, 'open'> | 'veil' | 'impetus' | 'tide' | 'basic' | 'capacity';
export const FIXED_MASTERY_IDS: readonly MasteryId[] = ['basic', 'veil', 'silence', 'impetus', 'gaze', 'tide', 'capacity'];
export const MASTERY_IDS: readonly MasteryId[] = [...FIXED_MASTERY_IDS, ...SPELL_IDS];
export const MASTERY_NAMES: Record<MasteryId, string> = {
  basic: 'Golpe básico',
  veil: 'Véu',
  silence: 'Silêncio',
  impetus: 'Ímpeto',
  gaze: 'Olhar',
  tide: 'Maré',
  capacity: 'Capacidade do Fluxo',
  ...(Object.fromEntries(SPELL_IDS.map((id) => [id, SPELLS[id].name])) as Record<SpellId, string>),
};

/**
 * Ressonância: etiquetas da magia x traços. Multiplica a Maestria (e divide o custo de Fluxo).
 */
export function resonance(tags: NatureTag[], tr: Record<string, number>): number {
  const fit: Record<NatureTag, number> = {
    aggressive: ((tr.wrath ?? 50) + (tr.courage ?? 50)) / 2,
    protective: ((tr.empathy ?? 50) + (tr.discipline ?? 50)) / 2,
    deceptive: 100 - (tr.sincerity ?? 50),
    patient: ((tr.perseverance ?? 50) + (tr.discipline ?? 50)) / 2,
  };
  const avg = tags.reduce((s, t) => s + fit[t], 0) / Math.max(1, tags.length);
  if (avg >= 62) return 1.25;
  if (avg <= 38) return 0.5;
  return 1;
}

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
