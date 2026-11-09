import { itemDef, itemName, QUALITY_NAMES, type Item } from '../sim/items';
import type { SimEvent, Simulation } from '../sim/sim';
import { floorLevel } from '../sim/world/map';
import { STRONG_VALUE } from '../sim/psyche/values';
import { EMOTION_IDS, type EmotionId } from '../sim/psyche/emotions';
import { displayLevel } from '../sim/mastery';
import { SPELLS, type SpellId } from '../sim/techniques';

/**
 * Sessão de playtest guiado. Enquanto você joga, registra o que aconteceu (mortes, lutas
 * contra o chefe, itens, níveis, tempo em cada lugar, onde ficou preso, uso das mecânicas)
 * e as suas anotações (Enter). "Encerrar sessão" (no menu de pausa) grava o relatório em
 * `playtests/` pelo servidor de desenvolvimento, para análise.
 *
 * Só observa: nunca muda o jogo nem o save do personagem.
 */

const KEY = 'voyagers-vow/playtest/current';
const SAMPLE_EVERY = 5;

export interface PlaytestNote {
  t: number;
  region: string;
  place: string;
  x: number;
  y: number;
  level: number;
  hpPct: number;
  text: string;
}

export interface PlaytestLog {
  version: 1;
  id: string;
  startedAt: string;
  updatedAt: string;
  /** segundos de jogo (sem pausas) */
  playS: number;
  character: { name: string; affinity: string; levelStart: number; level: number };
  regions: Record<string, { timeS: number; places: Record<string, number> }>;
  /** posição a cada 5 s de jogo (região, x, y, andar) */
  path: Array<[string, number, number, number]>;
  deaths: Array<{ t: number; region: string; place: string; x: number; y: number; level: number; penalty: number; killer: string | null; itemsToEcho: string[] }>;
  kills: Record<string, number>;
  bossFights: Array<{ t: number; region: string; durationS: number; result: 'venceu' | 'fugiu' | 'morreu'; hpLostPct: number; perfectTides: number; level: number }>;
  levels: Array<{ level: number; t: number }>;
  items: {
    seen: number;
    picked: Array<{ t: number; name: string; quality: string; tier: number }>;
    equipped: Array<{ t: number; name: string; slot: string }>;
    discarded: number;
  };
  spells: Record<string, number>;
  basicSwings: number;
  perfectTides: number;
  postureS: Record<string, number>;
  damage: { dealt: number; taken: number };
  /** lugares onde o jogador tentou andar e não saiu do lugar */
  stuck: Array<{ t: number; region: string; x: number; y: number; floor: number }>;
  echoes: { created: number; recovered: number };
  dialogues: string[];
  regionsVisited: string[];
  uiOpened: Record<string, number>;
  checklist: Record<string, number | null>;
  notes: PlaytestNote[];
  fps: { avg: number; min: number };
  /** Sinal e voz: o que a Psique mostrou ao jogador */
  psyche?: {
    whispers: Array<{ t: number; text: string }>;
    milestones: Array<{ t: number; title: string }>;
    /** Valores no fim (dev; o jogador não vê números) */
    valuesEnd: Record<string, number>;
    strongEnd: string[];
    /** "Como você mudou": causas e direções (as 40 mais recentes) */
    shifts?: Array<{ t: number; cause: string; changes: string[] }>;
    /** Falas de NPCs que notaram você */
    greetings?: Array<{ t: number; npc: string; text: string }>;
    /** Quando cada emoção apareceu forte (≥ 25%) */
    emotions?: Array<{ t: number; id: string }>;
  };
  /** Maestria: cada nível novo de magia e o estado final */
  mastery?: { ups: Array<{ t: number; spell: string; level: number }>; end: Record<string, number> };
  /** Grade de Elos no fim: magia, Restrições e nível efetivo de cada Elo aberto */
  elosEnd?: Array<{ elo: number; spell: string | null; restrictions: string[]; effective: number | null; valueBonus: number }>;
}

