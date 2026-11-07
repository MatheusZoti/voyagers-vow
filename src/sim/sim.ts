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
import { equipError, evaluateSlot, PACTS, type EffectiveInfo, type EloSlot } from './elos';
import { AFFINITY_COLORS, AFFINITY_NAMES } from './flow/affinity';
import {
  BASE_FLOW_MAX,
  BASE_FLOW_REGEN,
  computeFlowMods,
  createTide,
  POSTURES,
  shiftTide,
  tickTide,
  tideIncoming,
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
  SPELLS,
  TECHNIQUES,
  type MasteryId,
  type SpellDef,
  type SpellId,
  type TechniqueId,
} from './techniques';
import { ENEMIES, SPELL_DROP_CHANCE, type AttackDef, type Echo, type Enemy, type EnemyKind, type SpellDrop, type Trap } from './world/entities';
import { buildMap, inCircle, isBlocked, moveWithCollision, type GameMap } from './world/map';

export const TICK = 1 / 30;

export interface PlayerInput {
  /** direção de movimento no plano do mundo (não precisa ser normalizada) */
  move: Vec2;
  /** ponto do mundo sob o cursor */
  aim: Vec2;
  basic: boolean;
  /** nível do Elo a ativar neste tick */
  useSlot: number | null;
  posture: Posture | null;
  tideSteps: number;
}

export const emptyInput = (): PlayerInput => ({ move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, basic: false, useSlot: null, posture: null, tideSteps: 0 });

export type NoticeTone = 'info' | 'good' | 'bad' | 'warn' | 'memory' | 'crisis';

export type SimEvent =
  | { t: 'damage'; x: number; y: number; amount: number; target: 'enemy' | 'player'; id?: number; crit?: boolean; pierce?: boolean; immune?: boolean }
  | { t: 'swing'; x: number; y: number; dir: Vec2; range: number }
  | { t: 'signature'; from: Vec2; to: Vec2; radius: number; beyond: boolean }
  | { t: 'pointCharge' }
  | { t: 'telegraph'; x: number; y: number; r: number; duration: number; heavy: boolean }
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
  | { t: 'dialogue'; id: DialogueId }
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
  bossEngaged: boolean;
}

export class Simulation {
  readonly map: GameMap;
  readonly c: Character;
  readonly player: PlayerState;
  enemies: Enemy[] = [];
  traps: Trap[];
  echo: Echo | null = null;
  drops: SpellDrop[] = [];
  events: SimEvent[] = [];
  mods: FlowMods;
  /** tempo desta sessão (s) */
  time = 0;
  private rng: Rng;
  private nextId = 1;
  private impetusAcc = 0;
  /** efeitos com atraso (ex.: Chuva de Esferas) */
  private pending: Array<{ at: number; run: () => void }> = [];
  /** último ponto mirado (para magias que miram no chão) */
  lastAim: Vec2 = { x: 0, y: 0 };
  private wasInSanctuary = true;
  private bridgePrompted = false;

