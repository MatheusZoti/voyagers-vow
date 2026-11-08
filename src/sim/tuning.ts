/**
 * Botões de balanceamento. Multiplicadores globais lidos pela simulação a cada uso,
 * para ajustar o jogo ao vivo (painel de debug) sem mexer nas tabelas de dados.
 * Quando houver servidor, estes valores moram nele.
 */
export interface Tuning {
  /** dano que o jogador causa (golpe básico e magias) */
  playerDamage: number;
  /** dano que os inimigos causam */
  enemyDamage: number;
  /** vida dos inimigos */
  enemyHp: number;
  /** velocidade dos inimigos */
  enemySpeed: number;
  /** tempo de preparo dos ataques inimigos (maior = mais fácil de reagir) */
  enemyWindup: number;
  /** regeneração de Fluxo */
  flowRegen: number;
  /** custo de Fluxo das magias */
  spellCost: number;
  /** recarga das magias */
  cooldown: number;
  /** XP por abate */
  xp: number;
  /** recuo dos inimigos ao serem atingidos */
  knockback: number;
}

export const DEFAULT_TUNING: Tuning = {
  playerDamage: 1,
  enemyDamage: 1,
  enemyHp: 1,
  enemySpeed: 1,
  enemyWindup: 1,
  flowRegen: 1,
  spellCost: 1,
  cooldown: 1,
  xp: 1,
  knockback: 1,
};

export const TUNING: Tuning = { ...DEFAULT_TUNING };

export const TUNING_LABELS: Record<keyof Tuning, string> = {
  playerDamage: 'Dano do jogador',
  enemyDamage: 'Dano dos inimigos',
  enemyHp: 'Vida dos inimigos',
  enemySpeed: 'Velocidade dos inimigos',
  enemyWindup: 'Preparo dos ataques inimigos',
  flowRegen: 'Regeneração de Fluxo',
  spellCost: 'Custo das magias',
  cooldown: 'Recarga das magias',
  xp: 'XP por abate',
  knockback: 'Recuo ao acertar',
};

export function resetTuning(): void {
  Object.assign(TUNING, DEFAULT_TUNING);
}
