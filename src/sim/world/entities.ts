import type { Item, Slot } from '../items';
import type { Vec2 } from '../math';
import type { SpellId } from '../techniques';

export type EnemyKind = 'grunt' | 'stalker' | 'brute' | 'slinger' | 'boss';

/** shot = projétil que voa em linha reta (dá para desviar; árvores e rochas bloqueiam) */
export type AttackType = 'melee' | 'slam' | 'charge' | 'shot';

export interface AttackDef {
  id: string;
  type: AttackType;
  range: number;
  windup: number;
  recover: number;
  damage: number;
  /** raio do impacto (slam: círculo no alvo; melee: arco à frente) */
  radius: number;
  heavy: boolean;
  cooldown: number;
}

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  hp: number;
  armor: number;
  speed: number;
  radius: number;
  level: number;
  xp: number;
  aggroRadius: number;
  elite: boolean;
  boss: boolean;
  /** em Sombra: só visível com Olhar ou muito perto */
  shadowed: boolean;
  attacks: AttackDef[];
  respawn: number;
}

const melee = (damage: number, range: number, windup: number, recover = 0.5, cooldown = 1.2): AttackDef => ({
  id: 'melee',
  type: 'melee',
  range,
  windup,
  recover,
  damage,
  radius: range,
  heavy: false,
  cooldown,
});

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  grunt: {
    kind: 'grunt',
    name: 'Carniçal',
    hp: 46,
    armor: 1,
    speed: 3.1,
    radius: 0.45,
    level: 1,
    xp: 14,
    aggroRadius: 8,
    elite: false,
    boss: false,
    shadowed: false,
    attacks: [melee(8, 1.4, 0.45, 0.5, 1.0)],
    respawn: 45,
  },
  stalker: {
    kind: 'stalker',
    name: 'Espreitador',
    hp: 38,
    armor: 0,
    speed: 4.2,
    radius: 0.4,
    level: 2,
    xp: 22,
    aggroRadius: 9,
    elite: false,
    boss: false,
    shadowed: true,
    attacks: [melee(13, 1.3, 0.35, 0.7, 1.6)],
    respawn: 60,
  },
  slinger: {
    kind: 'slinger',
    name: 'Lançador de Espinhos',
    hp: 34,
    armor: 1,
    speed: 3.3,
    radius: 0.42,
    level: 2,
    xp: 26,
    aggroRadius: 10,
    elite: false,
    boss: false,
    shadowed: false,
    // Mantém distância e atira; o aviso é uma linha no chão na direção do disparo.
    attacks: [
      { id: 'shot', type: 'shot', range: 9, windup: 0.75, recover: 0.55, damage: 13, radius: 0.35, heavy: false, cooldown: 2.1 },
      // Encurralado, ainda se defende com uma estocada fraca.
      melee(6, 1.2, 0.4, 0.6, 1.4),
    ],
    respawn: 55,
  },
  brute: {
    kind: 'brute',
    name: 'Bruto de Pedra',
    hp: 230,
    armor: 9,
    speed: 2.5,
    radius: 0.8,
    level: 3,
    xp: 80,
    aggroRadius: 9,
    elite: true,
    boss: false,
    shadowed: false,
    attacks: [
      melee(16, 1.9, 0.7, 0.7, 1.6),
      { id: 'slam', type: 'slam', range: 4, windup: 1.0, recover: 0.9, damage: 26, radius: 2.2, heavy: true, cooldown: 6 },
    ],
    respawn: 90,
  },
  boss: {
    kind: 'boss',
    name: 'Guardião da Ponte',
    hp: 900,
    armor: 8,
    speed: 2.9,
    radius: 1.4,
    level: 5,
    xp: 500,
    aggroRadius: 0, // ativado ao entrar na arena
    elite: true,
    boss: true,
    shadowed: false,
    attacks: [
      { id: 'swipe', type: 'melee', range: 3, windup: 0.85, recover: 0.7, damage: 11, radius: 3, heavy: false, cooldown: 2.2 },
      { id: 'slam', type: 'slam', range: 8, windup: 1.3, recover: 1.1, damage: 56, radius: 3.4, heavy: true, cooldown: 5.5 },
      { id: 'charge', type: 'charge', range: 12, windup: 0.8, recover: 1.0, damage: 22, radius: 1.8, heavy: false, cooldown: 7 },
    ],
    respawn: 120,
  },
};

