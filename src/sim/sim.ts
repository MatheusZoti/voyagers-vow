import {
  DEATH_PENALTY,
  maxHpFor,
  PENALTY_MAX,
  PENALTY_WINDOW_S,
  refreshEloUnlocks,
  xpToNext,
  type Character,
} from './character';
import { evaluateSlot, PACTS, type EffectiveInfo, type EloSlot } from './elos';
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
import { psycheEvent, tickPsyche, type PsycheNotice } from './psyche/psyche';
import { STRONG_VALUE } from './psyche/traits';
import { MASTERY_NAMES, resonance, TECHNIQUES, type MasteryId, type TechniqueId } from './techniques';
import { ENEMIES, type AttackDef, type Echo, type Enemy, type EnemyKind, type Trap } from './world/entities';
import { buildMap, inCircle, moveWithCollision, type GameMap } from './world/map';

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
  | { t: 'damage'; x: number; y: number; amount: number; target: 'enemy' | 'player'; crit?: boolean; pierce?: boolean; immune?: boolean }
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
  events: SimEvent[] = [];
  mods: FlowMods;
  /** tempo desta sessão (s) */
  time = 0;
  private rng: Rng;
  private nextId = 1;
  private impetusAcc = 0;

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
    const res = tech.id === 'signature' ? resonance(tech.tags, this.c.psyche.traits) : 1;
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
        for (const id of ['basic', 'signature', 'point', this.player.posture] as MasteryId[]) {
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
    const tech = id === 'signature' ? TECHNIQUES.signature : null;
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

    if (slot.technique === 'signature') this.castSignature(slot, info);
    else if (slot.technique === 'point') this.castPoint(info);
  }

  private castSignature(slot: EloSlot, info: EffectiveInfo): void {
    const p = this.player;
    const tech = TECHNIQUES.signature;
    const from = { ...p.pos };
    const dash = tech.range * (1 + 0.25 * (slot.mods.range ?? 0));
    const steps = 8;
    for (let i = 0; i < steps; i++) moveWithCollision(this.map, p.pos, (p.facing.x * dash) / steps, (p.facing.y * dash) / steps, 0.35);
    const radius = tech.radius * (1 + 0.3 * (slot.mods.area ?? 0));
    const center = { x: p.pos.x + p.facing.x * 0.6, y: p.pos.y + p.facing.y * 0.6 };
    p.attackAnim = 0.35;
    this.events.push({ t: 'signature', from, to: { ...p.pos }, radius, beyond: info.beyondLimit });
    p.lastCombatAt = this.time;

    const r = this.c.mastery.signature;
    const dmgBase =
      tech.baseDamage *
      info.power *
      (1 + 0.2 * (slot.mods.damage ?? 0)) *
      this.outgoingMult() *
      this.mods.signature *
      sharpnessMult(r.sharpness) *
      (1 + 0.02 * (displayLevel(r) - 1));
    let hits = 0;
    for (const e of this.enemies) {
      if (e.state === 'dead') continue;
      if (dist(e.pos, center) > radius + e.def.radius) continue;
      if (slot.restrictions.includes('eliteOnly') && !e.def.elite) {
        this.events.push({ t: 'damage', x: e.pos.x, y: e.pos.y, amount: 0, target: 'enemy', immune: true });
        continue;
      }
      hits++;
      e.signatureHits += 1;
      const pierce = !!slot.mods.shatter || e.signatureHits % 3 === 0;
      this.hitEnemy(e, dmgBase, { ignoreArmor: pierce, source: 'signature' });
      if (slot.mods.stun) {
        e.stun = 0.8;
        if (e.state === 'windup' || e.state === 'charging') e.state = 'stunned';
      }
      this.train('signature', 10, this.currentRisk(e));
    }
    if (hits > 0 && slot.mods.restore) this.healPlayer(this.maxHp() * 0.06);
    if (hits === 0 && slot.restrictions.includes('missLock')) {
      p.flow = 0;
      p.flowLockUntil = this.time + 20;
      this.notice('Restrição: você errou. Fluxo perdido por 20 s.', 'bad');
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

  private hitEnemy(e: Enemy, raw: number, opts: { ignoreArmor: boolean; source: 'basic' | 'signature' }): void {
    const p = this.player;
    let dmg = raw;
    let crit = false;
    if (this.time < p.pointUntil) {
      const pointSlot = this.c.elos.find((s) => s.technique === 'point');
      const info = pointSlot ? this.slotInfo(pointSlot) : null;
      const pm = this.c.mastery.point;
      dmg *= (2.5 + 0.1 * displayLevel(pm)) * (0.7 + 0.3 * (info?.power ?? 1)) * sharpnessMult(pm.sharpness);
      crit = true;
      p.pointUntil = -1;
      this.train('point', 8, this.currentRisk(e));
    }
    if (!opts.ignoreArmor) dmg = Math.max(1, dmg - e.def.armor);
    dmg = Math.round(dmg);
    e.hp -= dmg;
    e.hurtAgo = 0;
    e.aggro = true;
    if (e.def.boss) p.bossEngaged = true;
    this.events.push({ t: 'damage', x: e.pos.x, y: e.pos.y, amount: dmg, target: 'enemy', crit, pierce: opts.ignoreArmor && e.def.armor > 0 });
    if (e.hp <= 0) this.killEnemy(e);
  }

  private killEnemy(e: Enemy): void {
    const p = this.player;
    e.hp = 0;
    e.state = 'dead';
    e.respawnIn = e.summoned ? Infinity : e.def.respawn;
    this.events.push({ t: 'enemyDeath', id: e.id, x: e.pos.x, y: e.pos.y, boss: e.def.boss });
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
    p.bossEngaged = false;
    this.events.push({ t: 'playerDeath', x: p.pos.x, y: p.pos.y });

    // Penalidade por níveis, estilo Tibia.
    if (this.playTime - c.lastDeathAt < PENALTY_WINDOW_S) c.penaltyLevel = Math.min(PENALTY_MAX, c.penaltyLevel + 1);
    if (c.elos.some((s) => s.technique && s.restrictions.includes('bloodOath')))
      c.penaltyLevel = Math.min(PENALTY_MAX, c.penaltyLevel + 2);
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
