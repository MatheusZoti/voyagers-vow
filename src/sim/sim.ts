import {
  DEATH_PENALTY,
  learnSpell,
  maxHpFor,
  PENALTY_MAX,
  PENALTY_WINDOW_S,
  refreshEloUnlocks,
  xpToNext,
  type Character,
} from './character';
import { equipError, evaluateSlot, PACTS, trimMods, type EffectiveInfo, type EloSlot } from './elos';
import { AFFINITY_COLORS, AFFINITY_NAMES, type Affinity } from './flow/affinity';
import {
  computeFlowMods,
  createTide,
  POSTURES,
  shiftTide,
  tickTide,
  tideDrain,
  tideIncoming,
  tideLevel,
  tideOutgoing,
  type FlowMods,
  type Posture,
  type TideState,
} from './flow/flow';
import {
  decay,
  deathPenalty,
  displayLevel,
  masteryCostMult,
  MASTERY_CAPACITY,
  modifierDiscount,
  recordUse,
  riskFactor,
  sharpnessMult,
  totalMastery,
} from './mastery';
import { angleBetween, clamp, dist, normalize, Rng, type Vec2 } from './math';
import type { PsycheEventKind } from './psyche/emotions';
import { applyDialogueChoice, DIALOGUES, type DialogueDef, type DialogueId, type NpcId } from './psyche/dialogues';
import { psycheEvent, tickPsyche, type PsycheNotice } from './psyche/psyche';
import { STRONG_VALUE } from './psyche/traits';
import {
  isSpell,
  MASTERY_NAMES,
  resonance,
  sanitizeSlot,
  SPELL_IDS,
  SPELL_RULES,
  SPELLS,
  TECHNIQUES,
  type MasteryId,
  type SpellDef,
  type SpellId,
  type TechniqueId,
} from './techniques';
import { armorReduction, ENEMIES, SPELL_DROP_CHANCE, tierScale, type Projectile, type AttackDef, type Echo, type Enemy, type EnemyKind, type SpellDrop, type Trap } from './world/entities';
import { exitAt, inCircle, isBlocked, moveWithCollision, type GameMap, type RegionId } from './world/map';
import { buildRegion, regionName } from './world/regions';
import { computeStats, type CharacterStats } from './stats';
import { BAG_SIZE, ITEM_DROP_CHANCE, itemDef, itemMinLevel, itemName, lootPool, QUALITY_NAMES, resonanceState, resonanceText, rollItem, rollQuality, SLOTS, WEAPON_FORMS, DISSONANCE_STRESS_PER_S, type ItemDrop, type Slot } from './items';

/** Quanto tempo de jogo o Eco espera por você (s). */
export const ECHO_LIFE_S = 30 * 60;
import { TUNING } from './tuning';

export const TICK = 1 / 30;
/** Chave da região atual (para salvar a exploração). */
export const REGION = 'vale';
/** Quanto tempo um inimigo atingido sabe onde você está. */
export const PROVOKE_S = 8;
/** Raio em que a matilha é avisada. */
export const PACK_RADIUS = 7;
/** Distância máxima de casa antes de o inimigo desistir e recuar. */
export const LEASH = 26;

export interface PlayerInput {
  /** direção de movimento no plano do mundo (não precisa ser normalizada) */
  move: Vec2;
  /** ponto do mundo sob o cursor */
  aim: Vec2;
  basic: boolean;
  /** nível do Elo a ativar neste tick */
  useSlot: number | null;
  /** fixa a postura (Silêncio, Olhar ou Aberta) */
  posture: Posture | null;
  /** alterna a postura: pedir a mesma que já está ativa volta para Aberta */
  togglePosture: Posture | null;
  /** degraus da Maré: negativo = rumo à defesa (Véu), positivo = rumo ao ataque (Ímpeto) */
  tideSteps: number;
}

export const emptyInput = (): PlayerInput => ({ move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, basic: false, useSlot: null, posture: null, togglePosture: null, tideSteps: 0 });

export type NoticeTone = 'info' | 'good' | 'bad' | 'warn' | 'memory' | 'crisis';

export type SimEvent =
  | {
      t: 'damage';
      x: number;
      y: number;
      amount: number;
      target: 'enemy' | 'player';
      id?: number;
      crit?: boolean;
      pierce?: boolean;
      immune?: boolean;
      /** o inimigo está recuando (imune) */
      evade?: boolean;
      /** golpe pesado (finalizador do combo, magia): pausa maior no acerto */
      big?: boolean;
    }
  | { t: 'swing'; x: number; y: number; dir: Vec2; range: number; finisher?: boolean }
  | { t: 'signature'; from: Vec2; to: Vec2; radius: number; beyond: boolean }
  | { t: 'pointCharge' }
  | { t: 'telegraph'; x: number; y: number; r: number; duration: number; heavy: boolean }
  | { t: 'quake'; x: number; y: number; r: number }
  | { t: 'telegraphArc'; x: number; y: number; dir: Vec2; range: number; arc: number; duration: number }
  | { t: 'enemySwing'; id: number; dir: Vec2; range: number }
  | { t: 'enemyDeath'; id: number; x: number; y: number; boss: boolean }
  | { t: 'playerDeath'; x: number; y: number }
  | { t: 'respawn' }
  | { t: 'heal'; amount: number }
  | { t: 'trap'; x: number; y: number }
  | { t: 'perfectTide'; x: number; y: number }
  | { t: 'levelUp'; level: number }
  | { t: 'beam'; from: Vec2; to: Vec2; width: number; color: string }
  | { t: 'spellMark'; x: number; y: number; r: number; duration: number; color: string }
  | { t: 'impact'; x: number; y: number; r: number; color: string }
  | { t: 'tether'; from: Vec2; targets: Vec2[]; color: string }
  | { t: 'chain'; points: Vec2[]; color: string }
  | { t: 'chains'; x: number; y: number; r: number; color: string }
  | { t: 'slash'; x: number; y: number; dir: Vec2; range: number; arc: number; color: string }
  | { t: 'mark'; id: number; color: string }
  | { t: 'learn'; spell: SpellId; x: number; y: number }
  | { t: 'itemPickup'; x: number; y: number; quality: number }
  | { t: 'echoRecovered'; x: number; y: number }
  | { t: 'dialogue'; id: DialogueId }
  | { t: 'telegraphLine'; x: number; y: number; dir: Vec2; length: number; width: number; duration: number }
  | { t: 'shot'; x: number; y: number }
  | { t: 'travel'; to: RegionId; arrive: Vec2 }
  | { t: 'notice'; text: string; tone: NoticeTone };

export interface PlayerState {
  pos: Vec2;
  facing: Vec2;
  hp: number;
  flow: number;
  posture: Posture;
  tide: TideState;
  basicCd: number;
  slotCd: Record<number, number>;
  /** Ponto: próximo golpe crítico até este tempo */
  pointUntil: number;
  defenseZeroUntil: number;
  lastHitTakenAt: number;
  lastCombatAt: number;
  flowLockUntil: number;
  slowUntil: number;
  dead: boolean;
  respawnIn: number;
  meditateTime: number;
  penanceTime: number;
  killTimes: number[];
  nearDeathCd: number;
  needs: { fight: number; rest: number };
  /** visual: acaba de atacar (s) */
  attackAnim: number;
  /** combo do golpe básico: 0, 1, 2 (o terceiro é o finalizador) */
  combo: number;
  comboTimer: number;
  bossEngaged: boolean;
}

export class Simulation {
  readonly map: GameMap;
  readonly c: Character;
  readonly player: PlayerState;
  enemies: Enemy[] = [];
  traps: Trap[];
  /** Eco nesta região (o Eco mora no personagem; pode estar em outra região). */
  get echo(): Echo | null {
    const e = this.c.echo;
    return e && e.region === this.map.id ? e : null;
  }
  drops: SpellDrop[] = [];
  /** equipamentos no chão, esperando alguém passar por cima */
  itemDrops: ItemDrop[] = [];
  private bagFullWarnAt = -99;
  /** projéteis inimigos em voo */
  projectiles: Projectile[] = [];
  private traveling = false;
  private exitWarnAt = -99;
  events: SimEvent[] = [];
  /** eventos gerados fora de um passo (ações do painel): saem no próximo passo */
  private outbox: SimEvent[] = [];
  mods: FlowMods;
  /** tempo desta sessão (s) */
  time = 0;
  private rng: Rng;
  private nextId = 1;
  private impetusAcc = 0;
  private sneakAcc = 0;
  /** efeitos com atraso (ex.: Chuva de Esferas) */
  private pending: Array<{ at: number; run: () => void }> = [];
  /** último ponto mirado (para magias que miram no chão) */
  lastAim: Vec2 = { x: 0, y: 0 };
  private wasInSanctuary = true;
  /** névoa de guerra desta região: 1 = já visto */
  readonly explored: Uint8Array;
  private exploredTile = -1;
  private exploredPosture: Posture | null = null;
  private bridgePrompted = false;

  constructor(character: Character, seed = 99, arrive?: Vec2) {
    this.c = character;
    this.rng = new Rng(seed);
    this.map = buildRegion(character.region ?? 'vale');
    const start = arrive ?? this.map.playerStart;
    this.player = {
      pos: { ...start },
      facing: { x: 1, y: 0 },
      hp: maxHpFor(character),
      flow: this.flowMax(),
      posture: 'open',
      tide: createTide(),
      basicCd: 0,
      slotCd: {},
      pointUntil: -1,
      defenseZeroUntil: -1,
      lastHitTakenAt: -99,
      lastCombatAt: -99,
      flowLockUntil: -1,
      slowUntil: -1,
      dead: false,
      respawnIn: 0,
      meditateTime: 0,
      penanceTime: 0,
      killTimes: [],
      nearDeathCd: 0,
      needs: { fight: 0.7, rest: 0.8 },
      attackAnim: 0,
      combo: 0,
      comboTimer: 0,
      bossEngaged: false,
    };
    for (const s of this.map.spawns) this.spawn(s.kind, { x: s.x + 0.5, y: s.y + 0.5 });
    if (this.map.bossSpawn) this.spawn('boss', { ...this.map.bossSpawn });
    this.traps = this.map.traps.map((p) => ({ pos: { ...p }, armed: true, revealed: false, rearmIn: 0 }));
    this.mods = this.withGear(computeFlowMods(character.psyche, 'open'));
    this.explored = new Uint8Array(this.map.w * this.map.h);
    const saved = character.explored?.[this.map.id] ?? '';
    for (let i = 0; i < saved.length && i < this.explored.length; i++) this.explored[i] = saved.charCodeAt(i) === 49 ? 1 : 0;
    this.explore();
    for (const m of Object.values(character.mastery)) m.sessionUses = 0;
    for (const slot of character.elos) {
      sanitizeSlot(slot);
      // Regra de equipar (Elo mínimo = 1 + distância): desequipa o que não cabe mais.
      if (slot.technique && this.equipProblem(slot.level, slot.technique as SpellId)) {
        slot.technique = null;
        sanitizeSlot(slot);
      }
      // Custos de forja podem mudar entre versões: remove o que passou do orçamento.
      const info = this.slotInfo(slot);
      if (info && slot.technique) trimMods(slot, info, modifierDiscount(character.mastery[slot.technique as MasteryId]));
    }
  }

  // -------------------------------------------------------------------------
  // Névoa de guerra
  // -------------------------------------------------------------------------

  /** Raio de visão: o Olhar enxerga mais longe. */
  visionRadius(): number {
    return this.player.posture === 'gaze' ? 14 : 10;
  }

  /** Está à vista agora? */
  isVisible(p: Vec2): boolean {
    return !this.player.dead && dist(p, this.player.pos) <= this.visionRadius();
  }