/** Roteiro: o que vale experimentar na sessão (marca sozinho). Foco: Psique simplificada, Maestria e Restrições. */
export const CHECKLIST: Array<{ id: string; label: string }> = [
  { id: 'talk', label: 'Escolher numa situação com alguém' },
  { id: 'whisper', label: 'Sentir um sussurro (um Valor mudou)' },
  { id: 'surrender', label: 'Decidir o destino de um inimigo rendido' },
  { id: 'shrine', label: 'Decidir o que fazer num altar' },
  { id: 'greeting', label: 'Ouvir um NPC comentar sobre você' },
  { id: 'emotion', label: 'Sentir uma emoção no combate (Fúria, Medo, Calma)' },
  { id: 'psyche', label: 'Abrir a Psique (C) e ver "Como você mudou"' },
  { id: 'mastery', label: 'Subir a Maestria de uma magia (aba M)' },
  { id: 'restriction', label: 'Pôr uma Restrição num Elo (K)' },
  { id: 'codex', label: 'Ver a Tendência dos Elos no Grimório (G)' },
  { id: 'tide', label: 'Fazer uma Maré perfeita' },
  { id: 'boss', label: 'Derrotar o Guardião da Ponte' },
  { id: 'notes', label: 'Deixar 3 anotações (Enter)' },
];

/** Atos marcados pela causa registrada em "Como você mudou". */
const SHIFT_STEPS: Array<[RegExp, string]> = [
  [/rendido/, 'surrender'],
  [/moedas/, 'shrine'],
  [/viajante (cercado|para trás)/, 'distress'],
];

function fresh(sim: Simulation): PlaytestLog {
  const c = sim.c;
  const now = new Date();
  return {
    version: 1,
    id: now.toISOString().replace(/[:.]/g, '-').slice(0, 19),
    startedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    playS: 0,
    character: { name: c.name, affinity: c.affinity, levelStart: c.level, level: c.level },
    regions: {},
    path: [],
    deaths: [],
    kills: {},
    bossFights: [],
    levels: [],
    items: { seen: 0, picked: [], equipped: [], discarded: 0 },
    spells: {},
    basicSwings: 0,
    perfectTides: 0,
    postureS: {},
    damage: { dealt: 0, taken: 0 },
    stuck: [],
    echoes: { created: 0, recovered: 0 },
    dialogues: [],
    regionsVisited: [],
    uiOpened: {},
    checklist: Object.fromEntries(CHECKLIST.map((s) => [s.id, null])),
    notes: [],
    fps: { avg: 0, min: 0 },
    psyche: { whispers: [], milestones: [], valuesEnd: {}, strongEnd: [] },
  };
}

const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

export class PlaytestRecorder {
  log: PlaytestLog | null = null;
  private sim: Simulation | null = null;
  private sampleAcc = 0;
  private saveAcc = 0;
  private stuckAcc = 0;
  private lastPos = { x: 0, y: 0 };
  private slotCd: Record<number, number> = {};
  private equipped = new Set<number>();
  private seenDrops = new Set<number>();
  /** itens (uid) já contados como vistos */
  private seenItems = new Set<number>();
  /** itens que estavam na mochila no último passo (para saber o que foi jogado fora) */
  private bagUids = new Set<number>();
  private boss: { start: number; hp: number; tides: number } | null = null;
  private fpsSum = 0;
  private fpsN = 0;
  private widget: HTMLElement | null = null;
  private open = false;
  onChange: () => void = () => {};

