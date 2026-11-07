import { revealAffinity, type Affinity } from './flow/affinity';
import { newSlot, type EloSlot } from './elos';
import { newMastery, type MasteryRecord } from './mastery';
import { Rng } from './math';
import { createPsyche, type PsycheState } from './psyche/psyche';
import { runRite } from './psyche/rite';
import { MASTERY_IDS, type MasteryId } from './techniques';

/** Personagem persistente: o que o servidor guardaria entre sessões. */
export interface Character {
  version: 1;
  name: string;
  seed: number;
  answers: number[];
  psyche: PsycheState;
  affinity: Affinity;
  level: number;
  xp: number;
  mastery: Record<MasteryId, MasteryRecord>;
  elos: EloSlot[];
  /** penalidade de morte: 0–3 (estilo Tibia) */
  penaltyLevel: number;
  /** tempo jogado (s) da última morte */
  lastDeathAt: number;
  /** tempo jogado (s) desde o último alívio de penalidade */
  penaltyClock: number;
  playTime: number;
  bossDefeated: boolean;
  /** perda de vida máxima pelo Pacto "Pago com vida" */
  lifeCostLost: number;
}

export const xpToNext = (level: number) => Math.round(100 * Math.pow(level, 1.6));
export const maxHpFor = (c: Character) => Math.max(20, 100 + 12 * (c.level - 1) - c.lifeCostLost);

/** Elos liberados pela progressão: 1 e 2 no início, 3 no nível 3, 4 no nível 5, 5 ao vencer o chefe. */
export function refreshEloUnlocks(c: Character): number[] {
  const unlocked: number[] = [];
  const should = (lvl: number) =>
    lvl <= 2 || (lvl === 3 && c.level >= 3) || (lvl === 4 && c.level >= 5) || (lvl === 5 && c.bossDefeated);
  for (const slot of c.elos) {
    if (!slot.unlocked && should(slot.level)) {
      slot.unlocked = true;
      unlocked.push(slot.level);
    }
  }
  return unlocked;
}

export function createCharacter(name: string, answers: number[], seed = Date.now() & 0x7fffffff): Character {
  const rng = new Rng(seed);
  const { traits, values } = runRite(answers, rng);
  const elos = Array.from({ length: 8 }, (_, i) => newSlot(i + 1));
  const c: Character = {
    version: 1,
    name,
    seed,
    answers: [...answers],
    psyche: createPsyche(traits, values),
    affinity: revealAffinity(traits),
    level: 1,
    xp: 0,
    mastery: Object.fromEntries(MASTERY_IDS.map((id) => [id, newMastery()])) as Record<MasteryId, MasteryRecord>,
    elos,
    penaltyLevel: 0,
    lastDeathAt: -1e9,
    penaltyClock: 0,
    playTime: 0,
    bossDefeated: false,
    lifeCostLost: 0,
  };
  refreshEloUnlocks(c);
  elos[0]!.technique = 'point';
  elos[1]!.technique = 'signature';
  return c;
}

// ---------------------------------------------------------------------------
// Penalidade de morte (GDD, Online, morte e penalidades)
// ---------------------------------------------------------------------------

export interface DeathPenaltyRow {
  mult: number;
  xpLoss: number;
  masteryLoss: number;
  itemDrop: number;
}
export const DEATH_PENALTY: DeathPenaltyRow[] = [
  { mult: 1, xpLoss: 0.04, masteryLoss: 0.01, itemDrop: 0.01 },
  { mult: 3, xpLoss: 0.12, masteryLoss: 0.03, itemDrop: 0.03 },
  { mult: 6, xpLoss: 0.24, masteryLoss: 0.06, itemDrop: 0.06 },
  { mult: 10, xpLoss: 0.4, masteryLoss: 0.1, itemDrop: 0.1 },
];
export const PENALTY_MAX = 3;
export const PENALTY_WINDOW_S = 2 * 3600;