  isExplored(x: number, y: number): boolean {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    return ix >= 0 && iy >= 0 && ix < this.map.w && iy < this.map.h && this.explored[iy * this.map.w + ix] === 1;
  }

  /** Marca como explorado tudo que está no raio de visão (salvo no personagem). */
  private explore(): void {
    const p = this.player;
    const m = this.map;
    const tileIdx = Math.floor(p.pos.y) * m.w + Math.floor(p.pos.x);
    if (tileIdx === this.exploredTile && p.posture === this.exploredPosture) return;
    this.exploredTile = tileIdx;
    this.exploredPosture = p.posture;
    const r = this.visionRadius();
    let changed = false;
    for (let y = Math.max(0, Math.floor(p.pos.y - r)); y <= Math.min(m.h - 1, p.pos.y + r); y++)
      for (let x = Math.max(0, Math.floor(p.pos.x - r)); x <= Math.min(m.w - 1, p.pos.x + r); x++) {
        if (Math.hypot(x + 0.5 - p.pos.x, y + 0.5 - p.pos.y) > r) continue;
        const i = y * m.w + x;
        if (!this.explored[i]) {
          this.explored[i] = 1;
          changed = true;
        }
      }
    if (changed) {
      let s = '';
      for (let i = 0; i < this.explored.length; i++) s += this.explored[i] ? '1' : '0';
      this.c.explored[this.map.id] = s;
    }
  }

  /** Por que esta magia não entra neste Elo (ou null se entra). */
  equipProblem(slotLevel: number, spell: SpellId): string | null {
    const s = SPELLS[spell];
    return equipError(slotLevel, this.c.affinity, s.affinity, s.minLevel);
  }

  // -------------------------------------------------------------------------
  // NPCs e diálogos
  // -------------------------------------------------------------------------

  /** Próxima conversa disponível com este NPC, se houver. */
  dialogueFor(npc: NpcId): DialogueDef | null {
    const done = new Set(this.c.dialogues);
    for (const d of Object.values(DIALOGUES)) {
      if (d.npc !== npc || done.has(d.id)) continue;
      const r = d.requires;
      if (r?.after && !done.has(r.after)) continue;
      if (r?.level && this.c.level < r.level) continue;
      if (r?.deaths && this.c.deaths < r.deaths) continue;
      return d;
    }
    return null;
  }

  /** NPC sob o ponto do mundo (para clicar e conversar). */
  npcAt(point: Vec2, radius = 0.9): NpcId | null {
    const n = this.map.npcs.find((x) => Math.hypot(x.x - point.x, x.y - point.y) <= radius);
    return n?.id ?? null;
  }

  npcDistance(npc: NpcId): number {
    const n = this.map.npcs.find((x) => x.id === npc)!;
    return Math.hypot(n.x - this.player.pos.x, n.y - this.player.pos.y);
  }

  /** Aplica a escolha do jogador. A personalidade muda; o jogador só vê a resposta. */
  answerDialogue(id: DialogueId, option: number): string | null {
    const d = DIALOGUES[id];
    const opt = d?.options[option];
    if (!d || !opt || this.c.dialogues.includes(id)) return null;
    applyDialogueChoice(this.c.psyche.traits, this.c.psyche.values, opt, this.rng);
    this.c.dialogues.push(id);
    return opt.reply;
  }

  // -------------------------------------------------------------------------
  // Consultas
  // -------------------------------------------------------------------------

  get playTime(): number {
    return this.c.playTime;
  }

  private statsKey = '';
  private statsCache: CharacterStats | null = null;
  /** Atributos derivados do personagem (recalculados quando nível, Maestria ou Pactos mudam). */
  stats(): CharacterStats {
    const c = this.c;
    const gear = Object.values(c.equipment)
      .map((it) => (it ? `${it.uid}${resonanceState(it, c.psyche.values)?.[0] ?? ''}` : '0'))
      .join(',');
    const key = `${c.level}|${c.lifeCostLost}|${displayLevel(c.mastery.capacity)}|${gear}`;
    if (key !== this.statsKey || !this.statsCache) {
      this.statsKey = key;
      this.statsCache = computeStats(c);
    }
    return this.statsCache;
  }

  /** Efeitos do equipamento que entram nos modificadores do Fluxo (Maré mais rápida). */
  private withGear(m: FlowMods): FlowMods {
    m.tideSpeed *= this.stats().tideSpeed;
    return m;
  }

  flowMax(): number {
    return this.stats().flowMax * (this.mods?.flowMaxMult ?? 1);
  }

  maxHp(): number {
    return this.stats().hp;
  }

  inSanctuary(p: Vec2 = this.player.pos): boolean {
    return inCircle(this.map.sanctuary, p);
  }

  inCombat(): boolean {
    return this.time - this.player.lastCombatAt < 6;
  }

  meditating(): boolean {
    const p = this.player;
    return !p.dead && p.posture === 'silence' && this.inSanctuary() && !this.inCombat();
  }

  focused(): boolean {
    return this.player.needs.fight > 0.75 && this.player.needs.rest > 0.75;
  }

  boss(): Enemy | undefined {
    return this.enemies.find((e) => e.def.boss);
  }

  slotInfo(slot: EloSlot): EffectiveInfo | null {
    if (!slot.technique) return null;
    const tech = TECHNIQUES[slot.technique as TechniqueId];
    return evaluateSlot(slot, {
      values: this.c.psyche.values,
      characterAffinity: this.c.affinity,
      techniqueAffinity: tech.affinity,
      modDiscount: modifierDiscount(this.c.mastery[slot.technique as MasteryId]),
    });
  }

  /** Custo real em Fluxo de usar o Elo agora. */
  slotCost(slot: EloSlot, info: EffectiveInfo): number {
    const tech = TECHNIQUES[slot.technique as TechniqueId];
    const res = resonance(tech.tags, this.c.psyche.traits);
    const st = this.stats();
    const focus = st.focus && st.focus.affinity === tech.affinity ? st.focus.cost : 1;
    return (
      ((info.costPct / 100) * this.flowMax() * masteryCostMult(this.c.mastery[tech.id]) * this.mods.techniqueCost * TUNING.spellCost * st.flowCost * focus) /
      Math.max(0.5, res)
    );
  }

  /** Prévia de uma magia num Elo, sem lançar: nível efetivo, dano por alvo agora, custo e recarga. */
  spellPreview(slot: EloSlot): { info: EffectiveInfo; damage: number; cost: number; cooldown: number } | null {
    const info = this.slotInfo(slot);
    if (!info || !slot.technique) return null;
    const spell = SPELLS[slot.technique as SpellId];
    return {
      info,
      damage: spell.baseDamage ? this.spellDamage(spell, slot, info) : 0,
      cost: this.slotCost(slot, info),
      cooldown: this.slotCooldown(slot, info),
    };
  }

  slotCooldown(slot: EloSlot, info: EffectiveInfo): number {
    return info.cooldown * (1 - 0.12 * (slot.mods.cadence ?? 0)) * TUNING.cooldown;
  }

  private contraryPacts(slot: EloSlot): number {
    return slot.restrictions.filter((id) => {
      const v = PACTS[id].value;
      return v !== null && this.c.psyche.values[v] <= -STRONG_VALUE;
    }).length;
  }

  // -------------------------------------------------------------------------
  // Passo da simulação
  // -------------------------------------------------------------------------

  step(input: PlayerInput, dt = TICK): SimEvent[] {
    this.events = this.outbox;
    this.outbox = [];
    this.time += dt;
    this.c.playTime += dt;
    const p = this.player;
    const psy = this.c.psyche;

    this.mods = this.withGear(computeFlowMods(psy, p.posture, p.tide.value));

    if (p.dead) {
      p.respawnIn -= dt;
      if (p.respawnIn <= 0) this.respawn();
    } else {
      this.updatePlayer(input, dt);
    }
    for (const fx of this.pending.filter((x) => x.at <= this.time)) fx.run();
    this.pending = this.pending.filter((x) => x.at > this.time);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateTraps(dt);
    this.updateProgress(dt);

    const notices = tickPsyche(psy, dt, {
      playTime: this.playTime,
      inCombat: this.inCombat(),
      meditating: this.meditating(),
      unmetNeeds: ((p.needs.fight < 0.2 ? 1 : 0) + (p.needs.rest < 0.2 ? 1 : 0)) / 2,
    });
    this.pushPsycheNotices(notices);
    return this.events;
  }

  private notice(text: string, tone: NoticeTone = 'info'): void {
    this.events.push({ t: 'notice', text, tone });
  }

  private pushPsycheNotices(ns: PsycheNotice[]): void {
    for (const n of ns) {
      const tone: NoticeTone =
        n.type === 'crisisWarning' || n.type === 'crisisStart' ? 'crisis' : n.type === 'longMemory' || n.type === 'memory' ? 'memory' : 'info';
      this.notice(n.text, tone);
      if (n.type === 'crisisStart' && this.c.psyche.crisis.phase === 'active') {
        // Uma Crise derruba a Afiação das técnicas em uso.
        const inUse = this.c.elos.filter((s) => s.technique).map((s) => s.technique as MasteryId);
        for (const id of ['basic', ...this.stanceMastery(), ...inUse] as MasteryId[]) {
          const r = this.c.mastery[id];
          r.sharpness = Math.max(0, r.sharpness - 0.2);
        }
      }
    }
  }

  /** Maestrias da postura e do lado da Maré em uso agora. */
  private stanceMastery(): MasteryId[] {
    const p = this.player;
    const ids: MasteryId[] = [];
    if (p.posture !== 'open') ids.push(p.posture);
    const lvl = tideLevel(p.tide.value);
    if (lvl < 0) ids.push('veil');
    if (lvl > 0) ids.push('impetus');
    return ids;
  }

  private feel(kind: PsycheEventKind, magnitude = 1): void {
    this.pushPsycheNotices(psycheEvent(this.c.psyche, kind, this.playTime, magnitude));
  }

  private train(id: MasteryId, baseXp: number, risk: number): void {
    const r = this.c.mastery[id];
    const tech = isSpell(id) ? SPELLS[id] : null;
    const others = totalMastery(Object.values(this.c.mastery));
    const up = recordUse(r, baseXp, {
      risk,
      traits: this.c.psyche.traits,
      resonance: tech ? resonance(tech.tags, this.c.psyche.traits) : 1,
      playTime: this.playTime,
      totalMastery: others,
    });
    if (up) this.notice(`Maestria: ${MASTERY_NAMES[id]} chegou ao nível ${displayLevel(r)}`, 'good');
  }

  private currentRisk(target?: Enemy): number {
    const p = this.player;
    const elitesNear = this.enemies.filter((e) => e.def.elite && e.state !== 'dead' && e.aggro && dist(e.pos, p.pos) < 12).length;
    return riskFactor({
      enemyLevelDiff: target ? target.def.level + tierScale(this.map.tier).level - this.c.level : 0,
      hpFrac: p.hp / this.maxHp(),
      elitesNear,
      trivial: target ? false : !this.inCombat(),
    });
  }

  // -------------------------------------------------------------------------
  // Jogador
  // -------------------------------------------------------------------------