  /** Começa (ou continua) a sessão com esta simulação. Chamado a cada região carregada. */
  attach(sim: Simulation): void {
    this.sim = sim;
    if (!this.log) {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) this.log = JSON.parse(raw) as PlaytestLog;
      } catch {
        this.log = null;
      }
      if (!this.log || this.log.character.name !== sim.c.name) this.log = fresh(sim);
      // Sessão antiga com outro roteiro: os passos novos começam em aberto e os que saíram somem.
      const ids = new Set(CHECKLIST.map((s) => s.id));
      for (const id of Object.keys(this.log.checklist)) if (!ids.has(id)) delete this.log.checklist[id];
      for (const s of CHECKLIST) this.log.checklist[s.id] ??= null;
    }
    const c = sim.c;
    this.lastPos = { ...sim.player.pos };
    this.equipped = new Set(Object.values(c.equipment).map((i) => i!.uid));
    this.seenDrops = new Set(sim.itemDrops.map((d) => d.id));
    this.bagUids = new Set(c.bag.map((i) => i.uid));
    this.slotCd = {};
    this.boss = null;
    if (!this.log.regionsVisited.includes(sim.map.id)) this.log.regionsVisited.push(sim.map.id);
    if (sim.map.id === 'varn') this.check('varn');
    this.mountWidget();
    this.save();
  }

  private check(id: string): void {
    const L = this.log;
    if (!L || L.checklist[id] !== null) return;
    L.checklist[id] = round(L.playS, 0);
    this.renderWidget(id);
  }

  private place(x: number, y: number): string {
    const m = this.sim!.map;
    let best = m.name;
    let bd = Infinity;
    for (const p of m.places) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) {
        bd = d;
        best = p.name;
      }
    }
    return bd < 14 ? best : m.name;
  }

  /** Depois de cada passo da simulação. `moving` = o jogador está tentando andar. */
  afterStep(events: SimEvent[], dt: number, moving: boolean): void {
    const L = this.log;
    const sim = this.sim;
    if (!L || !sim) return;
    const c = sim.c;
    const p = sim.player;
    const region = sim.map.id;
    L.playS += dt;
    L.character.level = c.level;
    const reg = (L.regions[region] ??= { timeS: 0, places: {} });
    reg.timeS += dt;
    const here = this.place(p.pos.x, p.pos.y);
    reg.places[here] = (reg.places[here] ?? 0) + dt;
    L.postureS[p.posture] = (L.postureS[p.posture] ?? 0) + dt;

    // Amostra de posição e detecção de "preso".
    this.sampleAcc += dt;
    if (this.sampleAcc >= SAMPLE_EVERY) {
      this.sampleAcc = 0;
      L.path.push([region, round(p.pos.x), round(p.pos.y), floorLevel(sim.map, p.pos.x, p.pos.y)]);
    }
    const movedNow = Math.hypot(p.pos.x - this.lastPos.x, p.pos.y - this.lastPos.y);
    if (moving && !p.dead && movedNow < 0.004) {
      this.stuckAcc += dt;
      if (this.stuckAcc > 1.5) {
        const last = L.stuck[L.stuck.length - 1];
        if (!last || Math.hypot(last.x - p.pos.x, last.y - p.pos.y) > 2 || last.region !== region)
          L.stuck.push({ t: round(L.playS, 0), region, x: round(p.pos.x), y: round(p.pos.y), floor: floorLevel(sim.map, p.pos.x, p.pos.y) });
        this.stuckAcc = -999; // um registro por parada
      }
    } else if (movedNow > 0.004) this.stuckAcc = 0;
    if (floorLevel(sim.map, p.pos.x, p.pos.y) !== floorLevel(sim.map, this.lastPos.x, this.lastPos.y) && floorLevel(sim.map, p.pos.x, p.pos.y) >= 1) this.check('ramp');
    // Emoções: registra quando cada uma aparece forte.
    for (const id of EMOTION_IDS) {
      const strong = (c.psyche.emotions[id]?.intensity ?? 0) >= 0.25;
      if (strong && !this.emoOn.has(id)) {
        this.emoOn.add(id);
        (L.psyche ??= { whispers: [], milestones: [], valuesEnd: {}, strongEnd: [] }).emotions ??= [];
        L.psyche.emotions!.push({ t: round(L.playS, 0), id });
        this.check('emotion');
      } else if (!strong) this.emoOn.delete(id);
    }
    // Maestria: cada nível novo.
    const ms = (L.mastery ??= { ups: [], end: {} });
    for (const id of c.knownSpells) {
      const lvl = displayLevel(c.mastery[id]);
      const was = this.masteryLvl[id];
      if (was !== undefined && lvl > was) {
        ms.ups.push({ t: round(L.playS, 0), spell: SPELLS[id].name, level: lvl });
        this.check('mastery');
      }
      this.masteryLvl[id] = lvl;
    }
    // Restrições postas nos Elos.
    const nPacts = c.elos.reduce((n, e) => n + (e.unlocked ? e.restrictions.length : 0), 0);
    if (nPacts > this.pactCount) this.check('restriction');
    this.pactCount = nPacts;
    this.lastPos = { ...p.pos };
    const cause = c.shifts[0]?.cause;
    if (cause) for (const [re, id] of SHIFT_STEPS) if (re.test(cause)) this.check(id);

    // Magias: a recarga de um Elo subiu = ele foi usado.
    for (const slot of c.elos) {
      const cd = p.slotCd[slot.level] ?? 0;
      if (cd > (this.slotCd[slot.level] ?? 0) + 0.05 && slot.technique) {
        L.spells[slot.technique] = (L.spells[slot.technique] ?? 0) + 1;
        this.check('spell');
      }
      this.slotCd[slot.level] = cd;
    }

    // Luta contra o chefe.
    const boss = sim.boss();
    if (p.bossEngaged && !this.boss) this.boss = { start: L.playS, hp: p.hp, tides: L.perfectTides };
    const endBoss = (result: 'venceu' | 'fugiu' | 'morreu') => {
      if (!this.boss) return;
      L.bossFights.push({
        t: round(this.boss.start, 0),
        region,
        durationS: round(L.playS - this.boss.start, 0),
        result,
        hpLostPct: Math.round((this.bossHpLost / sim.maxHp()) * 100),
        perfectTides: L.perfectTides - this.boss.tides,
        level: c.level,
      });
      this.boss = null;
      this.bossHpLost = 0;
    };

    const psy = (L.psyche ??= { whispers: [], milestones: [], valuesEnd: {}, strongEnd: [] });
    for (const ev of events) {
      switch (ev.t) {
        case 'damage':
          if (ev.target === 'player') {
            L.damage.taken += ev.amount;
            if (this.boss) this.bossHpLost += ev.amount;
          } else L.damage.dealt += ev.amount;
          break;
        case 'swing':
          L.basicSwings++;
          break;
        case 'perfectTide':
          L.perfectTides++;
          this.check('tide');
          break;
        case 'levelUp':
          L.levels.push({ level: ev.level, t: round(L.playS, 0) });
          break;
        case 'enemyDeath': {
          const e = sim.enemies.find((x) => x.id === ev.id);
          if (e) L.kills[e.kind] = (L.kills[e.kind] ?? 0) + 1;
          if (e?.kind === 'brute') this.check('brute');
          if (ev.boss) {
            endBoss('venceu');
            this.check('boss');
          }
          break;
        }
        case 'playerDeath': {
          const foe = sim.enemies
            .filter((e) => e.state !== 'dead' && e.aggro)
            .sort((a, b) => Math.hypot(a.pos.x - ev.x, a.pos.y - ev.y) - Math.hypot(b.pos.x - ev.x, b.pos.y - ev.y))[0];
          L.deaths.push({
            t: round(L.playS, 0),
            region,
            place: this.place(ev.x, ev.y),
            x: round(ev.x),
            y: round(ev.y),
            level: c.level,
            penalty: c.penaltyLevel,
            killer: foe ? foe.def.name : null,
            itemsToEcho: (c.echo?.items ?? []).map((i) => itemName(i.item)),
          });
          L.echoes.created++;
          endBoss('morreu');
          break;
        }
        case 'echoRecovered':
          L.echoes.recovered++;
          break;
        case 'whisper':
          for (const it of ev.items) psy.whispers.push({ t: round(L.playS, 0), text: it.text });
          this.check('whisper');
          break;
        case 'milestone':
          psy.milestones.push({ t: round(L.playS, 0), title: ev.title });
          break;
        case 'npcSay':
          (psy.greetings ??= []).push({ t: round(L.playS, 0), npc: ev.npc, text: ev.text });
          this.check('greeting');
          break;
        case 'itemPickup': {
          const it = c.bag[c.bag.length - 1];
          if (it) {
            L.items.picked.push(this.itemRow(it));
            // Caiu e foi pego no mesmo instante: também conta como visto.
            if (!this.seenItems.has(it.uid)) {
              this.seenItems.add(it.uid);
              L.items.seen++;
            }
          }
          break;
        }
      }
    }
    if (this.boss && !p.bossEngaged && !p.dead && boss && boss.state !== 'dead') endBoss('fugiu');

    // Itens vistos no chão (ou jogados fora da mochila), vestidos.
    for (const d of sim.itemDrops)
      if (!this.seenDrops.has(d.id)) {
        this.seenDrops.add(d.id);
        if (this.bagUids.has(d.item.uid)) L.items.discarded++;
        else if (!this.seenItems.has(d.item.uid)) {
          this.seenItems.add(d.item.uid);
          L.items.seen++;
        }
      }
    for (const [slot, it] of Object.entries(c.equipment)) {
      if (!it || this.equipped.has(it.uid)) continue;
      this.equipped.add(it.uid);
      L.items.equipped.push({ t: round(L.playS, 0), name: itemName(it), slot });
      this.check('equip');
    }
    this.bagUids = new Set(c.bag.map((i) => i.uid));

    // Conversas.
    for (const d of c.dialogues)
      if (!L.dialogues.includes(d)) {
        L.dialogues.push(d);
        if (d !== 'bridge') this.check('talk');
      }

    this.saveAcc += dt;
    if (this.saveAcc > 10) {
      this.saveAcc = 0;
      this.save();
    }
  }
  private bossHpLost = 0;
  private emoOn = new Set<EmotionId>();
  private masteryLvl: Partial<Record<SpellId, number>> = {};
  private pactCount = Infinity;

  private itemRow(it: Item): PlaytestLog['items']['picked'][number] {
    return { t: round(this.log!.playS, 0), name: itemName(it), quality: QUALITY_NAMES[it.quality - 1] ?? '?', tier: itemDef(it)?.tier ?? 0 };
  }

  frame(dt: number): void {
    if (!this.log || dt <= 0) return;
    const fps = 1 / dt;
    this.fpsSum += fps;
    this.fpsN++;
    this.log.fps.avg = Math.round(this.fpsSum / this.fpsN);
    if (this.fpsN > 60) this.log.fps.min = this.log.fps.min ? Math.min(this.log.fps.min, Math.round(fps)) : Math.round(fps);
  }

  /** Painéis abertos (para saber o que o jogador usou). */
  ui(panel: string | null): void {
    if (!this.log || !panel) return;
    this.log.uiOpened[panel] = (this.log.uiOpened[panel] ?? 0) + 1;
    if (panel === 'stats') this.check('stats');
    if (panel === 'psyche') this.check('psyche');
    if (panel === 'codex') this.check('codex');
  }

  addNote(text: string): void {
    const L = this.log;
    const sim = this.sim;
    if (!L || !sim || !text.trim()) return;
    const p = sim.player;
    L.notes.push({
      t: round(L.playS, 0),
      region: sim.map.id,
      place: this.place(p.pos.x, p.pos.y),
      x: round(p.pos.x),
      y: round(p.pos.y),
      level: sim.c.level,
      hpPct: Math.round((p.hp / sim.maxHp()) * 100),
      text: text.trim(),
    });
    if (L.notes.length >= 3) this.check('notes');
    this.save();
    this.renderWidget();
  }

  save(): void {
    if (!this.log) return;
    this.log.updatedAt = new Date().toISOString();
    if (this.sim && this.log.psyche) {
      const v = this.sim.c.psyche.values;
      this.log.psyche.valuesEnd = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Math.round(x)]));
      this.log.psyche.strongEnd = Object.entries(v)
        .filter(([, x]) => Math.abs(x) >= STRONG_VALUE)
        .map(([k, x]) => `${k}${x > 0 ? '+' : '−'}`);
      this.log.psyche.shifts = this.sim.c.shifts.map((sh) => ({
        t: Math.round(sh.t),
        cause: sh.cause,
        changes: sh.changes.map((ch) => `${ch.id}${ch.dir > 0 ? '↑' : '↓'}`),
      }));
    }
    if (this.sim) {
      const sim = this.sim;
      const c = sim.c;
      (this.log.mastery ??= { ups: [], end: {} }).end = Object.fromEntries(c.knownSpells.map((id) => [SPELLS[id].name, Math.round(c.mastery[id].level * 10) / 10]));
      this.log.elosEnd = c.elos
        .filter((e) => e.unlocked)
        .map((e) => {
          const info = e.technique ? sim.slotInfo(e) : null;
          return {
            elo: e.level,
            spell: e.technique ? SPELLS[e.technique as SpellId].name : null,
            restrictions: [...e.restrictions],
            effective: info?.effective ?? null,
            valueBonus: info?.valueBonus ?? 0,
          };
        });
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(this.log));
    } catch {
      /* sem armazenamento: a sessão segue na memória */
    }
  }

  /** Encerra a sessão: grava em playtests/ (servidor de desenvolvimento) ou baixa o arquivo. */
  async finish(): Promise<string> {
    const L = this.log;
    if (!L) return 'Nenhuma sessão em andamento.';
    this.save();
    const body = JSON.stringify(L, null, 1);
    let where = '';
    try {
      const res = await fetch(`/__playtest/${L.id}`, { method: 'PUT', body, headers: { 'Content-Type': 'application/json' } });
      const out = (await res.json()) as { ok?: boolean; file?: string };
      if (!res.ok || !out.ok) throw new Error();
      where = `Relatório salvo em ${out.file}.`;
    } catch {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
      a.download = `playtest-${L.id}.json`;
      a.click();
      where = 'Relatório baixado (sem servidor de desenvolvimento).';
    }
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    this.log = this.sim ? fresh(this.sim) : null;
    this.save();
    this.renderWidget();
    return where;
  }

  /** Resumo curto para o menu de pausa. */
  summary(): string {
    const L = this.log;
    if (!L) return '';
    const mins = Math.floor(L.playS / 60);
    const done = Object.values(L.checklist).filter((v) => v !== null).length;
    return `${mins} min de jogo · ${L.deaths.length} morte(s) · ${Object.values(L.kills).reduce((a, b) => a + b, 0)} abates · ${L.notes.length} anotação(ões) · roteiro ${done}/${CHECKLIST.length}`;
  }

  // ---------------------------------------------------------------------------
  // Roteiro na tela
  // ---------------------------------------------------------------------------

  private mountWidget(): void {
    if (this.widget) return;
    const el = document.createElement('div');
    el.className = 'pt-widget';
    el.addEventListener('click', () => {
      this.open = !this.open;
      this.renderWidget();
    });
    document.body.append(el);
    this.widget = el;
    this.renderWidget();
  }

  private renderWidget(justDone?: string): void {
    const el = this.widget;
    const L = this.log;
    if (!el || !L) return;
    const done = CHECKLIST.filter((s) => L.checklist[s.id] !== null).length;
    const list = this.open
      ? `<ol>${CHECKLIST.map((s) => `<li class="${L.checklist[s.id] !== null ? 'ok' : ''} ${s.id === justDone ? 'flash' : ''}">${s.label}${s.id === 'notes' ? ` <small>${L.notes.length}/3</small>` : ''}</li>`).join('')}</ol>
         <p class="pt-help"><b>Enter</b> anota o que você sentiu (fica marcado onde você está). Para terminar: <b>Esc → Encerrar sessão</b>.</p>`
      : '';
    el.innerHTML = `<div class="pt-head"><span class="pt-rec"></span> Playtest · roteiro ${done}/${CHECKLIST.length} <span class="pt-caret">${this.open ? '▾' : '▸'}</span></div>${list}`;
    if (justDone) {
      const label = CHECKLIST.find((s) => s.id === justDone)?.label;
      if (label) this.onChange();
      el.classList.remove('pulse');
      void el.offsetWidth;
      el.classList.add('pulse');
    }
  }

  /** Caixa de anotação. Chama `done` ao fechar (para retomar o jogo). */
  openNote(done: () => void): void {
    const back = document.createElement('div');
    back.className = 'pt-note';
    back.innerHTML = `<div class="pt-note-box">
      <b>Anotação</b>
      <input type="text" maxlength="400" placeholder="O que você está sentindo ou percebendo agora?"/>
      <small>Enter salva · Esc cancela · fica marcada aqui, no nível e na vida de agora</small>
    </div>`;
    document.body.append(back);
    const input = back.querySelector('input')!;
    input.focus();
    const close = (keep: boolean) => {
      if (keep) this.addNote(input.value);
      back.remove();
      done();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') close(true);
      if (e.key === 'Escape') close(false);
    });
  }
}
