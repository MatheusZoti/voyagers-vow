import { clamp } from './math';

/**
 * Maestria: só das magias. Sobe usando a magia (mais rápido sob risco real) e nunca cai.
 * Ela decide duas coisas, e só elas:
 *  - até qual Elo a magia pode subir: Elo mínimo da magia + nível de Maestria;
 *  - o nível máximo das Restrições que cabem nela: metade da Maestria, arredondada para cima.
 */

export const MASTERY_MAX = 7;

export interface MasteryRecord {
  /** nível contínuo: a parte inteira é o nível exibido, a fração é o progresso */
  level: number;
}

export const newMastery = (): MasteryRecord => ({ level: 1 });

export const displayLevel = (r: MasteryRecord) => Math.floor(r.level);

/** XP para sair do nível inteiro atual (1→2: 60; 6→7: ~2200). */
export const xpForLevel = (level: number) => 60 * Math.pow(Math.floor(level), 2);

/** Elo mais alto em que a magia entra, dado o Elo mínimo dela e a Maestria. */
export const maxEloFor = (minElo: number, masteryLevel: number) => Math.min(8, minElo + masteryLevel);

/** Maestria necessária para usar a magia neste Elo. */
export const masteryForElo = (minElo: number, slotLevel: number) => Math.max(1, slotLevel - minElo);

/** Nível máximo de Restrição (+1 a +4) que cabe numa magia com esta Maestria. */
export const maxPactLevelFor = (masteryLevel: number) => Math.min(4, Math.ceil(masteryLevel / 2));

/** Maestria necessária para uma Restrição deste nível. */
export const masteryForPact = (pactLevel: number) => Math.max(1, pactLevel * 2 - 1);

/** Fator de risco: inimigo mais forte, vida baixa, elites por perto. */
export function riskFactor(opts: { enemyLevelDiff: number; hpFrac: number; elitesNear: number; trivial?: boolean }): number {
  if (opts.trivial) return 0.05;
  let r = 1 + clamp(opts.enemyLevelDiff, -3, 5) * 0.2;
  if (opts.hpFrac < 0.3) r *= 2;
  else if (opts.hpFrac < 0.6) r *= 1.3;
  r *= 1 + 0.5 * Math.min(opts.elitesNear, 3);
  return Math.max(0.05, r);
}

/** Registra um uso real (XP já multiplicado pelo risco). Retorna true se subiu de nível. */
export function recordUse(r: MasteryRecord, xp: number): boolean {
  const before = displayLevel(r);
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
  return displayLevel(r) > before;
}

/**
 * Converte a Maestria antiga (1–20, com Afiação e desuso) para a nova (1–7), mantendo a proporção.
 */
export function migrateMasteryLevel(old: number): number {
  if (!Number.isFinite(old) || old <= 1) return 1;
  return clamp(1 + ((old - 1) * (MASTERY_MAX - 1)) / 19, 1, MASTERY_MAX);
}