  private updatePlayer(input: PlayerInput, dt: number): void {
    const p = this.player;
    const m = this.mods;
    const c = this.c;

    // Postura.
    let wanted = input.posture;
    if (input.togglePosture) wanted = input.togglePosture === p.posture ? 'open' : input.togglePosture;
    if (m.forcedPosture) wanted = m.forcedPosture;
    if (wanted && wanted !== p.posture) {
      if (wanted === 'silence' && !m.silenceAllowed) this.notice('O Orgulho não deixa você se esconder.', 'warn');
      else if (wanted !== 'silence' && m.forcedPosture === 'silence') {
        /* Pânico força o Silêncio */
      } else {
        p.posture = wanted;
        this.mods = this.withGear(computeFlowMods(c.psyche, p.posture, p.tide.value));
      }
    }
    if (p.posture === 'silence' && !m.silenceAllowed && !m.forcedPosture) p.posture = 'open';

    // Maré: degraus rumo à defesa (Véu) ou ao ataque (Ímpeto).
    if (input.tideSteps) shiftTide(p.tide, input.tideSteps);
    tickTide(p.tide, dt, this.mods, displayLevel(c.mastery.tide) * 0.04, this.time);

    // Reserva de Fluxo: a postura e a Maré fora do centro drenam.
    const def = POSTURES[p.posture];
    const flowMax = this.flowMax();
    p.flow -= def.drain * this.mods.postureDrain * dt;
    p.flow -= tideDrain(p.tide.value) * flowMax * this.mods.tideDrain * dt;
    if (this.time >= p.flowLockUntil) {
      p.flow += this.stats().flowRegen * def.regenMult * this.mods.regen * TUNING.flowRegen * dt;
    }
    if (p.flow <= 0) {
      p.flow = 0;
      if (def.drain > 1) {
        p.posture = 'open';
        this.notice(`Fluxo esgotado: o ${POSTURES.gaze.name} se fecha.`, 'warn');
      }
      if (p.tide.target !== 0.5 && this.mods.tideLock === null) {
        p.tide.target = 0.5;
        this.notice('Fluxo esgotado: a Maré volta ao centro.', 'warn');
      }
    }
    p.flow = Math.min(p.flow, flowMax);

    // Passar perto de inimigos sem ser notado treina o Silêncio.
    if (p.posture === 'silence' && !this.inSanctuary()) {
      const near = this.enemies.filter((e) => e.state !== 'dead' && !e.aggro && !e.def.elite && dist(e.pos, p.pos) < e.def.aggroRadius);
      if (near.length) {
        this.sneakAcc += dt;
        if (this.sneakAcc >= 1) {
          this.sneakAcc -= 1;
          this.train('silence', 2 * near.length, this.currentRisk(near[0]));
        }
      }
    }

    // Ímpeto (Maré no ataque) sustentado treina a capacidade da reserva.
    if (tideLevel(p.tide.value) > 0 && this.inCombat()) {
      this.impetusAcc += dt;
      if (this.impetusAcc >= 1) {
        this.impetusAcc -= 1;
        const risk = this.currentRisk();
        this.train('impetus', 1.5, risk);
        this.train('capacity', 1.2, risk);
      }
    }

    // Movimento.
    const dir = normalize(input.move);
    const slow = this.time < p.slowUntil ? 0.5 : 1;
    const speed = this.stats().speed * this.mods.moveSpeed * slow * (p.attackAnim > 0.15 ? 0.7 : 1);
    if (dir.x || dir.y) moveWithCollision(this.map, p.pos, dir.x * speed * dt, dir.y * speed * dt, 0.35);
    this.lastAim = { ...input.aim };
    const aimDir = normalize({ x: input.aim.x - p.pos.x, y: input.aim.y - p.pos.y });
    if (aimDir.x || aimDir.y) p.facing = aimDir;
    else if (dir.x || dir.y) p.facing = dir;
    p.attackAnim = Math.max(0, p.attackAnim - dt);

    // Golpe básico.
    p.basicCd -= dt;
    p.comboTimer = Math.max(0, p.comboTimer - dt);
    if (input.basic && p.basicCd <= 0 && !(p.posture === 'silence')) this.basicAttack();

    // Técnicas nos Elos.
    for (const lvl of Object.keys(p.slotCd)) p.slotCd[+lvl] = Math.max(0, (p.slotCd[+lvl] ?? 0) - dt);
    if (input.useSlot !== null) this.useSlot(input.useSlot);

    // Meditação, penitência e necessidades.
    const traits = c.psyche.traits;
    p.needs.fight = clamp(p.needs.fight - (dt / 300) * (0.6 + traits.competitiveness / 125), 0, 1);
    p.needs.rest = clamp(p.needs.rest - dt / 480, 0, 1);
    if (this.meditating()) {
      p.meditateTime += dt;
      p.needs.rest = clamp(p.needs.rest + dt * 0.12, 0, 1);
      if (p.meditateTime >= 6) {
        p.meditateTime = 0;
        this.feel('meditate');
        this.train('silence', 4, 1);
      }
      if (c.elos.some((e) => e.sealed)) {
        p.penanceTime += dt;
        if (p.penanceTime >= 8) {
          p.penanceTime = 0;
          for (const e of c.elos) e.sealed = false;
          this.feel('redemption');
          this.notice('Penitência cumprida. Os Elos selados voltam a responder.', 'good');
        }
      }
    } else {
      p.meditateTime = 0;
      p.penanceTime = 0;
    }

    // Quase-morte.
    p.nearDeathCd -= dt;
    if (p.hp / this.maxHp() < 0.25 && p.nearDeathCd <= 0) {
      p.nearDeathCd = 25;
      this.feel('nearDeath');
    }

    if (!p.dead) this.explore();

    // Grimórios no chão e livros antigos.
    for (const d of [...this.drops]) {
      if (this.time > d.expiresAt) this.drops = this.drops.filter((x) => x !== d);
      else if (dist(d.pos, p.pos) < 1.1) {
        this.drops = this.drops.filter((x) => x !== d);
        this.acquireSpell(d.spell, d.pos, 'Grimório');
      }
    }
    for (const d of [...this.itemDrops]) {
      if (this.time > d.expiresAt) this.itemDrops = this.itemDrops.filter((x) => x !== d);
      else if (dist(d.pos, p.pos) < 1.1 && !p.dead) {
        if (c.bag.length >= BAG_SIZE) {
          if (this.time - this.bagFullWarnAt > 4) {
            this.bagFullWarnAt = this.time;
            this.notice('Mochila cheia. Jogue algo fora na aba Atributos (I).', 'warn');
          }
          continue;
        }
        this.itemDrops = this.itemDrops.filter((x) => x !== d);
        c.bag.push(d.item);
        this.events.push({ t: 'itemPickup', x: d.pos.x, y: d.pos.y, quality: d.item.quality });
        this.notice(`Você pegou: ${itemName(d.item)} (${QUALITY_NAMES[d.item.quality - 1]}).`, 'good');
      }
    }
    for (const b of this.map.books) {
      if (c.booksRead.includes(b.id) || Math.hypot(b.x - p.pos.x, b.y - p.pos.y) > 1.4) continue;
      c.booksRead.push(b.id);
      this.acquireSpell(b.spell, { x: b.x, y: b.y }, 'Livro antigo');
    }

    // Fugir de uma luta perdida para o santuário molda a personalidade.
    const inSanct = this.inSanctuary();
    if (inSanct && !this.wasInSanctuary && p.hp / this.maxHp() < 0.5 && this.live().some((e) => e.aggro && dist(e.pos, p.pos) < 12)) {
      this.feel('retreat');
    }
    this.wasInSanctuary = inSanct;

    // Evento da ponte.
    const br = this.map.bridge;
    if (
      br &&
      !this.bridgePrompted &&
      !c.dialogues.includes('bridge') &&
      p.pos.x >= br.x0 - 1 &&
      p.pos.x <= br.x1 + 1 &&
      p.pos.y >= br.y0 - 1 &&
      p.pos.y <= br.y1 + 2
    ) {
      this.bridgePrompted = true;
      this.events.push({ t: 'dialogue', id: 'bridge' });
    }

    // Dissonância: lutar vestindo algo contra os seus Valores pesa na mente.
    if (!p.dead && this.time - p.lastCombatAt < 3) {
      const n = this.dissonantGear();
      if (n) c.psyche.stress = clamp(c.psyche.stress + DISSONANCE_STRESS_PER_S * n * dt, 0, 100);
    }

    // Eco do jogador: se dissipa com o tempo jogado (esteja onde estiver); recupera-se passando nele.
    const echo = c.echo;
    if (echo && this.playTime > echo.expiresAt) {
      c.echo = null;
      this.notice(echo.items.length ? `Seu Eco se dissipou, e com ele: ${echo.items.map((x) => itemName(x.item)).join(', ')}.` : 'Seu Eco se dissipou.', 'bad');
    } else if (echo && echo.region === this.map.id && !p.dead && dist(echo.pos, p.pos) < 1.3) {
      this.recoverEcho(echo);
    }

    // Arena do chefe e o juramento de nunca fugir.
    // Saídas para outras regiões.
    const exit = exitAt(this.map, p.pos);
    if (exit && !this.traveling) {
      if (exit.needsBoss && !c.bossDefeated) {
        // Bloqueado: empurra de volta e avisa.
        moveWithCollision(this.map, p.pos, exit.x0 > this.map.w / 2 ? -0.6 : 0.6, 0, 0.35);
        if (this.time - this.exitWarnAt > 3) {
          this.exitWarnAt = this.time;
          this.notice('A passagem está selada. O Guardião da Ponte ainda vigia o vale.', 'warn');
        }
      } else {
        this.traveling = true;
        this.events.push({ t: 'travel', to: exit.to, arrive: { ...exit.arrive } });
        this.notice(`Rumo a ${regionName(exit.to)}…`, 'info');
      }
    }

    const boss = this.boss();
    const arena = this.map.arena;
    if (boss && arena && boss.state !== 'dead') {
      if (!p.bossEngaged && inCircle(arena, p.pos, -1)) {
        p.bossEngaged = true;
        boss.aggro = true;
        this.notice('O Guardião da Ponte desperta.', 'warn');
      } else if (p.bossEngaged && !inCircle(arena, p.pos, 5)) {
        p.bossEngaged = false;
        this.resetEnemy(boss);
        this.notice('Você fugiu do Guardião.', 'warn');
        this.breakOath('neverFlee');
      }
    }
  }

  private breakOath(id: 'neverFlee'): void {
    for (const slot of this.c.elos) {
      if (slot.restrictions.includes(id) && !slot.sealed) {
        slot.sealed = true;
        this.feel('pactBroken');
        this.notice(`Juramento quebrado: "${PACTS[id].name}". Elo ${slot.level} selado até a penitência no santuário.`, 'bad');
      }
    }
  }

  private outgoingMult(): number {
    const p = this.player;
    return (
      this.mods.outgoing *
      tideOutgoing(p.tide.value) *
      (tideLevel(p.tide.value) > 0 ? 1 + 0.005 * (displayLevel(this.c.mastery.impetus) - 1) : 1) *
      this.stats().power *
      (this.focused() ? 1.1 : 1)
    );
  }

