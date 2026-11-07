import { clamp } from './math';
import type { Traits } from './psyche/traits';

/**
 * Maestria por uso e desuso (GDD, Pilar 3).
 * Duas camadas por técnica: Maestria (1–20, lenta, quase permanente) e Afiação (0–1, rápida).
 * O relógio do desuso conta TEMPO JOGADO, nunca tempo real.
 */

export const MASTERY_MAX = 20;
export const MASTERY_FLOOR = 0.5; // nunca cai abaixo de 50% do pico
export const GRACE_PLAYED_S = 5 * 3600; // carência de ~5 h jogadas
export const RELEARN_MULT = 3;
export const SHARPNESS_PER_USE = 0.02;
export const SHARPNESS_DECAY_PER_H = 0.1;
export const LEVEL_DECAY_PER_H = 0.05;
/** Capacidade total de Maestria: acima dela, as outras técnicas esquecem mais rápido. */
export const MASTERY_CAPACITY = 60;

export interface MasteryRecord {
  /** nível contínuo: a parte inteira é o nível exibido */
  level: number;
  peak: number;
  sharpness: number;
  lastUsedAt: number;
  /** usos nesta sessão, para retorno decrescente */
  sessionUses: number;
  /** meditação no acampamento desacelera o desuso */
  meditated: boolean;
}

export const newMastery = (): MasteryRecord => ({
  level: 1,
  peak: 1,
  sharpness: 0.5,
  lastUsedAt: 0,
  sessionUses: 0,
  meditated: false,
});

export const displayLevel = (r: MasteryRecord) => Math.floor(r.level);

/** XP para sair do nível inteiro atual. */
export const xpForLevel = (level: number) => 40 * Math.pow(Math.floor(level), 1.5);

/** Afiação multiplica a eficácia entre 85% e 110%. */
export const sharpnessMult = (s: number) => 0.85 + 0.25 * clamp(s, 0, 1);

/** Desconto no custo de Fluxo: 1,5% por nível acima de 1. */
export const masteryCostMult = (r: MasteryRecord) => 1 - 0.015 * (displayLevel(r) - 1);

/** Redução do custo dos modificadores no Elo: -1 a cada 5 níveis. */
export const modifierDiscount = (r: MasteryRecord) => Math.floor(displayLevel(r) / 5);

export interface UseContext {
  /** 0 = boneco/alvo trivial, 1 = luta normal; >1 = perigo real */
  risk: number;
  traits: Traits;
  /** a Assinatura ressoa com a Psique? (1 normal, >1 ressoa, <1 dissonante) */
  resonance?: number;
  playTime: number;
  /** total de Maestria ocupada pelas outras técnicas */
  totalMastery?: number;
}

/** Fator de risco: inimigo mais forte, vida baixa, elites por perto. */
export function riskFactor(opts: { enemyLevelDiff: number; hpFrac: number; elitesNear: number; trivial?: boolean }): number {
  if (opts.trivial) return 0.05;
  let r = 1 + clamp(opts.enemyLevelDiff, -3, 5) * 0.2;
  if (opts.hpFrac < 0.3) r *= 2;
  else if (opts.hpFrac < 0.6) r *= 1.3;
  r *= 1 + 0.5 * Math.min(opts.elitesNear, 3);
  return Math.max(0.05, r);
}

/** Registra um uso real. Retorna true se subiu de nível. */
export function recordUse(r: MasteryRecord, baseXp: number, ctx: UseContext): boolean {
  const before = displayLevel(r);
  const tr = ctx.traits;
  let xp = baseXp * ctx.risk * (ctx.resonance ?? 1);
  xp *= 1 / (1 + r.sessionUses / 150); // retorno decrescente por sessão
  if (r.level < r.peak) xp *= RELEARN_MULT; // reaprender é rápido
  if (r.level < 5) xp *= 0.75 + tr.curiosity / 200; // Curiosidade acelera técnicas novas
  if (r.level >= 10) xp *= 0.75 + tr.perseverance / 200; // Perseverança facilita os níveis altos
  xp *= 0.85 + tr.detachment / 330; // Desapego aprende rápido (e esquece rápido)

  let remaining = xp;
  while (remaining > 0 && r.level < MASTERY_MAX) {
    const need = xpForLevel(r.level);
    const frac = r.level - Math.floor(r.level);
    const toNext = (1 - frac) * need;
    if (remaining >= toNext) {
      r.level = Math.floor(r.level) + 1;
      remaining -= toNext;
    } else {
      r.level += remaining / need;
      remaining = 0;
    }
  }
  r.level = Math.min(r.level, MASTERY_MAX);
  r.peak = Math.max(r.peak, r.level);
  r.sharpness = clamp(r.sharpness + SHARPNESS_PER_USE * Math.min(1.5, ctx.risk), 0, 1);
  r.lastUsedAt = ctx.playTime;
  r.sessionUses += 1;
  return displayLevel(r) > before;
}

/**
 * Desuso. Chamado com o delta de tempo JOGADO. A carência protege por ~5 h;
 * depois a Afiação cai rápido e o nível cai muito devagar até 50% do pico.
 */
export function decay(r: MasteryRecord, dtPlayed: number, playTime: number, traits: Traits, overCapacity = false): void {
  const idle = playTime - r.lastUsedAt;
  if (idle < GRACE_PLAYED_S) return;
  const h = dtPlayed / 3600;
  let mult = 1.5 - traits.discipline / 100; // Disciplina desacelera o desuso
  mult *= 0.85 + traits.detachment / 330; // Desapego esquece rápido
  if (r.meditated) mult *= 0.4;
  if (overCapacity) mult *= 2;
  r.sharpness = clamp(r.sharpness - SHARPNESS_DECAY_PER_H * h * mult, 0, 1);
  r.level = Math.max(r.peak * MASTERY_FLOOR, 1, r.level - LEVEL_DECAY_PER_H * h * mult);
}

/** Penalidade de morte sobre a Maestria das técnicas equipadas. */
export function deathPenalty(r: MasteryRecord, lossFrac: number): void {
  r.level = Math.max(r.peak * MASTERY_FLOOR, 1, r.level * (1 - lossFrac));
  r.sharpness = 0;
}

export const totalMastery = (records: Iterable<MasteryRecord>) => {
  let s = 0;
  for (const r of records) s += displayLevel(r);
  return s;
};
