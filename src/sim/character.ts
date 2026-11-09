import { isAffinity, type Affinity } from './flow/affinity';
import { newSlot, type EloSlot } from './elos';
import { newMastery, type MasteryRecord } from './mastery';
import { clamp, Rng } from './math';
import { computeStats } from './stats';
import type { DialogueId } from './psyche/dialogues';
import type { RegionId } from './world/map';
import { createPsyche, type PsycheState } from './psyche/psyche';
import { neutralTraits, neutralValues, TRAIT_IDS } from './psyche/traits';
import { isSpell, MASTERY_IDS, sanitizeSlot, STARTER_SPELLS, type MasteryId, type SpellId } from './techniques';

/** Personagem persistente: o que o servidor guardaria entre sessões. */
export interface Character {
  version: 2;
  name: string;
  seed: number;
  psyche: PsycheState;
  /** escolhida pelo jogador na criação */
  affinity: Affinity;
  /** região onde o personagem está */
  region: RegionId;
  level: number;
  xp: number;
  mastery: Record<MasteryId, MasteryRecord>;
  elos: EloSlot[];
  /** grimório: magias que o personagem já aprendeu */
  knownSpells: SpellId[];
  /** conversas já vividas (cada uma molda a personalidade uma vez) */
  dialogues: DialogueId[];
  /** livros do mundo já lidos */
  booksRead: string[];
  /** névoa de guerra: tiles já vistos por região ('1' = explorado), como texto compacto */
  explored: Record<string, string>;
  deaths: number;
  /** penalidade de morte: 0–3 (estilo Tibia) */
  penaltyLevel: number;
  /** tempo jogado (s) da última morte */
  lastDeathAt: number;
  /** tempo jogado (s) desde o último alívio de penalidade */
  penaltyClock: number;
  playTime: number;
  bossDefeated: boolean;
  /** perda de vida máxima pelo Pacto "Pago com a minha vida" */
  lifeCostLost: number;
}

export const xpToNext = (level: number) => Math.round(100 * Math.pow(level, 1.6));
export const maxHpFor = (c: Character) => computeStats(c).hp;

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

/**
 * Sem questionário: o jogador escolhe nome e afinidade. A personalidade nasce quase neutra
 * (com um leve ruído) e é moldada pelas conversas e ações no jogo.
 */
export function createCharacter(name: string, affinity: Affinity, seed = Date.now() & 0x7fffffff): Character {
  const rng = new Rng(seed);
  const traits = neutralTraits();
  for (const t of TRAIT_IDS) traits[t] = clamp(50 + rng.range(-6, 6), 0, 100);
  const elos = Array.from({ length: 8 }, (_, i) => newSlot(i + 1));
  const [first, second] = STARTER_SPELLS[affinity];
  const c: Character = {
    version: 2,
    name,
    seed,
    psyche: createPsyche(traits, neutralValues()),
    affinity,
    region: 'vale',
    level: 1,
    xp: 0,
    mastery: Object.fromEntries(MASTERY_IDS.map((id) => [id, newMastery()])) as Record<MasteryId, MasteryRecord>,
    elos,
    knownSpells: [first, second],
    dialogues: [],
    booksRead: [],
    explored: {},
    deaths: 0,
    penaltyLevel: 0,
    lastDeathAt: -1e9,
    penaltyClock: 0,
    playTime: 0,
    bossDefeated: false,
    lifeCostLost: 0,
  };
  refreshEloUnlocks(c);
  elos[0]!.technique = first;
  elos[1]!.technique = second;
  return c;
}

/**
 * Converte saves antigos (v1: Rito por perguntas, Assinatura "signature", afinidade Singular)
 * para o formato atual sem perder progresso.
 */
export function migrateCharacter(raw: unknown): Character | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown> & Partial<Character>;
  if (c.version === 2) {
    if (!c.explored) c.explored = {};
    if (!c.region) c.region = 'vale';
    ensureMastery(c as Character);
    return c as Character;
  }
  if (c.version !== 1) return null;
  const old = c as unknown as Character & { answers?: number[] };
  const affinity: Affinity = isAffinity(old.affinity) ? old.affinity : 'vigor';
  const mastery = old.mastery as unknown as Record<string, MasteryRecord>;
  if (mastery.signature) {
    mastery.votePunch = mastery.signature;
    delete mastery.signature;
  }
  // A regra de equipar mudou (Elo mínimo = 1 + distância): recomeça a Grade com as magias iniciais.
  const known = new Set<SpellId>(STARTER_SPELLS[affinity]);
  known.add('votePunch');
  known.add('point');
  for (const slot of old.elos) {
    slot.technique = null;
    slot.restrictions = [];
    slot.mods = {};
    slot.sealed = false;
  }
  old.elos[0]!.technique = STARTER_SPELLS[affinity][0];
  old.elos[1]!.technique = STARTER_SPELLS[affinity][1];
  for (const slot of old.elos) sanitizeSlot(slot);
  const migrated: Character = {
    ...old,
    version: 2,
    affinity,
    region: 'vale',
    knownSpells: [...known],
    dialogues: [],
    booksRead: [],
    explored: {},
    deaths: 0,
  };
  delete (migrated as unknown as { answers?: unknown }).answers;
  ensureMastery(migrated);
  return migrated;
}

/** Garante um registro de Maestria para cada magia (novas magias entram com o tempo). */
export function ensureMastery(c: Character): void {
  for (const id of MASTERY_IDS) if (!c.mastery[id]) c.mastery[id] = newMastery();
}

export function learnSpell(c: Character, id: SpellId): boolean {
  if (c.knownSpells.includes(id)) return false;
  c.knownSpells.push(id);
  return true;
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