  /**
   * Golpe básico em combo de 3: dois golpes rápidos e um finalizador mais forte,
   * mais largo, que empurra e faz inimigos comuns cambalearem.
   */
  private basicAttack(): void {
    const p = this.player;
    p.combo = p.comboTimer > 0 ? (p.combo + 1) % 3 : 0;
    const finisher = p.combo === 2;
    const form = WEAPON_FORMS[this.stats().weapon];
    const range = (finisher ? 2.15 : 1.85) + form.reach;
    const arc = (((finisher ? 75 : 55) + form.arc) * Math.PI) / 180;
    p.basicCd = (finisher ? 0.55 : 0.36) * form.cadence;
    p.comboTimer = 0.95;
    p.attackAnim = finisher ? 0.32 : 0.24;
    // Pequeno avanço a cada golpe: dá peso ao ataque.
    moveWithCollision(this.map, p.pos, p.facing.x * (finisher ? 0.35 : 0.18), p.facing.y * (finisher ? 0.35 : 0.18), 0.35);
    this.events.push({ t: 'swing', x: p.pos.x, y: p.pos.y, dir: { ...p.facing }, range, finisher });
    const sharp = sharpnessMult(this.c.mastery.basic.sharpness);
    const mastery = 1 + 0.03 * (displayLevel(this.c.mastery.basic) - 1);
    let hitAny = false;
    for (const e of this.enemies) {
      if (e.state === 'dead') continue;
      const d = dist(e.pos, p.pos);
      if (d > range + e.def.radius) continue;
      const to = { x: e.pos.x - p.pos.x, y: e.pos.y - p.pos.y };
      if (d > 0.6 && angleBetween(to, p.facing) > arc) continue;
      hitAny = true;
      const dmg = 10 * form.damage * (finisher ? 1.5 : 1) * this.outgoingMult() * sharp * mastery;
      this.hitEnemy(e, dmg, { ignoreArmor: false, source: 'basic', knock: (finisher ? 7 : 2.5) * form.knock, big: finisher });
      if (finisher && !e.def.elite) this.stunEnemy(e, 0.3 + form.stun);
      this.train('basic', 3, this.currentRisk(e));
    }
    if (hitAny) p.lastCombatAt = this.time;
  }

  private useSlot(level: number): void {
    const p = this.player;
    const slot = this.c.elos[level - 1];
    if (!slot || !slot.unlocked || !slot.technique) return;
    const problem = this.equipProblem(slot.level, slot.technique as SpellId);
    if (problem) return this.notice(`${SPELLS[slot.technique as SpellId].name}: ${problem}`, 'warn');
    if (slot.sealed) return this.notice(`Elo ${level} está selado. Cumpra a penitência no santuário.`, 'warn');
    if (this.mods.techniquesBlocked) return this.notice('O Pânico bloqueia suas técnicas.', 'warn');
    if (!POSTURES[p.posture].allowsTechniques) return this.notice('Sem técnicas em Silêncio.', 'warn');
    if ((p.slotCd[level] ?? 0) > 0) return;
    const info = this.slotInfo(slot)!;
    const cost = this.slotCost(slot, info);
    if (p.flow < cost) return this.notice('Fluxo insuficiente.', 'warn');
    // Restrições de estado.
    if (slot.restrictions.includes('recentlyHit') && this.time - p.lastHitTakenAt > 3)
      return this.notice('Restrição: só depois de receber dano (3 s).', 'warn');
    if (slot.restrictions.includes('lowFlow') && p.flow / this.flowMax() >= 0.3)
      return this.notice('Restrição: só com o Fluxo abaixo de 30%.', 'warn');

    p.flow -= cost;
    p.slotCd[level] = this.slotCooldown(slot, info);
    if (slot.restrictions.includes('lifeCost')) {
      this.c.lifeCostLost += 1;
      p.hp = Math.min(p.hp, this.maxHp());
    }
    if (this.contraryPacts(slot) > 0) this.c.psyche.stress = clamp(this.c.psyche.stress + 4, 0, 100);

    p.lastCombatAt = this.time;
    p.attackAnim = 0.3;
    this.castSpell(SPELLS[slot.technique as SpellId], slot, info);
  }

  // -------------------------------------------------------------------------
  // Magias
  // -------------------------------------------------------------------------

  /** Dano de uma magia neste Elo: nível efetivo, forja, postura, Maré, Maestria e Afiação. */
  private spellDamage(spell: SpellDef, slot: EloSlot, info: EffectiveInfo): number {
    const r = this.c.mastery[spell.id];
    return (
      spell.baseDamage *
      info.power *
      (1 + 0.2 * (slot.mods.damage ?? 0)) *
      this.outgoingMult() *
      this.mods.signature *
      sharpnessMult(r.sharpness) *
      (1 + SPELL_RULES.masteryPerLevel * (displayLevel(r) - 1)) *
      this.focusMult(spell.affinity)
    );
  }

  /** Foco equipado: magias da afinidade dele causam mais dano. */
  private focusMult(affinity: Affinity): number {
    const f = this.stats().focus;
    return f && f.affinity === affinity ? f.power : 1;
  }

  /** Acerto de magia num inimigo, respeitando "só contra elites" e a forja. Retorna se valeu. */
  private spellHit(spell: SpellDef, slot: EloSlot, e: Enemy, dmg: number, pierce = false): boolean {
    if (!this.isVisible(e.pos)) return false;
    if (slot.restrictions.includes('eliteOnly') && !e.def.elite) {
      this.events.push({ t: 'damage', x: e.pos.x, y: e.pos.y, amount: 0, target: 'enemy', id: e.id, immune: true });
      return false;
    }
    if (slot.mods.stun) this.stunEnemy(e, SPELL_RULES.stunModS);
    this.train(spell.id, 10, this.currentRisk(e));
    if (dmg > 0) this.hitEnemy(e, dmg, { ignoreArmor: pierce || !!slot.mods.shatter, source: 'spell', knock: SPELL_RULES.knockback, big: true });
    return true;
  }

  /** Depois da magia: Restaurar cura se acertou; "se errar" pune se não acertou ninguém. */
  private afterSpell(slot: EloSlot, hits: number): void {
    const p = this.player;
    if (hits > 0 && slot.mods.restore) this.healPlayer(this.maxHp() * SPELL_RULES.restoreFrac);
    if (hits === 0 && slot.restrictions.includes('missLock')) {
      p.flow = 0;
      p.flowLockUntil = this.time + 20;
      this.notice('Restrição: você errou. Fluxo perdido por 20 s.', 'bad');
    }
  }

  private stunEnemy(e: Enemy, s: number): void {
    if (e.def.boss) s *= SPELL_RULES.bossStunMult;
    e.stun = Math.max(e.stun, s);
    if (e.state === 'windup' || e.state === 'charging') e.state = 'stunned';
  }

  private live(): Enemy[] {
    return this.enemies.filter((e) => e.state !== 'dead');
  }

  /** Ponto do mundo na direção da mira, limitado ao alcance. */
  private aimPoint(range: number): Vec2 {
    const p = this.player;
    const a = this.lastAim;
    const d = Math.min(range, dist(a, p.pos));
    const dir = normalize({ x: a.x - p.pos.x, y: a.y - p.pos.y });
    return { x: p.pos.x + dir.x * d, y: p.pos.y + dir.y * d };
  }

  /** Puxa/empurra um inimigo ao longo de `dir` por `amount` metros, com colisão. */
  private shove(e: Enemy, dir: Vec2, amount: number): void {
    if (e.def.boss) return;
    const k = e.def.elite ? SPELL_RULES.eliteShoveMult : 1;
    const steps = 6;
    for (let i = 0; i < steps; i++) moveWithCollision(this.map, e.pos, (dir.x * amount * k) / steps, (dir.y * amount * k) / steps, Math.min(0.45, e.def.radius * 0.6));
    if (inCircle(this.map.sanctuary, e.pos, 1)) {
      // Inimigos nunca entram no santuário, nem empurrados.
      const out = normalize({ x: e.pos.x - this.map.sanctuary.x, y: e.pos.y - this.map.sanctuary.y });
      e.pos = { x: this.map.sanctuary.x + out.x * (this.map.sanctuary.r + 1.1), y: this.map.sanctuary.y + out.y * (this.map.sanctuary.r + 1.1) };
    }
  }

  private castSpell(spell: SpellDef, slot: EloSlot, info: EffectiveInfo): void {
    const p = this.player;
    // Alcance: +12% por ponto, nunca além do raio de visão (não se atira no escuro).
    const range = Math.min(spell.range * (1 + 0.12 * (slot.mods.range ?? 0)), this.visionRadius());
    const radius = spell.radius * (1 + 0.3 * (slot.mods.area ?? 0));
    const dmg = this.spellDamage(spell, slot, info);
    const color = AFFINITY_COLORS[spell.affinity];
    const beyond = info.beyondLimit;
    let hits = 0;

    switch (spell.id) {
      case 'votePunch': {
        const from = { ...p.pos };
        for (let i = 0; i < 8; i++) moveWithCollision(this.map, p.pos, (p.facing.x * range) / 8, (p.facing.y * range) / 8, 0.35);
        const center = { x: p.pos.x + p.facing.x * 0.6, y: p.pos.y + p.facing.y * 0.6 };
        this.events.push({ t: 'signature', from, to: { ...p.pos }, radius, beyond });
        for (const e of this.live()) {
          if (dist(e.pos, center) > radius + e.def.radius) continue;
          e.signatureHits += 1;
          if (this.spellHit(spell, slot, e, dmg, e.signatureHits % spell.fx.pierceEvery! === 0)) hits++;
        }
        return this.afterSpell(slot, hits);
      }
      case 'point':
        return this.castPoint(info);
      case 'flowLance': {
        const from = { ...p.pos };
        const dir = { ...p.facing };
        let len = 0;
        while (len < range && !isBlocked(this.map, from.x + dir.x * (len + 0.3), from.y + dir.y * (len + 0.3))) len += 0.3;
        len = Math.min(len, range);
        const to = { x: from.x + dir.x * len, y: from.y + dir.y * len };
        this.events.push({ t: 'beam', from, to, width: radius, color: beyond ? '#ffd84a' : color });
        for (const e of this.live()) {
          const rx = e.pos.x - from.x;
          const ry = e.pos.y - from.y;
          const along = rx * dir.x + ry * dir.y;
          const perp = Math.abs(rx * dir.y - ry * dir.x);
          if (along < 0 || along > len + e.def.radius || perp > radius + e.def.radius) continue;
          if (this.spellHit(spell, slot, e, dmg)) hits++;
        }
        return this.afterSpell(slot, hits);
      }
      case 'orbRain': {
        const at = this.aimPoint(range);
        this.events.push({ t: 'spellMark', x: at.x, y: at.y, r: radius, duration: spell.fx.delayS!, color });
        this.pending.push({
          at: this.time + spell.fx.delayS!,
          run: () => {
            let h = 0;
            this.events.push({ t: 'impact', x: at.x, y: at.y, r: radius, color: beyond ? '#ffd84a' : color });
            for (const e of this.live()) if (dist(e.pos, at) <= radius + e.def.radius && this.spellHit(spell, slot, e, dmg)) h++;
            this.afterSpell(slot, h);
          },
        });
        return;
      }
      case 'elasticPull': {
        const targets: Vec2[] = [];
        for (const e of this.live()) {
          const to = { x: e.pos.x - p.pos.x, y: e.pos.y - p.pos.y };
          const d = Math.hypot(to.x, to.y);
          if (d > range || (d > 0.8 && angleBetween(to, p.facing) > (spell.fx.coneHalfDeg! * Math.PI) / 180)) continue;
          if (!this.spellHit(spell, slot, e, dmg)) continue;
          hits++;
          targets.push({ ...e.pos });
          this.shove(e, normalize({ x: -to.x, y: -to.y }), Math.max(0, d - (e.def.radius + 1)));
          e.aggro = true;
        }
        this.events.push({ t: 'tether', from: { ...p.pos }, targets, color });
        return this.afterSpell(slot, hits);
      }
      case 'discharge': {
        const aim = this.lastAim;
        const first = this.live()
          .filter((e) => dist(e.pos, p.pos) <= range && (e.revealed || !e.def.shadowed))
          .sort((a, b) => dist(a.pos, aim) - dist(b.pos, aim))[0];
        if (!first) {
          this.events.push({ t: 'chain', points: [{ ...p.pos }, this.aimPoint(range)], color });
          return this.afterSpell(slot, 0);
        }
        const chain: Enemy[] = [first];
        const jumps = spell.fx.jumps! + (slot.mods.area ?? 0);
        while (chain.length <= jumps) {
          const last = chain[chain.length - 1]!;
          const next = this.live()
            .filter((e) => !chain.includes(e) && dist(e.pos, last.pos) <= radius)
            .sort((a, b) => dist(a.pos, last.pos) - dist(b.pos, last.pos))[0];
          if (!next) break;
          chain.push(next);
        }
        this.events.push({ t: 'chain', points: [{ ...p.pos }, ...chain.map((e) => ({ ...e.pos }))], color: beyond ? '#ffd84a' : color });
        chain.forEach((e, i) => {
          if (e.state !== 'dead' && this.spellHit(spell, slot, e, dmg * Math.pow(spell.fx.jumpFalloff!, i))) hits++;
        });
        return this.afterSpell(slot, hits);
      }
      case 'chains': {
        const at = this.aimPoint(range);
        this.events.push({ t: 'chains', x: at.x, y: at.y, r: radius, color });
        for (const e of this.live()) {
          if (dist(e.pos, at) > radius + e.def.radius) continue;
          if (!this.spellHit(spell, slot, e, dmg)) continue;
          hits++;
          e.rootUntil = this.time + (e.def.boss ? spell.fx.rootBossS! : spell.fx.rootS!);
          e.aggro = true;
        }
        return this.afterSpell(slot, hits);
      }
      case 'conjuredBlade': {
        const arc = (spell.fx.arcDeg! * Math.PI) / 180;
        this.events.push({ t: 'slash', x: p.pos.x, y: p.pos.y, dir: { ...p.facing }, range, arc, color: beyond ? '#ffd84a' : color });
        for (const e of this.live()) {
          const to = { x: e.pos.x - p.pos.x, y: e.pos.y - p.pos.y };
          const d = Math.hypot(to.x, to.y);
          if (d > range + e.def.radius || (d > 0.6 && angleBetween(to, p.facing) > arc / 2)) continue;
          if (this.spellHit(spell, slot, e, dmg)) hits++;
        }
        return this.afterSpell(slot, hits);
      }
      case 'repel': {
        this.events.push({ t: 'impact', x: p.pos.x, y: p.pos.y, r: radius, color: beyond ? '#ffd84a' : color });
        for (const e of this.live()) {
          const to = { x: e.pos.x - p.pos.x, y: e.pos.y - p.pos.y };
          if (Math.hypot(to.x, to.y) > radius + e.def.radius) continue;
          if (!this.spellHit(spell, slot, e, dmg)) continue;
          hits++;
          this.shove(e, normalize(to), spell.fx.pushM!);
          this.stunEnemy(e, spell.fx.stunS!);
        }
        return this.afterSpell(slot, hits);
      }
      case 'discord': {
        const aim = this.lastAim;
        const target = this.live()
          .filter((e) => !e.def.elite && dist(e.pos, p.pos) <= range && (e.revealed || !e.def.shadowed))
          .sort((a, b) => dist(a.pos, aim) - dist(b.pos, aim))[0];
        if (!target) {
          this.notice('Marca da Discórdia: nenhum inimigo comum ao alcance.', 'warn');
          return this.afterSpell(slot, 0);
        }
        target.charmedUntil = this.time + spell.fx.charmS!;
        target.aggro = true;
        target.state = 'chase';
        this.train(spell.id, 10, this.currentRisk(target));
        this.events.push({ t: 'mark', id: target.id, color });
        return this.afterSpell(slot, 1);
      }
    }
  }