/**
 * Armadura reduz o dano em porcentagem (com retorno decrescente), não por subtração:
 * golpes fracos continuam valendo contra alvos blindados. Armadura 10 = 40%.
 */
export const armorReduction = (armor: number) => armor / (armor + 15);

export type EnemyState = 'idle' | 'chase' | 'windup' | 'charging' | 'recover' | 'return' | 'stunned' | 'dead';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  def: EnemyDef;
  pos: Vec2;
  home: Vec2;
  facing: Vec2;
  hp: number;
  state: EnemyState;
  timer: number;
  attack: AttackDef | null;
  attackTarget: Vec2;
  cooldowns: Record<string, number>;
  aggro: boolean;
  /** visível para o jogador neste tick */
  revealed: boolean;
  stun: number;
  respawnIn: number;
  /** acertos da Assinatura recebidos (a cada 3, ignora armadura) */
  signatureHits: number;
  phase: number;
  summoned: boolean;
  /** tempo desde o último dano recebido */
  hurtAgo: number;
  /** vida máxima (definição x tier da região x ajuste de balanceamento) */
  maxHp: number;
  /** multiplicador de dano pelo tier da região */
  power: number;
  /** duração total do preparo atual (para a animação) */
  windupTotal: number;
  /** recuo pendente ao ser atingido (m/s, decai rápido) */
  knock: { x: number; y: number };
  /** atingido: sabe onde você está até este tempo, mesmo de longe */
  provokedUntil: number;
  /** recuando (imune) para casa: alvo inalcançável ou puxado longe demais */
  evading: boolean;
  /** tempo sem conseguir se aproximar do alvo */
  stuck: number;
  /** menor distância ao alvo nesta perseguição */
  bestDist: number;
  /** preso por Correntes até este tempo (pode atacar, não anda) */
  rootUntil: number;
  /** sob a Marca da Discórdia até este tempo (luta contra os aliados) */
  charmedUntil: number;
}

/** Grimório caído no chão: ensina uma magia a quem passar por cima. */
export interface SpellDrop {
  id: number;
  spell: SpellId;
  pos: Vec2;
  expiresAt: number;
}

/** Chance de uma criatura deixar um grimório ao morrer. */
export const SPELL_DROP_CHANCE: Record<EnemyKind, number> = { grunt: 0.04, stalker: 0.08, slinger: 0.07, brute: 0.35, boss: 1 };

/** Projétil inimigo em voo. */
export interface Projectile {
  id: number;
  pos: Vec2;
  dir: Vec2;
  speed: number;
  /** distância que ainda pode voar */
  left: number;
  damage: number;
  owner: number;
}

/** Tier da região: vida, dano e XP dos inimigos. */
export const tierScale = (tier: number) => ({
  hp: 1 + 0.45 * (tier - 1),
  power: 1 + 0.3 * (tier - 1),
  xp: 1 + 0.6 * (tier - 1),
  level: 2 * (tier - 1),
});

export interface Trap {
  pos: Vec2;
  armed: boolean;
  revealed: boolean;
  rearmIn: number;
}

/** Eco: o que ficou onde você caiu. Mora no personagem (sobrevive a sair do jogo e a viajar). */
export interface Echo {
  /** região onde você caiu */
  region: string;
  pos: Vec2;
  xpBack: number;
  /** tempo jogado (s) em que se dissipa */
  expiresAt: number;
  /** equipamentos que caíram (com o espaço onde estavam vestidos, se estavam) */
  items: Array<{ item: Item; slot?: Slot }>;
}
