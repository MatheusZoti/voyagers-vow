import { isAffinity, minSlotFor, type Affinity } from './flow/affinity';
import { newSlot, PACTS, type EloSlot } from './elos';
import { masteryForElo, masteryForPact, migrateMasteryLevel, newMastery, type MasteryRecord } from './mastery';
import { clamp, Rng } from './math';
import type { Item, Slot } from './items';
import type { Echo } from './world/entities';
import type { PsycheShift } from './psyche/shifts';
import type { FameCounts } from './psyche/fame';
import { computeStats } from './stats';
import type { DialogueId } from './psyche/dialogues';
import type { RegionId } from './world/map';
import { createPsyche, type PsycheState } from './psyche/psyche';
import { neutralTraits, neutralValues, TRAIT_IDS } from './psyche/traits';
import { isSpell, MASTERY_IDS, sanitizeSlot, SPELLS, STARTER_SPELLS, type MasteryId, type SpellId } from './techniques';

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
  /** equipamento vestido, um por espaço */
  equipment: Partial<Record<Slot, Item>>;
  /** mochila (até BAG_SIZE itens) */
  bag: Item[];
  /** próximo id de item (únicos por personagem) */
  nextItemUid: number;
  /** Eco da última morte (XP e itens para recuperar), ou null */
  echo: Echo | null;
  /** tutoriais já vistos/concluídos (ex.: tideShown, tideDone) */
  hints: Record<string, number>;
  /** como a personalidade mudou, com a causa (mais recente primeiro) */
  shifts: PsycheShift[];
  /** o seu algoz: a criatura que te derrubou da última vez (onde ela vive) */
  nemesis: { region: string; kind: string; home: { x: number; y: number }; name: string } | null;
  /** altares já resolvidos: pegou as moedas ou deixou */
  shrines: Record<string, 'taken' | 'left'>;
  /** o que aconteceu nas situações (consequências e ecos), ex.: stranger=trusted, oath=sworn */
  flags: Record<string, string | number>;
  /** fama por região: o que se fala de você em cada lugar */
  fame: Record<string, FameCounts>;
}

/** Saves de antes dos equipamentos ganham equipamento e mochila vazios. */
export function ensureGear(c: Character): void {
  if (!c.equipment) c.equipment = {};
  if (!Array.isArray(c.bag)) c.bag = [];
  if (!c.nextItemUid) c.nextItemUid = 1;
  if (c.echo === undefined) c.echo = null;
  if (!c.hints) c.hints = {};
  if (!Array.isArray(c.shifts)) c.shifts = [];
  if (c.nemesis === undefined) c.nemesis = null;
  if (!c.shrines) c.shrines = {};
  if (!c.flags) c.flags = {};
  if (!c.fame) c.fame = {};
}

/** XP para o próximo nível. (Playtest 09/11: nível 5 em 8 min era rápido demais; agora ~1,8× mais.) */
export const xpToNext = (level: number) => Math.round(150 * Math.pow(level, 1.7));
export const maxHpFor = (c: Character) => computeStats(c).hp;

/**
 * Marcos que liberam Elos. Cada marco cumprido libera o PRÓXIMO Elo, sempre em ordem:
 * vencer o Guardião no nível 4 abre o Elo 4, e o nível 5 depois abre o Elo 5.
 */
export const ELO_MILESTONES: Array<{ label: string; done: (c: Character) => boolean }> = [
  { label: 'nível 3', done: (c) => c.level >= 3 },
  { label: 'nível 5', done: (c) => c.level >= 5 },
  { label: 'vencer o Guardião', done: (c) => c.bossDefeated },
];
const BASE_ELOS = 2;

/** Quantos Elos o personagem tem direito agora. */
export const elosEarned = (c: Character) => BASE_ELOS + ELO_MILESTONES.filter((m) => m.done(c)).length;

/**
 * Abre os Elos a que o personagem tem direito, em ordem. Corrige saves antigos em que
 * um Elo alto abriu antes de um mais baixo (o Elo vazio volta a fechar; um com magia fica).
 */
export function refreshEloUnlocks(c: Character): number[] {
  const unlocked: number[] = [];
  const earned = elosEarned(c);
  for (const slot of c.elos) {
    if (slot.level <= earned) {
      if (!slot.unlocked) {
        slot.unlocked = true;
        unlocked.push(slot.level);
      }
    } else if (slot.unlocked && !slot.technique) {
      slot.unlocked = false;
    }
  }
  return unlocked;
}

/** O que falta para abrir cada Elo fechado (para a Grade de Elos). */
export function eloUnlockHint(c: Character, level: number): string {
  const missing = ELO_MILESTONES.filter((m) => !m.done(c)).map((m) => m.label);
  const k = level - elosEarned(c); // 1 = o próximo a abrir
  if (k < 1 || k > missing.length) return 'mais adiante';
  if (missing.length === 1) return missing[0]!;
  if (k === 1) return missing.join(' ou ');
  if (k === missing.length) return missing.join(' e ');
  return `${k} destes: ${missing.join(', ')}`;
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
    equipment: {},
    bag: [],
    nextItemUid: 1,
    echo: null,
    hints: {},
    shifts: [],
    nemesis: null,
    shrines: {},
    flags: {},
    fame: {},
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
    ensureGear(c as Character);
    // A regra de liberar Elos mudou (sempre em ordem): corrige saves com buracos na Grade.
    refreshEloUnlocks(c as Character);
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
  ensureGear(migrated);
  return migrated;
}

/**
 * Garante um registro de Maestria para cada magia (novas magias entram com o tempo) e converte
 * a Maestria antiga (1–20, com Posturas e Fluxo) para a nova (1–7, só magias).
 * Nada equipado se perde: a Maestria sobe o bastante para o Elo e as Restrições em uso.
 */
export function ensureMastery(c: Character): void {
  const raw = c.mastery as unknown as Record<string, Partial<MasteryRecord> & { sharpness?: number }>;
  const old = Object.values(raw).some((r) => r && 'sharpness' in r);
  const next = {} as Record<MasteryId, MasteryRecord>;
  for (const id of MASTERY_IDS) {
    const r = raw[id];
    const lvl = typeof r?.level === 'number' ? r.level : 1;
    next[id] = { level: old ? migrateMasteryLevel(lvl) : Math.max(1, lvl) };
  }
  if (old) {
    for (const slot of c.elos) {
      if (!slot.technique || !isSpell(slot.technique)) continue;
      const s = SPELLS[slot.technique];
      const minElo = minSlotFor(c.affinity, s.affinity, s.minLevel);
      const needPact = Math.max(0, ...slot.restrictions.map((id) => PACTS[id]?.level ?? 0));
      const need = Math.max(masteryForElo(minElo, slot.level), needPact ? masteryForPact(needPact) : 1);
      next[slot.technique].level = Math.max(next[slot.technique].level, need);
    }
  }
  c.mastery = next;
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