  constructor(character: Character, seed = 99) {
    this.c = character;
    this.rng = new Rng(seed);
    this.map = buildMap();
    const start = this.map.playerStart;
    this.player = {
      pos: { ...start },
      facing: { x: 1, y: 0 },
      hp: maxHpFor(character),
      flow: this.flowMax(),
      posture: 'veil',
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
      bossEngaged: false,
    };
    for (const s of this.map.spawns) this.spawn(s.kind, { x: s.x + 0.5, y: s.y + 0.5 });
    this.spawn('boss', { ...this.map.bossSpawn });
    this.traps = this.map.traps.map((p) => ({ pos: { ...p }, armed: true, revealed: false, rearmIn: 0 }));
    this.mods = computeFlowMods(character.psyche, 'veil');
    for (const m of Object.values(character.mastery)) m.sessionUses = 0;
    for (const slot of character.elos) {
      sanitizeSlot(slot);
      // Regra de equipar (Elo mínimo = 1 + distância): desequipa o que não cabe mais.
      if (slot.technique && this.equipProblem(slot.level, slot.technique as SpellId)) {
        slot.technique = null;
        sanitizeSlot(slot);
      }
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

  flowMax(): number {
    const cap = displayLevel(this.c.mastery.capacity);
    return (BASE_FLOW_MAX + (cap - 1) * 4) * (this.mods?.flowMaxMult ?? 1);
  }

  maxHp(): number {
    return maxHpFor(this.c);
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
    return ((info.costPct / 100) * this.flowMax() * masteryCostMult(this.c.mastery[tech.id]) * this.mods.techniqueCost) / Math.max(0.5, res);
  }

  slotCooldown(slot: EloSlot, info: EffectiveInfo): number {
    return info.cooldown * (1 - 0.12 * (slot.mods.cadence ?? 0));
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
    this.events = [];
    this.time += dt;
    this.c.playTime += dt;
    const p = this.player;
    const psy = this.c.psyche;

    this.mods = computeFlowMods(psy, p.posture);

    if (p.dead) {
      p.respawnIn -= dt;
      if (p.respawnIn <= 0) this.respawn();
    } else {
      this.updatePlayer(input, dt);
    }
    for (const fx of this.pending.filter((x) => x.at <= this.time)) fx.run();
    this.pending = this.pending.filter((x) => x.at > this.time);
    this.updateEnemies(dt);
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
        for (const id of ['basic', this.player.posture, ...inUse] as MasteryId[]) {
          const r = this.c.mastery[id];
          r.sharpness = Math.max(0, r.sharpness - 0.2);
        }
      }
    }
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
      enemyLevelDiff: target ? target.def.level - this.c.level : 0,
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
    if (m.forcedPosture) wanted = m.forcedPosture;
    if (wanted && wanted !== p.posture) {
      if (wanted === 'silence' && !m.silenceAllowed) this.notice('O Orgulho não deixa você se esconder.', 'warn');
      else if (wanted !== 'silence' && m.forcedPosture === 'silence') {
        /* Pânico força o Silêncio */
      } else {
        p.posture = wanted;
        this.mods = computeFlowMods(c.psyche, p.posture);
      }
    }
    if (p.posture === 'silence' && !m.silenceAllowed && !m.forcedPosture) p.posture = 'veil';

    // Maré.
    if (input.tideSteps) shiftTide(p.tide, input.tideSteps);
    tickTide(p.tide, dt, this.mods, displayLevel(c.mastery.tide) * 0.04, this.time);

    // Reserva de Fluxo.
    const def = POSTURES[p.posture];
    const flowMax = this.flowMax();
    p.flow -= def.drain * this.mods.postureDrain * dt;
    if (this.time >= p.flowLockUntil) {
      p.flow += BASE_FLOW_REGEN * def.regenMult * this.mods.regen * dt;
    }
    if (p.flow <= 0) {
      p.flow = 0;
      if (def.drain > 1) {
        p.posture = 'veil';
        this.notice('Fluxo esgotado: você volta ao Véu.', 'warn');
      }
    }
    p.flow = Math.min(p.flow, flowMax);

    // Ímpeto sustentado treina a capacidade da reserva.
    if (p.posture === 'impetus' && this.inCombat()) {
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
    const speed = 5.2 * this.mods.moveSpeed * slow * (p.attackAnim > 0.15 ? 0.55 : 1);
    if (dir.x || dir.y) moveWithCollision(this.map, p.pos, dir.x * speed * dt, dir.y * speed * dt, 0.35);
    this.lastAim = { ...input.aim };
    const aimDir = normalize({ x: input.aim.x - p.pos.x, y: input.aim.y - p.pos.y });
    if (aimDir.x || aimDir.y) p.facing = aimDir;
    else if (dir.x || dir.y) p.facing = dir;
    p.attackAnim = Math.max(0, p.attackAnim - dt);

    // Golpe básico.
    p.basicCd -= dt;
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

    // Grimórios no chão e livros antigos.
    for (const d of [...this.drops]) {
      if (this.time > d.expiresAt) this.drops = this.drops.filter((x) => x !== d);
      else if (dist(d.pos, p.pos) < 1.1) {
        this.drops = this.drops.filter((x) => x !== d);
        this.acquireSpell(d.spell, d.pos, 'Grimório');
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

    // Eco do jogador.
    if (this.echo) {
      if (this.playTime > this.echo.expiresAt) {
        this.echo = null;
        this.notice('Seu Eco se dissipou.', 'bad');
      } else if (dist(this.echo.pos, p.pos) < 1.3) {
        this.gainXp(this.echo.xpBack, false);
        this.notice(`Eco recuperado: +${this.echo.xpBack} XP`, 'good');
        this.echo = null;
      }
    }

    // Arena do chefe e o juramento de nunca fugir.
    const boss = this.boss();
    const arena = this.map.arena;
    if (boss && boss.state !== 'dead') {
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
      POSTURES[p.posture].outgoingMult *
      this.mods.outgoing *
      tideOutgoing(p.tide.value) *
      (1 + 0.04 * (this.c.level - 1)) *
      (this.focused() ? 1.1 : 1)
    );
  }

  private basicAttack(): void {
    const p = this.player;
    const range = 1.8;
    p.basicCd = 0.42;
    p.attackAnim = 0.25;
    this.events.push({ t: 'swing', x: p.pos.x, y: p.pos.y, dir: { ...p.facing }, range });
    const sharp = sharpnessMult(this.c.mastery.basic.sharpness);
    const mastery = 1 + 0.03 * (displayLevel(this.c.mastery.basic) - 1);
    let hitAny = false;
    for (const e of this.enemies) {
      if (e.state === 'dead') continue;
      const d = dist(e.pos, p.pos);
      if (d > range + e.def.radius) continue;
      const to = { x: e.pos.x - p.pos.x, y: e.pos.y - p.pos.y };
      if (d > 0.6 && angleBetween(to, p.facing) > (55 * Math.PI) / 180) continue;
      hitAny = true;
      const dmg = 9 * this.outgoingMult() * sharp * mastery;
      this.hitEnemy(e, dmg, { ignoreArmor: false, source: 'basic' });
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
      (1 + 0.02 * (displayLevel(r) - 1))
    );
  }

  /** Acerto de magia num inimigo, respeitando "só contra elites" e a forja. Retorna se valeu. */
  private spellHit(spell: SpellDef, slot: EloSlot, e: Enemy, dmg: number, pierce = false): boolean {
    if (slot.restrictions.includes('eliteOnly') && !e.def.elite) {
      this.events.push({ t: 'damage', x: e.pos.x, y: e.pos.y, amount: 0, target: 'enemy', id: e.id, immune: true });
      return false;
    }
    if (slot.mods.stun) this.stunEnemy(e, 0.8);
    this.train(spell.id, 10, this.currentRisk(e));
    if (dmg > 0) this.hitEnemy(e, dmg, { ignoreArmor: pierce || !!slot.mods.shatter, source: 'spell' });
    return true;
  }

  /** Depois da magia: Restaurar cura se acertou; "se errar" pune se não acertou ninguém. */
  private afterSpell(slot: EloSlot, hits: number): void {
    const p = this.player;
    if (hits > 0 && slot.mods.restore) this.healPlayer(this.maxHp() * 0.06);
    if (hits === 0 && slot.restrictions.includes('missLock')) {
      p.flow = 0;
      p.flowLockUntil = this.time + 20;
      this.notice('Restrição: você errou. Fluxo perdido por 20 s.', 'bad');
    }
  }

  private stunEnemy(e: Enemy, s: number): void {
    if (e.def.boss) s *= 0.4;
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
    const k = e.def.elite ? 0.5 : 1;
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
    const range = spell.range * (1 + 0.25 * (slot.mods.range ?? 0));
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
          if (this.spellHit(spell, slot, e, dmg, e.signatureHits % 3 === 0)) hits++;
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
        this.events.push({ t: 'spellMark', x: at.x, y: at.y, r: radius, duration: 0.6, color });
        this.pending.push({
          at: this.time + 0.6,
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
          if (d > range || (d > 0.8 && angleBetween(to, p.facing) > (40 * Math.PI) / 180)) continue;
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
        const jumps = 3 + (slot.mods.area ?? 0);
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
          if (e.state !== 'dead' && this.spellHit(spell, slot, e, dmg * Math.pow(0.85, i))) hits++;
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
          e.rootUntil = this.time + (e.def.boss ? 1.2 : 2.5);
          e.aggro = true;
        }
        return this.afterSpell(slot, hits);
      }
      case 'conjuredBlade': {
        this.events.push({ t: 'slash', x: p.pos.x, y: p.pos.y, dir: { ...p.facing }, range, arc: Math.PI, color: beyond ? '#ffd84a' : color });
        for (const e of this.live()) {
          const to = { x: e.pos.x - p.pos.x, y: e.pos.y - p.pos.y };
          const d = Math.hypot(to.x, to.y);
          if (d > range + e.def.radius || (d > 0.6 && angleBetween(to, p.facing) > Math.PI / 2)) continue;
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
          this.shove(e, normalize(to), 3);
          this.stunEnemy(e, 0.6);
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
        target.charmedUntil = this.time + 6;
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
    p.pointUntil = this.time + 4;
    p.defenseZeroUntil = this.time + 2;
    this.events.push({ t: 'pointCharge' });
    this.notice(`Ponto: o próximo golpe é um crítico (nível ${info.effective}). Defesa zero por 2 s.`, 'info');
  }

  private healPlayer(amount: number): void {
    const p = this.player;
    const before = p.hp;
    p.hp = Math.min(this.maxHp(), p.hp + amount);
    if (p.hp > before) this.events.push({ t: 'heal', amount: Math.round(p.hp - before) });
  }

  private hitEnemy(e: Enemy, raw: number, opts: { ignoreArmor: boolean; source: 'basic' | 'spell' }): void {
    const p = this.player;
    let dmg = raw;
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
        (2.5 + 0.1 * displayLevel(pm)) *
        (0.7 + 0.3 * (info?.power ?? 1)) *
        (1 + 0.2 * (mods.damage ?? 0)) *
        sharpnessMult(pm.sharpness);
      crit = true;
      p.pointUntil = -1;
      if (mods.shatter) ignoreArmor = true;
      if (mods.stun) {
        e.stun = 0.8;
        if (e.state === 'windup' || e.state === 'charging') e.state = 'stunned';
      }
      if (mods.restore) this.healPlayer(this.maxHp() * 0.06);
      this.train('point', 8, this.currentRisk(e));
    }
    if (!ignoreArmor) dmg = Math.max(1, dmg - e.def.armor);
    dmg = Math.round(dmg);
    e.hp -= dmg;
    e.hurtAgo = 0;
    e.aggro = true;
    if (e.def.boss) p.bossEngaged = true;
    this.events.push({ t: 'damage', x: e.pos.x, y: e.pos.y, amount: dmg, target: 'enemy', id: e.id, crit, pierce: ignoreArmor && e.def.armor > 0 });
    if (e.hp <= 0) this.killEnemy(e);
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
    p.needs.fight = clamp(p.needs.fight + 0.12, 0, 1);
    this.gainXp(e.def.xp, true);
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

  private gainXp(amount: number, fromKill: boolean): void {
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
    let mult = def.incomingMult * m.incoming;
    const defenseZero = this.time < p.defenseZeroUntil;
    let perfect = false;
    if (defenseZero) {
      mult *= 1.25;
    } else {
      const veilBonus = p.posture === 'veil' ? 0.005 * (displayLevel(this.c.mastery.veil) - 1) : 0;
      const dr = p.flow > 0 ? def.damageReduction + veilBonus : 0;
      mult *= 1 - dr;
      mult *= tideIncoming(p.tide.value);
      if (opts.heavy && p.tide.value <= 0.3 && this.time - p.tide.lastDefenseShiftAt <= 1.0) {
        perfect = true;
        mult *= 0.5;
      }
    }
    const dmg = Math.max(1, Math.round(raw * mult));
    p.hp -= dmg;
    p.lastHitTakenAt = this.time;
    p.lastCombatAt = this.time;
    this.events.push({ t: 'damage', x: p.pos.x, y: p.pos.y, amount: dmg, target: 'player' });
    if (p.posture === 'veil' && !defenseZero) this.train('veil', Math.max(1, raw - dmg) * 0.3, this.currentRisk(opts.source));
    if (perfect) {
      this.events.push({ t: 'perfectTide', x: p.pos.x, y: p.pos.y });
      this.notice('Maré perfeita!', 'good');
      this.feel('perfectTide');
      this.train('tide', 20, this.currentRisk(opts.source));
    }
    if (dmg >= this.maxHp() * 0.15) this.feel('heavyHit', Math.min(2, dmg / (this.maxHp() * 0.3)));
    if (p.hp <= 0) this.killPlayer();
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
    this.echo = { pos: { ...p.pos }, xpBack: Math.round(xpLoss / 2), expiresAt: this.playTime + 30 * 60 };
    this.notice(`Você caiu. Penalidade ${c.penaltyLevel} (${row.mult}x): -${xpLoss} XP. Seu Eco ficou onde você caiu.`, 'bad');
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
    p.dead = false;
    p.pos = { ...this.map.playerStart };
    p.hp = this.maxHp();
    p.flow = this.flowMax() * 0.5;
    p.posture = 'veil';
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
      hp: def.hp,
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
    };
    this.enemies.push(e);
    return e;
  }

  private resetEnemy(e: Enemy): void {
    e.hp = e.def.hp;
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
    if (p.posture === 'silence' && !e.def.elite) return d < 1.4;
    return d < e.def.aggroRadius || (e.aggro && d < e.def.aggroRadius * 2);
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
          Object.assign(e, { hp: e.def.hp, state: 'idle', pos: { ...e.home }, aggro: false, signatureHits: 0, phase: 1 });
        }
        continue;
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
      if (e.def.boss && e.phase === 1 && e.hp < e.def.hp * 0.5) {
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
          if (sees) e.state = 'chase';
          break;
        case 'return': {
          const back = { x: e.home.x - e.pos.x, y: e.home.y - e.pos.y };
          if (Math.hypot(back.x, back.y) < 0.5) {
            e.state = 'idle';
            e.hp = e.def.hp;
          } else this.moveEnemy(e, normalize(back), e.def.speed * 1.3 * dt);
          if (sees && !e.def.boss) e.state = 'chase';
          break;
        }
        case 'chase': {
          if (!sees || p.dead) {
            e.aggro = false;
            e.state = 'return';
            break;
          }
          const atk = this.chooseAttack(e, d);
          if (atk) {
            e.attack = atk;
            e.state = 'windup';
            const windup = atk.windup * (e.phase === 2 ? 0.85 : 1);
            e.timer = windup;
            e.facing = normalize(toPlayer);
            e.attackTarget = atk.type === 'slam' ? { ...p.pos } : { x: e.pos.x + e.facing.x * atk.range, y: e.pos.y + e.facing.y * atk.range };
            if (atk.type === 'slam')
              this.events.push({ t: 'telegraph', x: e.attackTarget.x, y: e.attackTarget.y, r: atk.radius, duration: windup, heavy: atk.heavy });
            else if (atk.type === 'charge')
              this.events.push({ t: 'telegraph', x: e.attackTarget.x, y: e.attackTarget.y, r: atk.radius, duration: windup, heavy: false });
          } else if (d > e.def.radius + 0.9) {
            e.facing = normalize(toPlayer);
            this.moveEnemy(e, e.facing, e.def.speed * speedMul * dt);
          }
          break;
        }
        case 'windup':
          e.timer -= dt;
          if (e.attack?.type === 'melee') e.facing = normalize(toPlayer);
          if (e.timer <= 0) this.executeAttack(e);
          break;
        case 'charging': {
          e.timer -= dt;
          const step = 13 * dt;
          this.moveEnemy(e, e.facing, step);
          if (!p.dead && dist(e.pos, p.pos) < e.def.radius + 0.6 && e.attack) {
            this.damagePlayer(e.attack.damage, { heavy: false, source: e });
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

  /** Marca da Discórdia: o inimigo ataca o aliado mais próximo. */
  private updateCharmed(e: Enemy, dt: number): void {
    const foe = this.live()
      .filter((x) => x !== e && this.time >= x.charmedUntil && dist(x.pos, e.pos) < 12)
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
          const dmg = Math.max(1, Math.round(atk.damage * 1.5 - foe.def.armor));
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
      e.timer = atk.windup;
    } else {
      e.state = 'chase';
      this.moveEnemy(e, e.facing, e.def.speed * dt);
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
    if (a.type === 'slam') {
      if (!p.dead && dist(p.pos, e.attackTarget) <= a.radius + 0.3) this.damagePlayer(a.damage, { heavy: a.heavy, source: e });
    } else {
      this.events.push({ t: 'enemySwing', id: e.id, dir: { ...e.facing }, range: a.range });
      const to = { x: p.pos.x - e.pos.x, y: p.pos.y - e.pos.y };
      const d = Math.hypot(to.x, to.y);
      if (!p.dead && d <= a.range + 0.35 + e.def.radius * 0.5 && angleBetween(to, e.facing) < (70 * Math.PI) / 180)
        this.damagePlayer(a.damage, { heavy: a.heavy, source: e });
    }
    e.state = 'recover';
    e.timer = a.recover;
  }

  private moveEnemy(e: Enemy, dir: Vec2, step: number): void {
    if (this.time < e.rootUntil) return; // preso por Correntes
    const before = { ...e.pos };
    moveWithCollision(this.map, e.pos, dir.x * step, dir.y * step, Math.min(0.45, e.def.radius * 0.6));
    // Inimigos não entram no santuário; o chefe não sai da arena.
    if (inCircle(this.map.sanctuary, e.pos, 1) || (e.def.boss && !inCircle(this.map.arena, e.pos, 0))) e.pos = before;
  }

  private separateEnemies(): void {
    const live = this.enemies.filter((e) => e.state !== 'dead');
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