  private castPoint(info: EffectiveInfo): void {
    const p = this.player;
    const fx = SPELLS.point.fx;
    p.pointUntil = this.time + fx.chargeS!;
    p.defenseZeroUntil = this.time + fx.defenseZeroS!;
    this.events.push({ t: 'pointCharge' });
    this.notice(`Ponto: o próximo golpe é um crítico (nível ${info.effective}). Defesa zero por 2 s.`, 'info');
  }

  private healPlayer(amount: number): void {
    const p = this.player;
    const before = p.hp;
    p.hp = Math.min(this.maxHp(), p.hp + amount);
    if (p.hp > before) this.events.push({ t: 'heal', amount: Math.round(p.hp - before) });
  }

  private hitEnemy(e: Enemy, raw: number, opts: { ignoreArmor: boolean; source: 'basic' | 'spell'; knock?: number; big?: boolean }): void {
    const p = this.player;
    if (e.evading) {
      this.events.push({ t: 'damage', x: e.pos.x, y: e.pos.y, amount: 0, target: 'enemy', id: e.id, immune: true, evade: true });
      return;
    }
    if (!e.def.boss) {
      if (e.state === 'idle' || e.state === 'return') this.startChase(e);
      e.provokedUntil = this.time + PROVOKE_S;
      this.alertPack(e, PROVOKE_S * 0.6);
    }
    let dmg = raw * TUNING.playerDamage;
    // Recuo: empurra para longe do jogador (elites resistem, o chefe não se move).
    if (opts.knock && !e.def.boss) {
      const away = normalize({ x: e.pos.x - p.pos.x, y: e.pos.y - p.pos.y });
      const k = opts.knock * TUNING.knockback * (e.def.elite ? SPELL_RULES.eliteKnockMult : 1);
      e.knock = { x: e.knock.x + away.x * k, y: e.knock.y + away.y * k };
    }
    let crit = false;
    let ignoreArmor = opts.ignoreArmor;
    const pointSlot = this.c.elos.find((s) => s.technique === 'point' && s.unlocked);
    // Ponto com "só contra elites": a carga espera um alvo de elite e não se gasta em comuns.
    const pointAllowed = !pointSlot?.restrictions.includes('eliteOnly') || e.def.elite;
    if (this.time < p.pointUntil && pointSlot && pointAllowed) {
      const info = this.slotInfo(pointSlot);
      const pm = this.c.mastery.point;
      const mods = pointSlot.mods;
      dmg *=
        (SPELLS.point.fx.critBase! + SPELLS.point.fx.critPerMastery! * displayLevel(pm)) *
        (0.7 + 0.3 * (info?.power ?? 1)) *
        (1 + 0.2 * (mods.damage ?? 0)) *
        sharpnessMult(pm.sharpness);
      crit = true;
      p.pointUntil = -1;
      if (mods.shatter) ignoreArmor = true;
      if (mods.stun) {
        e.stun = SPELL_RULES.stunModS;
        if (e.state === 'windup' || e.state === 'charging') e.state = 'stunned';
      }
      if (mods.restore) this.healPlayer(this.maxHp() * SPELL_RULES.restoreFrac);
      this.train('point', 8, this.currentRisk(e));
    }
    if (!ignoreArmor) dmg = Math.max(1, dmg * (1 - armorReduction(e.def.armor)));
    dmg = Math.round(dmg);
    e.hp -= dmg;
    e.hurtAgo = 0;
    e.aggro = true;
    if (e.def.boss) p.bossEngaged = true;
    this.events.push({
      t: 'damage',
      x: e.pos.x,
      y: e.pos.y,
      amount: dmg,
      target: 'enemy',
      id: e.id,
      crit,
      pierce: ignoreArmor && e.def.armor > 0,
      big: opts.big,
    });
    if (e.hp <= 0) this.killEnemy(e);
  }

  // -------------------------------------------------------------------------
  // Equipamento
  // -------------------------------------------------------------------------

  /** Criatura derrotada pode deixar um equipamento do tier da região (o chefe sempre, e melhor). */
  private dropGear(e: Enemy): void {
    const c = this.c;
    if (!this.rng.chance(ITEM_DROP_CHANCE[e.kind] ?? 0)) return;
    const pool = lootPool(this.map.tier);
    if (!pool.length) return;
    const quality = rollQuality(this.rng, e.def.boss ? 1.5 : e.def.elite ? 0.5 : 0);
    const item = rollItem(this.rng, this.rng.pick(pool), c.nextItemUid++, quality);
    const pos = { x: e.pos.x + this.rng.range(-0.4, 0.4), y: e.pos.y + this.rng.range(-0.4, 0.4) };
    this.itemDrops.push({ id: this.nextId++, item, pos, expiresAt: this.time + (e.def.boss ? 600 : 180) });
  }

  /** Motivo para não poder trocar de equipamento agora (ou null). */
  gearLock(): string | null {
    if (this.player.dead) return 'Você está caído.';
    if (this.time - this.player.lastCombatAt < 4 && !this.inSanctuary()) return 'Não dá para trocar de equipamento em combate.';
    return null;
  }

  /** Veste um item da mochila (o que estava no espaço volta para a mochila). */
  equipItem(uid: number): string | null {
    const c = this.c;
    const it = c.bag.find((x) => x.uid === uid);
    const d = it && itemDef(it);
    if (!it || !d) return 'Item não encontrado.';
    const lock = this.gearLock();
    if (lock) return lock;
    const need = itemMinLevel(d);
    if (c.level < need) return `Precisa do nível ${need}.`;
    const before = this.maxHp();
    c.bag = c.bag.filter((x) => x !== it);
    const old = c.equipment[d.slot];
    if (old) c.bag.push(old);
    c.equipment[d.slot] = it;
    this.afterGearChange(before);
    const res = resonanceState(it, c.psyche.values);
    if (res === 'aligned' || res === 'contrary')
      this.outbox.push({ t: 'notice', text: resonanceText(it, c.psyche.values)!, tone: res === 'aligned' ? 'good' : 'warn' });
    return null;
  }

  /** Itens dissonantes vestidos (contra os seus Valores). */
  dissonantGear(): number {
    return Object.values(this.c.equipment).filter((it) => it && resonanceState(it, this.c.psyche.values) === 'contrary').length;
  }

  /** Tira um item e guarda na mochila. */
  unequip(slot: Slot): string | null {
    const c = this.c;
    const it = c.equipment[slot];
    if (!it) return null;
    const lock = this.gearLock();
    if (lock) return lock;
    if (c.bag.length >= BAG_SIZE) return 'Mochila cheia.';
    const before = this.maxHp();
    delete c.equipment[slot];
    c.bag.push(it);
    this.afterGearChange(before);
    return null;
  }

  /** Joga fora um item da mochila (fica no chão por um tempo). */
  discardItem(uid: number): void {
    const c = this.c;
    const it = c.bag.find((x) => x.uid === uid);
    if (!it) return;
    c.bag = c.bag.filter((x) => x !== it);
    const p = this.player;
    // Cai um pouco atrás de você, para não ser pego de volta na hora.
    this.itemDrops.push({ id: this.nextId++, item: it, pos: { x: p.pos.x - p.facing.x * 1.6, y: p.pos.y - p.facing.y * 1.6 }, expiresAt: this.time + 120 });
  }

  private afterGearChange(hpBefore: number): void {
    const p = this.player;
    const hp = this.maxHp();
    // A vida acompanha a troca na mesma proporção (vestir não cura, tirar não mata).
    p.hp = clamp(Math.round((p.hp / hpBefore) * hp), 1, hp);
    p.flow = Math.min(p.flow, this.flowMax());
    this.mods = this.withGear(computeFlowMods(this.c.psyche, p.posture, p.tide.value));
  }

