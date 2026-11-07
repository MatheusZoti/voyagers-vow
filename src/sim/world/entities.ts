import type { Vec2 } from '../math';

export type EnemyKind = 'grunt' | 'stalker' | 'brute' | 'boss';

export type AttackType = 'melee' | 'slam' | 'charge';

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
    hp: 34,
    armor: 1,
    speed: 3.1,
    radius: 0.45,
    level: 1,
    xp: 14,
    aggroRadius: 8,
    elite: false,
    boss: false,
    shadowed: false,
    attacks: [melee(7, 1.4, 0.45)],
    respawn: 45,
  },
  stalker: {
    kind: 'stalker',
    name: 'Espreitador',
    hp: 28,
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
  brute: {
    kind: 'brute',
    name: 'Bruto de Pedra',
    hp: 170,
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
    hp: 1100,
    armor: 10,
    speed: 2.9,
    radius: 1.4,
    level: 5,
    xp: 500,
    aggroRadius: 0, // ativado ao entrar na arena
    elite: true,
    boss: true,
    shadowed: false,
    attacks: [
      { id: 'swipe', type: 'melee', range: 3, windup: 0.6, recover: 0.6, damage: 14, radius: 3, heavy: false, cooldown: 1.4 },
      { id: 'slam', type: 'slam', range: 8, windup: 1.3, recover: 1.1, damage: 46, radius: 3.4, heavy: true, cooldown: 5.5 },
      { id: 'charge', type: 'charge', range: 12, windup: 0.8, recover: 1.0, damage: 22, radius: 1.8, heavy: false, cooldown: 7 },
    ],
    respawn: 120,
  },
};

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
}

export interface Trap {
  pos: Vec2;
  armed: boolean;
  revealed: boolean;
  rearmIn: number;
}

export interface Echo {
  pos: Vec2;
  xpBack: number;
  expiresAt: number;
}