  private killEnemy(e: Enemy): void {
    const p = this.player;
    e.hp = 0;
    e.state = 'dead';
    e.respawnIn = e.summoned ? Infinity : e.def.respawn;
    this.events.push({ t: 'enemyDeath', id: e.id, x: e.pos.x, y: e.pos.y, boss: e.def.boss });
    e.charmedUntil = -1;
    e.rootUntil = -1;
    if (!e.summoned && this.rng.chance(SPELL_DROP_CHANCE[e.kind])) {
      // Prefere magias que o personagem ainda não conhece.
      const unknown = SPELL_IDS.filter((id) => !this.c.knownSpells.includes(id));
      const spell = this.rng.pick(unknown.length ? unknown : SPELL_IDS);
      this.drops.push({ id: this.nextId++, spell, pos: { ...e.pos }, expiresAt: this.time + (e.def.boss ? 600 : 120) });
      this.notice(`${e.def.name} deixou cair um grimório.`, 'good');
    }
    if (!e.summoned) this.dropGear(e);
    p.needs.fight = clamp(p.needs.fight + 0.12, 0, 1);
    this.gainXp(Math.round(e.def.xp * TUNING.xp * tierScale(this.map.tier).xp), true);
    p.killTimes = p.killTimes.filter((t) => this.time - t < 6);
    p.killTimes.push(this.time);
    if (e.def.boss) {
      p.bossEngaged = false;
      const first = !this.c.bossDefeated;
      this.c.bossDefeated = true;
      this.feel('killBoss');
      this.notice(first ? 'O Guardião da Ponte caiu! A passagem está aberta.' : 'O Guardião cai outra vez.', 'good');
      for (const lvl of refreshEloUnlocks(this.c)) this.notice(`Novo Elo liberado: nível ${lvl}`, 'good');
      // Juramento cumprido: alinhado a valor forte, não gera estresse.
    } else if (e.def.elite) {
      this.feel('killElite');
    } else if (p.killTimes.length >= 3) {
      p.killTimes = [];
      this.feel('killStreak');
    }
  }

  gainXp(amount: number, fromKill: boolean): void {
    const c = this.c;
    c.xp += amount;
    while (c.xp >= xpToNext(c.level)) {
      c.xp -= xpToNext(c.level);
      c.level += 1;
      this.player.hp = this.maxHp();
      this.events.push({ t: 'levelUp', level: c.level });
      this.notice(`Nível ${c.level}!`, 'good');
      for (const lvl of refreshEloUnlocks(c)) this.notice(`Novo Elo liberado: nível ${lvl}. Configure-o no santuário (K).`, 'good');
    }
    void fromKill;
  }

  damagePlayer(raw: number, opts: { heavy: boolean; source?: Enemy }): void {
    const p = this.player;
    if (p.dead || this.inSanctuary()) return;
    const def = POSTURES[p.posture];
    const m = this.mods;
    // A Guarda (armaduras) absorve parte do golpe sempre, mesmo em defesa zero.
    let mult = def.incomingMult * m.incoming * (1 - this.stats().guard);
    const defenseZero = this.time < p.defenseZeroUntil;
    let perfect = false;
    if (defenseZero) {
      // Defesa zero: sem o Véu e sem a Maré (o Ponto pôs todo o Fluxo no golpe).
    } else {
      const veilBonus = tideLevel(p.tide.value) < 0 ? 0.005 * (displayLevel(this.c.mastery.veil) - 1) : 0;
      mult *= 1 - veilBonus;
      if (tideLevel(p.tide.value) < 0) mult *= 1 - this.stats().veil;
      mult *= tideIncoming(p.tide.value);
      if (opts.heavy && p.tide.value <= 0.3 && this.time - p.tide.lastDefenseShiftAt <= 1.0) {
        perfect = true;
        mult *= 0.5;
      }
    }
    const dmg = Math.max(1, Math.round(raw * mult * TUNING.enemyDamage));
    p.hp -= dmg;
    p.lastHitTakenAt = this.time;
    p.lastCombatAt = this.time;
    this.events.push({ t: 'damage', x: p.pos.x, y: p.pos.y, amount: dmg, target: 'player' });
    if (tideLevel(p.tide.value) < 0 && !defenseZero) this.train('veil', Math.max(1, raw - dmg) * 0.3, this.currentRisk(opts.source));
    if (perfect) {
      this.events.push({ t: 'perfectTide', x: p.pos.x, y: p.pos.y });
      this.notice('Maré perfeita!', 'good');
      this.feel('perfectTide');
      this.train('tide', 20, this.currentRisk(opts.source));
    }
    if (dmg >= this.maxHp() * 0.15) this.feel('heavyHit', Math.min(2, dmg / (this.maxHp() * 0.3)));
    if (p.hp <= 0) this.killPlayer();
  }

  /** Passou pelo Eco: o XP volta, e os itens voltam ao corpo (se o espaço está livre) ou à mochila. */
  private recoverEcho(echo: Echo): void {
    const c = this.c;
    const hpBefore = this.maxHp();
    if (echo.xpBack > 0) this.gainXp(echo.xpBack, false);
    const back: string[] = [];
    const left: Echo['items'] = [];
    for (const x of echo.items) {
      if (x.slot && !c.equipment[x.slot]) c.equipment[x.slot] = x.item;
      else if (c.bag.length < BAG_SIZE) c.bag.push(x.item);
      else {
        left.push(x);
        continue;
      }
      back.push(itemName(x.item));
    }
    if (back.length) this.afterGearChange(hpBefore);
    const xp = echo.xpBack > 0 ? `+${echo.xpBack} XP` : '';
    this.notice(`Eco recuperado: ${[xp, ...back].filter(Boolean).join(', ') || 'nada a recuperar'}.`, 'good');
    this.events.push({ t: 'echoRecovered', x: echo.pos.x, y: echo.pos.y });
    if (left.length) {
      // Mochila cheia: o resto espera no Eco.
      c.echo = { ...echo, xpBack: 0, items: left };
      this.notice(`Mochila cheia: ${left.length} item(ns) ainda no Eco.`, 'warn');
    } else c.echo = null;
  }

  private killPlayer(): void {
    const p = this.player;
    const c = this.c;
    p.hp = 0;
    p.dead = true;
    p.respawnIn = 3;
    c.deaths += 1;
    p.bossEngaged = false;
    this.events.push({ t: 'playerDeath', x: p.pos.x, y: p.pos.y });

    // Penalidade por níveis, estilo Tibia.
    if (this.playTime - c.lastDeathAt < PENALTY_WINDOW_S) c.penaltyLevel = Math.min(PENALTY_MAX, c.penaltyLevel + 1);
    const oathBroken = c.elos.some((s) => s.unlocked && s.technique && s.restrictions.includes('bloodOath'));
    if (oathBroken) c.penaltyLevel = Math.min(PENALTY_MAX, c.penaltyLevel + 2);
    c.lastDeathAt = this.playTime;
    c.penaltyClock = 0;
    const row = DEATH_PENALTY[c.penaltyLevel]!;
    const xpLoss = Math.round(xpToNext(c.level) * row.xpLoss);
    c.xp -= xpLoss;
    while (c.xp < 0 && c.level > 1) {
      c.level -= 1;
      c.xp += xpToNext(c.level);
    }
    c.xp = Math.max(0, c.xp);
    for (const slot of c.elos) if (slot.technique) deathPenalty(c.mastery[slot.technique as MasteryId], row.masteryLoss);
    deathPenalty(c.mastery.basic, row.masteryLoss);
    // Morrer de novo antes de recuperar o Eco anterior: ele se desfaz, com o que tinha.
    const old = c.echo;
    if (old?.items.length) this.notice(`Seu Eco anterior se desfez, e com ele: ${old.items.map((x) => itemName(x.item)).join(', ')}.`, 'bad');
    // Cada equipamento (vestido ou na mochila) pode cair no Eco, pela penalidade.
    const fallen: Echo['items'] = [];
    for (const slot of SLOTS) {
      const it = c.equipment[slot];
      if (it && this.rng.chance(row.itemDrop)) {
        delete c.equipment[slot];
        fallen.push({ item: it, slot });
      }
    }
    c.bag = c.bag.filter((it) => {
      if (!this.rng.chance(row.itemDrop)) return true;
      fallen.push({ item: it });
      return false;
    });
    c.echo = { region: this.map.id, pos: { ...p.pos }, xpBack: Math.round(xpLoss / 2), expiresAt: this.playTime + ECHO_LIFE_S, items: fallen };
    this.notice(`Você caiu. Penalidade ${c.penaltyLevel} (${row.mult}x): -${xpLoss} XP. Seu Eco ficou onde você caiu.`, 'bad');
    if (fallen.length)
      this.notice(`Caíram no seu Eco: ${fallen.map((x) => itemName(x.item)).join(', ')}. Volte lá em até 30 min de jogo para recuperar.`, 'warn');
    this.feel('death');
    if (oathBroken) {
      this.feel('pactBroken');
      this.notice('Juramento de sangue quebrado: a penalidade de morte subiu 2 níveis extras.', 'bad');
    }
    const boss = this.boss();
    if (boss && boss.state !== 'dead') this.resetEnemy(boss);
  }

  private respawn(): void {
    const p = this.player;
    this.projectiles = [];
    p.dead = false;
    p.pos = { ...this.map.playerStart };
    p.hp = this.maxHp();
    p.flow = this.flowMax() * 0.5;
    p.posture = 'open';
    p.tide = createTide();
    p.defenseZeroUntil = -1;
    p.pointUntil = -1;
    this.events.push({ t: 'respawn' });
  }

  // -------------------------------------------------------------------------
  // Inimigos
  // -------------------------------------------------------------------------

  spawn(kind: EnemyKind, pos: Vec2, summoned = false): Enemy {
    const def = ENEMIES[kind];
    const e: Enemy = {
      id: this.nextId++,
      kind,
      def,
      pos: { ...pos },
      home: { ...pos },
      facing: { x: -1, y: 0 },
      hp: def.hp * TUNING.enemyHp * tierScale(this.map.tier).hp,
      maxHp: def.hp * TUNING.enemyHp * tierScale(this.map.tier).hp,
      power: tierScale(this.map.tier).power,
      windupTotal: 0,
      knock: { x: 0, y: 0 },
      state: 'idle',
      timer: 0,
      attack: null,
      attackTarget: { ...pos },
      cooldowns: {},
      aggro: summoned,
      revealed: !def.shadowed,
      stun: 0,
      respawnIn: 0,
      signatureHits: 0,
      phase: 1,
      summoned,
      hurtAgo: 99,
      rootUntil: -1,
      charmedUntil: -1,
      provokedUntil: -1,
      evading: false,
      stuck: 0,
      bestDist: Infinity,
    };
    this.enemies.push(e);
    return e;
  }

  private resetEnemy(e: Enemy): void {
    e.maxHp = e.def.hp * TUNING.enemyHp * tierScale(this.map.tier).hp;
    e.hp = e.maxHp;
    e.aggro = false;
    e.state = 'return';
    e.phase = 1;
    e.signatureHits = 0;
    if (e.def.boss) {
      // Some com os servos invocados.
      this.enemies = this.enemies.filter((x) => !x.summoned);
    }
  }

  private canSee(e: Enemy): boolean {
    const p = this.player;
    if (p.dead || this.inSanctuary()) return false;
    const d = dist(e.pos, p.pos);
    if (e.def.boss) return p.bossEngaged;
    if (e.evading) return false;
    // Atingido: sabe de onde veio o golpe e vem atrás, mesmo de longe.
    if (this.time < e.provokedUntil) return true;
    if (p.posture === 'silence' && !e.def.elite) {
      // Quem já te viu não é enganado: só te perde se você se afastar bastante.
      if (e.aggro) return d < e.def.aggroRadius * 1.5;
      return d < this.stealthRadius(e);
    }
    return d < e.def.aggroRadius || (e.aggro && d < e.def.aggroRadius * 2);
  }

  /** Até onde um inimigo comum percebe você em Silêncio: encolhe com a Maestria do Silêncio. */
  stealthRadius(e: Enemy): number {
    const lvl = displayLevel(this.c.mastery.silence);
    return Math.max(1.2, e.def.aggroRadius * (0.6 - 0.02 * (lvl - 1)));
  }

  private updateEnemies(dt: number): void {
    const p = this.player;
    const gazing = p.posture === 'gaze' && !p.dead;
    for (const e of this.enemies) {
      e.hurtAgo += dt;
      for (const k of Object.keys(e.cooldowns)) e.cooldowns[k] = (e.cooldowns[k] ?? 0) - dt;

      if (e.state === 'dead') {
        e.respawnIn -= dt;
        if (e.respawnIn <= 0 && dist(e.home, p.pos) > 14) {
          const maxHp = e.def.hp * TUNING.enemyHp * tierScale(this.map.tier).hp;
          Object.assign(e, { hp: maxHp, maxHp, state: 'idle', pos: { ...e.home }, aggro: false, signatureHits: 0, phase: 1 });
        }
        continue;
      }

      // Recuo do último golpe recebido.
      if (Math.abs(e.knock.x) + Math.abs(e.knock.y) > 0.05) {
        moveWithCollision(this.map, e.pos, e.knock.x * dt, e.knock.y * dt, Math.min(0.45, e.def.radius * 0.6));
        const decay = Math.exp(-12 * dt);
        e.knock.x *= decay;
        e.knock.y *= decay;
        if (inCircle(this.map.sanctuary, e.pos, 1)) e.knock = { x: 0, y: 0 };
      }

      // Sombra: revelado pelo Olhar ou muito perto.
      if (e.def.shadowed) {
        const was = e.revealed;
        e.revealed = (gazing && dist(e.pos, p.pos) < 14) || dist(e.pos, p.pos) < 1.8 || e.hurtAgo < 1.5;
        if (!was && e.revealed && gazing) this.train('gaze', 4, this.currentRisk(e));
      }

      if (e.stun > 0) {
        e.stun -= dt;
        if (e.stun <= 0 && e.state === 'stunned') e.state = 'chase';
        continue;
      }

      if (this.time < e.charmedUntil) {
        this.updateCharmed(e, dt);
        continue;
      }

      // Fase 2 do chefe.
      if (e.def.boss && e.phase === 1 && e.hp < e.maxHp * 0.5) {
        e.phase = 2;
        this.notice('O Guardião ruge e chama seus servos!', 'warn');
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2;
          this.spawn('grunt', { x: e.pos.x + Math.cos(a) * 3, y: e.pos.y + Math.sin(a) * 3 }, true);
        }
      }

      const sees = this.canSee(e);
      if (sees) e.aggro = true;
      const toPlayer = { x: p.pos.x - e.pos.x, y: p.pos.y - e.pos.y };
      const d = Math.hypot(toPlayer.x, toPlayer.y);
      const speedMul = e.phase === 2 ? 1.15 : 1;

      switch (e.state) {
        case 'idle':
          if (sees) {
            this.startChase(e);
            this.alertPack(e, 5);
          }
          break;
        case 'return': {
          const back = { x: e.home.x - e.pos.x, y: e.home.y - e.pos.y };
          if (Math.hypot(back.x, back.y) < 0.5) {
            e.state = 'idle';
            e.hp = e.maxHp;
            e.evading = false;
          } else this.moveEnemy(e, this.pathDir(e.pos, e.home), e.def.speed * (e.evading ? 1.8 : 1.3) * dt);
          // Recuando cura aos poucos; quem está recuando não volta a perseguir até chegar.
          if (e.evading) {
            e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.25 * dt);
            e.stuck += dt;
            // Salvaguarda: se não acha o caminho de casa, reaparece lá.
            if (e.stuck > 12) {
              e.pos = { ...e.home };
              e.knock = { x: 0, y: 0 };
            }
          }
          else if (sees && !e.def.boss) this.startChase(e);
          break;
        }
        case 'chase': {
          if (!sees || p.dead) {
            e.aggro = false;
            e.state = 'return';
            break;
          }
          // Coleira: puxado longe demais de casa, desiste e recua.
          if (!e.def.boss && dist(e.pos, e.home) > LEASH) {
            this.evade(e);
            break;
          }
          // Sem caminho até o alvo (outro lado do desfiladeiro, alto de um penhasco) ou sem
          // conseguir se aproximar: recua em vez de ficar parado levando tiro.
          if (d < e.bestDist - 0.4) {
            e.bestDist = d;
            e.stuck = 0;
          } else if (d > e.def.radius + 2.5) {
            e.stuck += dt * (this.pathReachable(e.pos, p.pos) ? 1 : 2.5);
          }
          if (!e.def.boss && e.stuck > 4) {
            this.evade(e);
            break;
          }
          const atk = this.chooseAttack(e, d);
          if (atk) {
            e.attack = atk;
            e.state = 'windup';
            const windup = atk.windup * (e.phase === 2 ? 0.85 : 1) * TUNING.enemyWindup;
            e.timer = windup;
            e.windupTotal = windup;
            e.facing = normalize(toPlayer);
            e.attackTarget = atk.type === 'slam' ? { ...p.pos } : { x: e.pos.x + e.facing.x * atk.range, y: e.pos.y + e.facing.y * atk.range };
            if (atk.type === 'slam')
              this.events.push({ t: 'telegraph', x: e.attackTarget.x, y: e.attackTarget.y, r: atk.radius, duration: windup, heavy: atk.heavy });
            else if (atk.type === 'charge')
              this.events.push({ t: 'telegraph', x: e.attackTarget.x, y: e.attackTarget.y, r: atk.radius, duration: windup, heavy: false });
            else if (atk.type === 'shot')
              this.events.push({ t: 'telegraphLine', x: e.pos.x, y: e.pos.y, dir: { ...e.facing }, length: atk.range, width: 0.7, duration: windup });
            else if (e.def.elite)
              this.events.push({ t: 'telegraphArc', x: e.pos.x, y: e.pos.y, dir: { ...e.facing }, range: atk.range + e.def.radius * 0.5, arc: (140 * Math.PI) / 180, duration: windup });
          } else if (e.kind === 'slinger') {
            // Atirador: mantém 5–8 m, recua se você chega perto, aproxima-se se não tem linha de tiro.
            e.facing = normalize(toPlayer);
            const lineOfFire = this.clearShot(e.pos, p.pos);
            if (d < 4.5 && lineOfFire) {
              // Recua direto para longe (desliza em paredes); encurralado, tenta de lado.
              const away = normalize({ x: -toPlayer.x, y: -toPlayer.y });
              const before = { ...e.pos };
              this.moveEnemy(e, away, e.def.speed * 1.05 * dt);
              if (dist(before, e.pos) < 0.01) this.moveEnemy(e, { x: -away.y, y: away.x }, e.def.speed * dt);
            } else if (d > 8 || !lineOfFire) {
              this.moveEnemy(e, this.pathDir(e.pos, p.pos), e.def.speed * dt);
            }
          } else if (d > e.def.radius + 0.9) {
            e.facing = normalize(toPlayer);
            this.moveEnemy(e, this.pathDir(e.pos, p.pos), e.def.speed * speedMul * dt);
          }
          break;
        }
        case 'windup':
          e.timer -= dt;
          if (e.attack?.type === 'melee' && !e.def.elite) e.facing = normalize(toPlayer);
          if (e.timer <= 0) this.executeAttack(e);
          break;
        case 'charging': {
          e.timer -= dt;
          const step = 13 * dt;
          this.moveEnemy(e, e.facing, step);
          if (!p.dead && dist(e.pos, p.pos) < e.def.radius + 0.6 && e.attack) {
            this.damagePlayer(e.attack.damage * e.power, { heavy: false, source: e });
            e.timer = 0;
          }
          if (e.timer <= 0) {
            e.state = 'recover';
            e.timer = e.attack?.recover ?? 0.8;
          }
          break;
        }
        case 'recover':
          e.timer -= dt;
          if (e.timer <= 0) e.state = 'chase';
          break;
        case 'stunned':
          e.state = 'chase';
          break;
      }
    }
    this.separateEnemies();
  }

  /** Projéteis voam em linha reta; árvores, rochas e penhascos bloqueiam (a água não). */
  private updateProjectiles(dt: number): void {
    const p = this.player;
    this.projectiles = this.projectiles.filter((pr) => {
      const step = pr.speed * dt;
      const n = Math.ceil(step / 0.25);
      for (let i = 0; i < n; i++) {
        pr.pos.x += (pr.dir.x * step) / n;
        pr.pos.y += (pr.dir.y * step) / n;
        pr.left -= step / n;
        const t = this.map.tiles[Math.floor(pr.pos.y) * this.map.w + Math.floor(pr.pos.x)];
        if (pr.left <= 0 || t === undefined || ((t === 1 || t === 2 || t === 8) && true)) return false;
        if (!p.dead && dist(pr.pos, p.pos) < 0.6) {
          const owner = this.enemies.find((e) => e.id === pr.owner);
          this.damagePlayer(pr.damage, { heavy: false, source: owner });
          return false;
        }
      }
      return true;
    });
  }

  /** Linha de tiro livre (para quem atira): árvores, rochas e penhascos bloqueiam. */
  private clearShot(a: Vec2, b: Vec2): boolean {
    const d = dist(a, b);
    const n = Math.ceil(d / 0.4);
    for (let i = 1; i < n; i++) {
      const x = a.x + ((b.x - a.x) * i) / n;
      const y = a.y + ((b.y - a.y) * i) / n;
      const t = this.map.tiles[Math.floor(y) * this.map.w + Math.floor(x)];
      if (t === 1 || t === 2 || t === 8) return false;
    }
    return true;
  }

  /** Começa uma perseguição do zero. */
  private startChase(e: Enemy): void {
    e.state = 'chase';
    e.aggro = true;
    e.stuck = 0;
    e.bestDist = dist(e.pos, this.player.pos);
  }

  /** Avisa os vizinhos: a matilha vem junto. */
  private alertPack(e: Enemy, seconds: number): void {
    for (const o of this.enemies) {
      if (o === e || o.state === 'dead' || o.def.boss || o.evading || this.time < o.charmedUntil) continue;
      if (dist(o.pos, e.pos) > PACK_RADIUS) continue;
      o.provokedUntil = Math.max(o.provokedUntil, this.time + seconds);
      if (o.state === 'idle' || o.state === 'return') this.startChase(o);
    }
  }

  /** Desiste da luta: recua para casa imune e volta com a vida cheia. */
  private evade(e: Enemy): void {
    e.evading = true;
    e.aggro = false;
    e.provokedUntil = -1;
    e.stuck = 0;
    e.bestDist = Infinity;
    e.state = 'return';
    this.events.push({ t: 'damage', x: e.pos.x, y: e.pos.y, amount: 0, target: 'enemy', id: e.id, immune: true, evade: true });
  }

  /** Existe caminho a pé de um ponto ao outro? */
  pathReachable(from: Vec2, to: Vec2): boolean {
    if (this.clearLine(from, to)) return true;
    const field = this.distField(to);
    const m = this.map;
    const i = Math.max(0, Math.min(m.h - 1, Math.floor(from.y))) * m.w + Math.max(0, Math.min(m.w - 1, Math.floor(from.x)));
    return field[i]! >= 0;
  }

  /** Marca da Discórdia: o inimigo ataca o aliado mais próximo. */
  private updateCharmed(e: Enemy, dt: number): void {
    const foe = this.live()
      .filter((x) => x !== e && this.time >= x.charmedUntil && dist(x.pos, e.pos) < SPELLS.discord.fx.charmSeekM!)
      .sort((a, b) => dist(a.pos, e.pos) - dist(b.pos, e.pos))[0];
    const atk = e.def.attacks.find((a) => a.type === 'melee')!;
    if (!foe) {
      e.state = 'idle';
      return;
    }
    const to = { x: foe.pos.x - e.pos.x, y: foe.pos.y - e.pos.y };
    const d = Math.hypot(to.x, to.y);
    e.facing = normalize(to);
    if (e.state === 'windup') {
      e.timer -= dt;
      if (e.timer <= 0) {
        this.events.push({ t: 'enemySwing', id: e.id, dir: { ...e.facing }, range: atk.range });
        if (d <= atk.range + foe.def.radius + 0.3) {
          const dmg = Math.max(1, Math.round(atk.damage * SPELLS.discord.fx.charmDamageMult! * (1 - armorReduction(foe.def.armor))));
          foe.hp -= dmg;
          foe.hurtAgo = 0;
          this.events.push({ t: 'damage', x: foe.pos.x, y: foe.pos.y, amount: dmg, target: 'enemy', id: foe.id });
          if (foe.hp <= 0) this.killEnemy(foe);
        }
        e.state = 'recover';
        e.timer = atk.recover;
      }
    } else if (e.state === 'recover') {
      e.timer -= dt;
      if (e.timer <= 0) e.state = 'chase';
    } else if (d <= atk.range + foe.def.radius * 0.5 && (e.cooldowns[atk.id] ?? 0) <= 0) {
      e.cooldowns[atk.id] = atk.cooldown;
      e.state = 'windup';
      e.timer = atk.windup * TUNING.enemyWindup;
      e.windupTotal = e.timer;
    } else {
      e.state = 'chase';
      this.moveEnemy(e, this.pathDir(e.pos, foe.pos), e.def.speed * dt);
    }
  }

  private acquireSpell(spell: SpellId, at: Vec2, source: string): void {
    const s = SPELLS[spell];
    if (learnSpell(this.c, spell)) {
      this.events.push({ t: 'learn', spell, x: at.x, y: at.y });
      this.notice(`${source}: você aprendeu ${s.name} (${s.role}, ${AFFINITY_NAMES[s.affinity]}). Equipe no santuário (K).`, 'good');
    } else {
      this.train(spell, 30, 1);
      this.notice(`${source}: você já conhece ${s.name}. A leitura aprofunda sua Maestria.`, 'info');
    }
  }

  private chooseAttack(e: Enemy, d: number): AttackDef | null {
    const ready = e.def.attacks.filter((a) => (e.cooldowns[a.id] ?? 0) <= 0);
    // Pesados primeiro (mais interessantes), depois investida à distância, depois corpo a corpo.
    const slam = ready.find((a) => a.type === 'slam' && d < a.range && d > 1.2);
    if (slam && this.rng.chance(e.def.boss ? 0.5 : 0.35)) return this.arm(e, slam);
    const charge = ready.find((a) => a.type === 'charge' && d > 5 && d < a.range);
    if (charge) return this.arm(e, charge);
    const shot = ready.find((a) => a.type === 'shot' && d < a.range && d > 2.5 && this.clearShot(e.pos, this.player.pos));
    if (shot) return this.arm(e, shot);
    const m = ready.find((a) => a.type === 'melee' && d < a.range + e.def.radius * 0.5);
    if (m) return this.arm(e, m);
    return null;
  }

  private arm(e: Enemy, a: AttackDef): AttackDef {
    e.cooldowns[a.id] = a.cooldown;
    return a;
  }

  private executeAttack(e: Enemy): void {
    const p = this.player;
    const a = e.attack;
    if (!a) return;
    if (a.type === 'charge') {
      e.state = 'charging';
      e.timer = 0.6;
      return;
    }
    if (a.type === 'shot') {
      // Dispara na direção travada no começo do preparo: quem se moveu de lado escapa.
      this.projectiles.push({
        id: this.nextId++,
        pos: { x: e.pos.x + e.facing.x * 0.6, y: e.pos.y + e.facing.y * 0.6 },
        dir: { ...e.facing },
        speed: 15,
        left: a.range + 1,
        damage: a.damage * e.power,
        owner: e.id,
      });
      this.events.push({ t: 'shot', x: e.pos.x, y: e.pos.y });
      e.state = 'recover';
      e.timer = a.recover;
      return;
    }
    if (a.type === 'slam') {
      this.events.push({ t: 'quake', x: e.attackTarget.x, y: e.attackTarget.y, r: a.radius });
      if (!p.dead && dist(p.pos, e.attackTarget) <= a.radius + 0.3) this.damagePlayer(a.damage * e.power, { heavy: a.heavy, source: e });
    } else {
      this.events.push({ t: 'enemySwing', id: e.id, dir: { ...e.facing }, range: a.range });
      const to = { x: p.pos.x - e.pos.x, y: p.pos.y - e.pos.y };
      const d = Math.hypot(to.x, to.y);
      if (!p.dead && d <= a.range + 0.35 + e.def.radius * 0.5 && angleBetween(to, e.facing) < (70 * Math.PI) / 180)
        this.damagePlayer(a.damage * e.power, { heavy: a.heavy, source: e });
    }
    e.state = 'recover';
    e.timer = a.recover;
  }

  // -------------------------------------------------------------------------
  // Caminhos: com penhascos, ninguém pode andar só em linha reta.
  // -------------------------------------------------------------------------

  private fields = new Map<number, { at: number; dist: Int32Array }>();

  /** Distância em passos (BFS, 8 vizinhos) de cada tile livre até o tile do alvo. */
  private distField(to: Vec2): Int32Array {
    const m = this.map;
    const tx = Math.max(0, Math.min(m.w - 1, Math.floor(to.x)));
    const ty = Math.max(0, Math.min(m.h - 1, Math.floor(to.y)));
    const key = ty * m.w + tx;
    const hit = this.fields.get(key);
    if (hit && this.time - hit.at < 0.5) return hit.dist;
    if (this.fields.size > 16) this.fields.clear();
    const dist = new Int32Array(m.w * m.h).fill(-1);
    const free = (x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h && !isBlocked(m, x + 0.5, y + 0.5);
    const q = new Int32Array(m.w * m.h);
    let head = 0;
    let tail = 0;
    dist[key] = 0;
    q[tail++] = key;
    while (head < tail) {
      const i = q[head++]!;
      const x = i % m.w;
      const y = (i / m.w) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (!free(nx, ny)) continue;
          // Diagonal só se as duas laterais estiverem livres (não corta quina de penhasco).
          if (dx && dy && (!free(x + dx, y) || !free(x, y + dy))) continue;
          const j = ny * m.w + nx;
          if (dist[j] !== -1) continue;
          dist[j] = dist[i]! + 1;
          q[tail++] = j;
        }
    }
    this.fields.set(key, { at: this.time, dist });
    return dist;
  }

  /** Há caminho livre em linha reta entre dois pontos? */
  private clearLine(a: Vec2, b: Vec2): boolean {
    const d = dist(a, b);
    const n = Math.ceil(d / 0.4);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (isBlocked(this.map, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false;
    }
    return true;
  }

  /** Direção para ir de `from` até `to`, contornando penhascos, árvores e água. */
  pathDir(from: Vec2, to: Vec2): Vec2 {
    if (this.clearLine(from, to)) return normalize({ x: to.x - from.x, y: to.y - from.y });
    const m = this.map;
    const field = this.distField(to);
    const fx = Math.floor(from.x);
    const fy = Math.floor(from.y);
    let best: Vec2 | null = null;
    let bestD = Infinity;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = fx + dx;
        const ny = fy + dy;
        if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
        const d = field[ny * m.w + nx]!;
        if (d < 0 || d >= bestD) continue;
        if (dx && dy && (isBlocked(m, fx + dx + 0.5, fy + 0.5) || isBlocked(m, fx + 0.5, fy + dy + 0.5))) continue;
        bestD = d;
        best = { x: nx + 0.5, y: ny + 0.5 };
      }
    if (!best) return normalize({ x: to.x - from.x, y: to.y - from.y });
    return normalize({ x: best.x - from.x, y: best.y - from.y });
  }

  private moveEnemy(e: Enemy, dir: Vec2, step: number): void {
    if (this.time < e.rootUntil) return; // preso por Correntes
    const before = { ...e.pos };
    step *= TUNING.enemySpeed;
    moveWithCollision(this.map, e.pos, dir.x * step, dir.y * step, Math.min(0.45, e.def.radius * 0.6));
    // Inimigos não entram no santuário; o chefe não sai da arena.
    const arena = this.map.arena;
    if (inCircle(this.map.sanctuary, e.pos, 1) || (e.def.boss && arena && !inCircle(arena, e.pos, 0))) e.pos = before;
  }

  private separateEnemies(): void {
    const live = this.enemies.filter((e) => e.state !== 'dead');
    // Colisão de corpo: o jogador não atravessa inimigos (os inimigos são mais pesados).
    const p = this.player;
    if (!p.dead) {
      for (const e of live) {
        if (e.def.shadowed && !e.revealed) continue;
        const dx = p.pos.x - e.pos.x;
        const dy = p.pos.y - e.pos.y;
        const d = Math.hypot(dx, dy);
        const min = e.def.radius + 0.35;
        if (d >= min) continue;
        const n = d > 0.001 ? { x: dx / d, y: dy / d } : { x: -p.facing.x, y: -p.facing.y };
        const push = min - d;
        const heavy = e.def.boss || e.def.elite ? 1 : 0.7;
        moveWithCollision(this.map, p.pos, n.x * push * heavy, n.y * push * heavy, 0.35);
        if (heavy < 1) moveWithCollision(this.map, e.pos, -n.x * push * (1 - heavy), -n.y * push * (1 - heavy), Math.min(0.45, e.def.radius * 0.6));
      }
    }
    for (let i = 0; i < live.length; i++)
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i]!;
        const b = live[j]!;
        const dx = b.pos.x - a.pos.x;
        const dy = b.pos.y - a.pos.y;
        const d = Math.hypot(dx, dy);
        const min = a.def.radius + b.def.radius;
        if (d > 0.001 && d < min) {
          const push = (min - d) / 2;
          const nx = dx / d;
          const ny = dy / d;
          moveWithCollision(this.map, a.pos, -nx * push, -ny * push, 0.3);
          moveWithCollision(this.map, b.pos, nx * push, ny * push, 0.3);
        }
      }
  }

  // -------------------------------------------------------------------------
  // Armadilhas e progresso
  // -------------------------------------------------------------------------

  private updateTraps(dt: number): void {
    const p = this.player;
    const gazing = p.posture === 'gaze' && !p.dead;
    for (const t of this.traps) {
      if (!t.armed) {
        t.rearmIn -= dt;
        if (t.rearmIn <= 0) t.armed = true;
        continue;
      }
      const d = dist(t.pos, p.pos);
      const was = t.revealed;
      t.revealed = gazing && d < 12;
      if (!was && t.revealed) this.train('gaze', 2, 1);
      if (!p.dead && d < 0.75) {
        t.armed = false;
        t.rearmIn = 60;
        this.events.push({ t: 'trap', x: t.pos.x, y: t.pos.y });
        this.notice('Armadilha oculta!', 'bad');
        p.slowUntil = this.time + 1.5;
        this.damagePlayer(18, { heavy: false });
      }
    }
  }

  private updateProgress(dt: number): void {
    const c = this.c;
    // Penalidade desce 1 nível a cada 2 h jogadas sem morrer.
    c.penaltyClock += dt;
    if (c.penaltyLevel > 0 && c.penaltyClock >= PENALTY_WINDOW_S) {
      c.penaltyLevel -= 1;
      c.penaltyClock = 0;
      this.notice('Sua penalidade de morte diminuiu.', 'good');
    }
    // Desuso (tempo jogado). Acima da capacidade, as outras esquecem mais rápido.
    const over = totalMastery(Object.values(c.mastery)) > MASTERY_CAPACITY;
    for (const r of Object.values(c.mastery)) decay(r, dt, this.playTime, c.psyche.traits, over);
    // Vida nunca acima do máximo (Pacto de vida).
    this.player.hp = Math.min(this.player.hp, this.maxHp());
  }
}
