import { AFFINITY_COLORS, AFFINITY_DESC, AFFINITY_NAMES, minSlotFor } from '../../sim/flow/affinity';
import { canAddRestriction, PACTS, trimMods, type EffectiveInfo, type ModId, type PactId } from '../../sim/elos';
import { xpToNext } from '../../sim/character';
import { displayLevel, GRACE_PLAYED_S, masteryCostMult, modifierDiscount, sharpnessMult } from '../../sim/mastery';
import { EMOTION_COLORS, EMOTION_NAMES, type Emotion } from '../../sim/psyche/emotions';
import { CRISIS_DESC, CRISIS_NAMES } from '../../sim/psyche/psyche';
import { STRONG_VALUE, TRAIT_GROUPS, VALUE_NAMES } from '../../sim/psyche/traits';
import type { Simulation } from '../../sim/sim';
import { formatStat, tierLevels, type StatLine } from '../../sim/stats';
import { regionName } from '../../sim/world/regions';
import { shiftName } from '../../sim/psyche/shifts';
import {
  BAG_SIZE,
  formatItemStat,
  ITEM_STAT_NAMES,
  itemDef,
  itemMinLevel,
  itemName,
  itemStatsFor,
  QUALITY_COLORS,
  resonanceState,
  resonanceText,
  QUALITY_NAMES,
  SLOT_NAMES,
  SLOTS,
  WEAPON_FORMS,
  type Item,
  type ItemStat,
  type Slot,
} from '../../sim/items';
import {
  isSpell,
  MASTERY_NAMES,
  NATURE_NAMES,
  resonance,
  sanitizeSlot,
  SPELL_IDS,
  SPELLS,
  TECHNIQUES,
  type MasteryId,
  type SpellId,
  type TechniqueId,
} from '../../sim/techniques';
import { SLOT_KEYS } from '../keys';
import type { Sfx } from '../sfx';
import type { PlaytestRecorder } from '../playtest';
import { escapeHtml, hintTip } from '../util';
import {
  affinityRadar,
  buildConstellation,
  constellation,
  emotionWheel,
  forgeEqualizer,
  levelLadder,
  pactPips,
  traitSliders,
  valuesEqualizer,
} from './charts';
import { CatalogState, catalogHtml, spellNeed, visibleEntries, type CatalogKind, type PickContext } from './catalog';
import { icon } from './icons';
import { drawBase, drawFog, drawMarkers } from './worldmap';

export type TabId = 'psyche' | 'stats' | 'elos' | 'codex' | 'mastery' | 'map';
export type PanelId = TabId | 'help' | 'pause';

const TABS: Array<{ id: TabId; name: string; key: string }> = [
  { id: 'psyche', name: 'Psique', key: 'C' },
  { id: 'stats', name: 'Atributos', key: 'I' },
  { id: 'elos', name: 'Grade de Elos', key: 'K' },
  { id: 'codex', name: 'Grimório', key: 'G' },
  { id: 'mastery', name: 'Maestria', key: 'M' },
  { id: 'map', name: 'Mapa', key: 'N' },
];

const GROUP_COLORS: Record<string, string> = {
  Temperamento: '#ff7a6a',
  Mente: '#6fd0ff',
  Social: '#7ee0a8',
  'Ambição': '#e2b65a',
};
/** Cor de cada traço pelo seu grupo (para as mudanças na aba Psique). */
const TRAIT_GROUP_COLOR: Record<string, string> = Object.fromEntries(
  Object.entries(TRAIT_GROUPS).flatMap(([g, ids]) => ids.map((id) => [id, GROUP_COLORS[g] ?? '#cfd8e3'])),
);

const SPELL_MASTERY = '+2% de efeito por nível; −1,5% de custo de Fluxo por nível; −1 no custo dos modificadores a cada 5 níveis.';

const MASTERY_EFFECT: Record<MasteryId, string> = {
  ...(Object.fromEntries(SPELL_IDS.map((id) => [id, SPELL_MASTERY])) as Record<SpellId, string>),
  point: 'Crítico mais forte (+0,1x por nível); −1,5% de custo por nível.',
  basic: '+3% de dano do golpe básico por nível.',
  veil: '+0,5% de redução de dano com a Maré na defesa (Véu) por nível. Sobe recebendo golpes nela.',
  silence: 'Inimigos te percebem de mais perto (−2% do raio por nível). Sobe passando despercebido perto de inimigos e meditando.',
  impetus: '+0,5% de dano com a Maré no ataque (Ímpeto) por nível. Sobe sustentando-a em combate.',
  gaze: 'Sobe revelando inimigos em Sombra e armadilhas.',
  tide: '+4% de velocidade da Maré por nível. Sobe com Marés perfeitas.',
  capacity: '+4 de reserva de Fluxo por nível. Sobe sustentando a Maré no ataque.',
};

/** "?" no título de um card: explicação no hover (ou foco pelo teclado). */
const tip = hintTip;

/** Janela do personagem (abas) e menus de ajuda e pausa. O jogo pausa enquanto ela está aberta. */
export class Panels {
  current: PanelId | null = null;
  onClose: () => void = () => {};
  onQuit: () => void = () => {};
  sfx: Sfx | null = null;
  /** sessão de playtest em andamento (botão "Encerrar sessão" na pausa) */
  playtest: PlaytestRecorder | null = null;
  private playtestMsg = '';
  private selectedElo = 2;
  private selectedNode: MasteryId = 'basic';
  /** Grade de Elos: o Elo, ou o catálogo para escolher a magia / uma Restrição */
  private eloView: 'elo' | CatalogKind = 'elo';
  private codexKind: CatalogKind = 'spells';
  private memTab: 'recent' | 'long' | 'shifts' = 'recent';
  /** estado próprio de cada catálogo: a busca do Elo não vaza para o Grimório */
  private pickCat = new CatalogState();
  private codexCat = new CatalogState();
  private get cat(): CatalogState {
    return this.current === 'codex' ? this.codexCat : this.pickCat;
  }

  constructor(
    private root: HTMLElement,
    private sim: Simulation,
  ) {
    root.addEventListener('mouseover', (e) => this.placeTip(e));
    root.addEventListener('focusin', (e) => this.placeTip(e));
  }

  /** O balão do "?" vira para dentro quando encostaria na borda da janela. */
  private placeTip(e: Event): void {
    const hint = (e.target as HTMLElement).closest?.<HTMLElement>('.hint-i');
    const tipEl = hint?.querySelector<HTMLElement>('.tip');
    const win = this.root.querySelector<HTMLElement>('.win');
    if (!hint || !tipEl || !win) return;
    tipEl.classList.remove('left', 'up');
    // Mede com o balão visível (escondido ele fica fora do layout).
    tipEl.style.display = 'block';
    const tw = tipEl.offsetWidth;
    const th = tipEl.offsetHeight;
    tipEl.style.display = '';
    const h = hint.getBoundingClientRect();
    // Respeita a borda do painel que rola (a ficha do Grimório corta o que passar dela).
    const w = (hint.closest<HTMLElement>('.cat-detail, .edetail') ?? win).getBoundingClientRect();
    if (h.left + tw > w.right - 12) tipEl.classList.add('left');
    if (h.bottom + 8 + th > w.bottom - 12) tipEl.classList.add('up');
  }

  toggle(id: PanelId): void {
    if (this.current === id) this.close();
    else this.open(id);
  }

  open(id: PanelId): void {
    this.current = id;
    this.render();
  }

  close(): void {
    this.current = null;
    this.root.className = 'screen';
    this.root.innerHTML = '';
    this.root.onclick = null;
    this.root.onmousedown = null;
    this.root.oninput = null;
    this.root.onchange = null;
    this.root.onkeydown = null;
    this.eloView = 'elo';
    this.cat.showAll = false;
    this.onClose();
  }

  render(): void {
    const id = this.current;
    if (!id) return;
    if (id === 'help') return this.renderHelp();
    if (id === 'pause') return this.renderPause();
    this.renderWindow(id);
  }

  // -------------------------------------------------------------------------
  // Janela com abas
  // -------------------------------------------------------------------------

  private renderWindow(tab: TabId): void {
    const c = this.sim.c;
    const aff = AFFINITY_COLORS[c.affinity];
    const body =
      tab === 'psyche'
        ? this.psycheTab()
        : tab === 'stats'
          ? this.statsTab()
          : tab === 'elos'
          ? this.elosTab()
          : tab === 'codex'
            ? this.codexTab()
            : tab === 'mastery'
              ? this.masteryTab()
              : this.mapTab();
    const prev = this.root.querySelector<HTMLElement>('.win:not(.small)');
    const scroll = prev?.dataset.cur === tab ? (prev.querySelector('.win-body')?.scrollTop ?? 0) : 0;
    // Listas com rolagem própria mantêm a posição entre renders.
    const kept = new Map<string, number>();
    if (prev?.dataset.cur === tab) prev.querySelectorAll<HTMLElement>('[data-keep-scroll]').forEach((el) => kept.set(el.dataset.keepScroll!, el.scrollTop));
    const searching = (document.activeElement as HTMLElement | null)?.matches?.('[data-search]') ?? false;
    const fill = tab === 'elos' || tab === 'codex' || tab === 'psyche';
    this.root.className = 'screen overlay';
    this.root.innerHTML = `
      <div class="win ${prev ? '' : 'enter'}" data-cur="${tab}" style="--aff:${aff}">
        <header class="win-head">
          <div class="id">
            <span class="sigil" style="color:${aff}">${icon('signature', 20)}</span>
            <div><b>${escapeHtml(c.name)}</b><span>Nível ${c.level} · ${AFFINITY_NAMES[c.affinity]}</span></div>
            <div class="xp" title="${c.xp} / ${xpToNext(c.level)} XP"><i style="width:${(c.xp / xpToNext(c.level)) * 100}%"></i></div>
          </div>
          <nav class="tabs">${TABS.map((t) => `<button class="tab ${t.id === tab ? 'on' : ''}" data-tab="${t.id}">${t.name}<kbd>${t.key}</kbd></button>`).join('')}</nav>
          <button class="x" data-a="close" title="Fechar (Esc)">×</button>
        </header>
        <div class="win-body ${fill ? 'fill' : ''}">${body}</div>
      </div>`;
    const wb = this.root.querySelector('.win-body');
    if (wb) wb.scrollTop = scroll;
    this.root.querySelectorAll<HTMLElement>('[data-keep-scroll]').forEach((el) => {
      const v = kept.get(el.dataset.keepScroll!);
      if (v) el.scrollTop = v;
    });
    if (searching) this.focusSearch();
    this.root.oninput = (e) => {
      const el = e.target as HTMLInputElement;
      if (el.matches('[data-search]')) this.setQuery(el.value);
    };
    this.root.onchange = (e) => this.onFilterChange(e);
    this.root.onkeydown = (e) => this.onSearchKey(e);
    this.root.onmousedown = (e) => {
      if (e.target === this.root) this.close();
    };
    this.root.onclick = (e) => this.onClick(e);
    if (tab === 'map') this.drawMap();
  }

  // -------------------------------------------------------------------------
  // Mapa da região
  // -------------------------------------------------------------------------

  private mapTab(): string {
    const legend: Array<[string, string]> = [
      ['you', 'Você'],
      ['npc', 'Pessoa (! = conversa nova)'],
      ['foe', 'Inimigo (forte = te perseguindo)'],
      ['boss', 'Guardião da Ponte'],
      ['book', 'Livro antigo'],
      ['drop', 'Grimório caído'],
      ['echo', 'Seu Eco'],
    ];
    return `<div class="grid mapg">
      <section class="card map-card"><canvas class="bigmap"></canvas></section>
      <section class="card map-side">
        <h4>${this.sim.map.name}</h4>
        <p class="card-sub">Região de tier ${this.sim.map.tier}, zona Santuário: sem PvP. ${this.sim.map.tier > 1 ? 'Inimigos mais fortes e mais recompensa. ' : ''}O que você ainda não viu fica sob a névoa; inimigos só aparecem quando estão à vista. As setas na borda levam a outras regiões.</p>
        <ul class="map-legend">${legend.map(([k, t]) => `<li><i class="lg-${k}"></i>${t}</li>`).join('')}</ul>
      </section>
    </div>`;
  }

  private drawMap(): void {
    const cv = this.root.querySelector<HTMLCanvasElement>('canvas.bigmap');
    if (!cv) return;
    const scale = 12;
    const map = this.sim.map;
    cv.width = map.w * scale;
    cv.height = map.h * scale;
    const g = cv.getContext('2d')!;
    g.drawImage(drawBase(map, scale), 0, 0);
    drawFog(g, this.sim, scale);
    drawMarkers(g, this.sim, scale);
  }

  private onClick(e: MouseEvent): void {
    const t = (e.target as HTMLElement).closest<HTMLElement>(
      '[data-tab],[data-a],[data-gear-eq],[data-gear-bag],[data-gear-act],[data-mem],[data-elo],[data-mod],[data-node],[data-open],[data-open-pact],[data-rm-pact],[data-codex],[data-pick],[data-cat-act],[data-f-aff],[data-f-level],[data-f-kind],[data-goto-pact],[data-goto-spell]',
    );
    if (!t) return;
    const c = this.sim.c;
    if (t.dataset.a === 'close') return this.close();
    if (t.dataset.tab) return this.open(t.dataset.tab as TabId);
    if (t.dataset.gearEq) {
      this.gearSel = { slot: t.dataset.gearEq as Slot };
      this.gearMsg = '';
      return this.render();
    }
    if (t.dataset.gearBag) {
      this.gearSel = { uid: +t.dataset.gearBag };
      this.gearMsg = '';
      return this.render();
    }
    if (t.dataset.gearAct) return this.gearAction(t.dataset.gearAct);
    if (t.dataset.node) {
      this.selectedNode = t.dataset.node as MasteryId;
      return this.render();
    }
    if (t.dataset.mem) {
      this.memTab = t.dataset.mem as 'recent' | 'long' | 'shifts';
      return this.render();
    }
    if (t.dataset.elo) {
      this.selectedElo = +t.dataset.elo;
      this.eloView = 'elo';
      return this.render();
    }
    // Navegação do catálogo: sempre permitida, até fora do santuário.
    const cat = this.cat;
    const slot = c.elos[this.selectedElo - 1]!;
    if (t.dataset.open) {
      this.eloView = t.dataset.open as CatalogKind;
      cat.showAll = false;
      cat.spellQuery = cat.pactQuery = '';
      if (this.eloView === 'spells' && slot.technique) cat.selSpell = slot.technique as SpellId;
      return this.render();
    }
    if (t.dataset.openPact) {
      this.eloView = 'pacts';
      cat.showAll = false;
      cat.pactQuery = '';
      cat.selPact = t.dataset.openPact as PactId;
      return this.render();
    }
    if (t.dataset.codex) {
      this.codexKind = t.dataset.codex as CatalogKind;
      return this.render();
    }
    if (t.dataset.gotoPact) {
      this.codexKind = 'pacts';
      cat.selPact = t.dataset.gotoPact as PactId;
      cat.resetFilters('pacts');
      return this.render();
    }
    if (t.dataset.gotoSpell) {
      this.codexKind = 'spells';
      cat.selSpell = t.dataset.gotoSpell as SpellId;
      cat.resetFilters('spells');
      return this.render();
    }
    if (t.dataset.pick) {
      const kind = this.catalogNow()?.kind;
      if (kind === 'spells') cat.selSpell = t.dataset.pick as SpellId;
      else cat.selPact = t.dataset.pick as PactId;
      return this.render();
    }
    if (t.dataset.fAff) {
      cat.spellAffinity = t.dataset.fAff as CatalogState['spellAffinity'];
      return this.render();
    }
    if (t.dataset.fLevel) {
      cat.pactLevel = +t.dataset.fLevel;
      return this.render();
    }
    if (t.dataset.fKind) {
      cat.pactKind = t.dataset.fKind as CatalogState['pactKind'];
      return this.render();
    }
    if (t.dataset.a === 'back') {
      this.eloView = 'elo';
      return this.render();
    }
    if (t.dataset.a === 'show-all') {
      cat.showAll = !cat.showAll;
      return this.render();
    }
    if (t.dataset.a === 'reset-filters') {
      const kind = this.catalogNow()?.kind;
      if (kind) cat.resetFilters(kind);
      return this.render();
    }
    // Daqui para baixo, só no santuário.
    if (!this.editable() || (t as HTMLButtonElement).disabled) return;
    if (t.dataset.catAct) {
      const act = t.dataset.catAct;
      if (act === 'equip' && cat.selSpell) this.equipSpell(cat.selSpell);
      else if (act === 'clear') this.equipSpell(null);
      else if (act === 'add' && cat.selPact) this.setPact(cat.selPact, true);
      else if (act === 'remove' && cat.selPact) this.setPact(cat.selPact, false);
      this.eloView = 'elo';
      return this.render();
    }
    if (t.dataset.a === 'clear-spell') {
      this.equipSpell(null);
      return this.render();
    }
    if (t.dataset.rmPact) {
      this.setPact(t.dataset.rmPact as PactId, false);
      return this.render();
    }
    if (t.dataset.mod) {
      const id = t.dataset.mod as ModId;
      let n = +t.dataset.n!;
      if (n === (slot.mods[id] ?? 0)) n -= 1; // clicar no ponto mais alto aceso apaga ele
      if (n <= 0) delete slot.mods[id];
      else slot.mods[id] = n;
      return this.render();
    }
  }

  private editable(): boolean {
    return this.sim.inSanctuary() && !this.sim.inCombat();
  }

  // -------------------------------------------------------------------------
  // Psique
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Atributos: números derivados, cada um com a conta de onde vem; equipamento e mochila
  // -------------------------------------------------------------------------

  /** Item selecionado na aba Atributos (vestido num espaço ou na mochila). */
  private gearSel: { slot?: Slot; uid?: number } | null = null;
  private gearMsg = '';

  private selectedItem(): { item: Item; worn: boolean } | null {
    const c = this.sim.c;
    const sel = this.gearSel;
    if (!sel) return null;
    if (sel.slot) {
      const it = c.equipment[sel.slot];
      return it ? { item: it, worn: true } : null;
    }
    const it = c.bag.find((x) => x.uid === sel.uid);
    return it ? { item: it, worn: false } : null;
  }

  private gearAction(act: string): void {
    const sim = this.sim;
    const cur = this.selectedItem();
    if (!cur) return;
    let err: string | null = null;
    if (act === 'equip') {
      err = sim.equipItem(cur.item.uid);
      if (!err) this.gearSel = { slot: itemDef(cur.item)!.slot };
    } else if (act === 'unequip') {
      err = sim.unequip(itemDef(cur.item)!.slot);
      if (!err) this.gearSel = { uid: cur.item.uid };
    } else if (act === 'discard') {
      sim.discardItem(cur.item.uid);
      this.gearSel = null;
      this.gearMsg = 'Jogado no chão, atrás de você. Dá para pegar de volta por um tempo.';
    }
    if (err) this.gearMsg = err;
    else if (act !== 'discard') this.gearMsg = '';
    this.sfx?.ui();
    this.render();
  }

  /** Pontinho dos itens com Ressonância: dourado se ressoa, vermelho se é dissonante, cinza se neutro. */
  private resDot(it?: Item): string {
    if (!it?.resonance) return '';
    const st = resonanceState(it, this.sim.c.psyche.values);
    return `<i class="res-dot ${st}"></i>`;
  }

  private slotIcon(slot: Slot, it?: Item): string {
    if (slot === 'weapon') {
      const form = it ? itemDef(it)?.form : undefined;
      return form === 'mace' ? 'mace' : form === 'staff' ? 'staff' : form === 'blade' ? 'blade' : 'fists';
    }
    return { head: 'helm', chest: 'armor', feet: 'boots', focus: 'amulet', weapon: 'fists' }[slot];
  }

  private itemDetail(): string {
    const c = this.sim.c;
    const cur = this.selectedItem();
    const msg = this.gearMsg ? `<p class="gear-msg">${escapeHtml(this.gearMsg)}</p>` : '';
    if (!cur)
      return `<section class="card gear-detail"><h4>Item</h4><p class="empty-note">Clique num espaço ou num item da mochila para ver a ficha dele.</p>${msg}</section>`;
    const { item, worn } = cur;
    const d = itemDef(item)!;
    const col = QUALITY_COLORS[item.quality - 1];
    const need = itemMinLevel(d);
    const vals = c.psyche.values;
    const mine = itemStatsFor(item, vals);
    const other = worn ? undefined : c.equipment[d.slot];
    const theirs = other ? itemStatsFor(other, vals) : {};
    const keys = [...new Set([...Object.keys(mine), ...Object.keys(theirs)])] as ItemStat[];
    const rows = keys
      .map((k) => {
        const v = mine[k] ?? 0;
        const delta = v - (theirs[k] ?? 0);
        const cmp =
          worn || Math.abs(delta) < 1e-6
            ? ''
            : `<i class="${delta > 0 ? 'up' : 'down'}">${delta > 0 ? '▲' : '▼'} ${formatItemStat(k, Math.abs(delta)).replace('+', '')}</i>`;
        return `<div class="kv"><span>${ITEM_STAT_NAMES[k]}</span><b>${v ? formatItemStat(k, v) : '—'} ${cmp}</b></div>`;
      })
      .join('');
    const form = d.form ? WEAPON_FORMS[d.form] : null;
    const aff = item.affinity ? `<div class="kv"><span>Afinidade do Foco</span><b style="color:${AFFINITY_COLORS[item.affinity]}">${AFFINITY_NAMES[item.affinity]}</b></div>` : '';
    const resState = resonanceState(item, vals);
    const res = item.resonance
      ? `<div class="note res-note ${resState}"><b>Ressonância: ${VALUE_NAMES[item.resonance]}</b><p>${escapeHtml(resonanceText(item, vals) ?? '')}</p></div>`
      : '';
    const lock = this.sim.gearLock();
    const lowLevel = c.level < need;
    const actions = worn
      ? `<button class="btn" data-gear-act="unequip" ${lock ? 'disabled' : ''}>Tirar</button>`
      : `<button class="btn primary" data-gear-act="equip" ${lock || lowLevel ? 'disabled' : ''}>${other ? 'Trocar' : 'Vestir'}</button><button class="btn" data-gear-act="discard">Jogar fora</button>`;
    return `<section class="card gear-detail" style="--q:${col}">
      <div class="gd-head"><span class="gd-ic">${icon(this.slotIcon(d.slot, item), 30)}</span>
        <div><h3>${escapeHtml(itemName(item))}</h3><span class="muted">${QUALITY_NAMES[item.quality - 1]} · Tier ${d.tier} · ${SLOT_NAMES[d.slot]}</span></div></div>
      <p class="card-sub">${escapeHtml(d.desc)}${form ? ` <b>${form.name}:</b> ${escapeHtml(form.desc)}` : ''}</p>
      ${aff}${rows}
      ${res}
      <div class="kv"><span>Requer</span><b class="${lowLevel ? 'bad' : ''}">nível ${need}</b></div>
      ${!worn && other ? `<p class="muted gd-vs">Comparado com ${escapeHtml(itemName(other))} (vestido).</p>` : ''}
      <div class="gd-actions">${actions}</div>
      ${lock && !msg ? `<p class="gear-msg">${escapeHtml(lock)}</p>` : msg}
    </section>`;
  }

  /** Onde está o Eco, o que ele guarda e quanto tempo falta. */
  private echoRow(): string {
    const c = this.sim.c;
    const e = c.echo;
    if (!e) return '';
    const mins = Math.max(0, Math.ceil((e.expiresAt - c.playTime) / 60));
    const what = [e.xpBack > 0 ? `${e.xpBack} XP` : '', ...e.items.map((x) => itemName(x.item))].filter(Boolean).join(', ') || 'nada';
    const where = e.region === this.sim.map.id ? 'aqui (veja no mapa, N)' : `em ${escapeHtml(regionName(e.region))}`;
    return `<div class="kv echo-row"><span>Seu Eco ${tip('Quando você cai, metade do XP perdido fica no Eco, onde você caiu. Cada equipamento (vestido ou na mochila) tem uma chance de cair nele também — maior quanto maior a penalidade de morte. Passe pelo Eco para recuperar tudo. Ele se dissipa com 30 minutos de jogo, ou se você cair de novo antes, e leva junto o que guardava.')}</span><b>${where} · ${escapeHtml(what)} · some em ${mins} min</b></div>`;
  }

  private statsTab(): string {
    const sim = this.sim;
    const c = sim.c;
    const st = sim.stats();
    const band = tierLevels(sim.map.tier);
    const next = xpToNext(c.level);
    const where =
      c.level < band.min ? 'abaixo da faixa: cuidado' : c.level > band.max ? 'acima da faixa: a próxima região já te espera' : 'dentro da faixa';
    const statCard = (l: StatLine) => `<section class="card stat-card">
        <h4>${l.name} ${tip(l.desc)}</h4>
        <div class="stat-big">${formatStat(l.kind, l.value)}</div>
        <div class="stat-parts">${
          l.parts.length
            ? l.parts.map((p, i) => `<div class="kv"><span>${escapeHtml(p.source)}</span><b>${formatStat(l.kind, p.value, i > 0 || l.kind === 'pct')}</b></div>`).join('')
            : '<p class="empty-note">Nenhuma fonte ainda.</p>'
        }</div>
      </section>`;
    const specials = st.lines.filter((l) => l.special && l.parts.length);
    const sel = this.gearSel;
    const slots = SLOTS.map((slot) => {
      const it = c.equipment[slot];
      const on = sel?.slot === slot;
      const col = it ? QUALITY_COLORS[it.quality - 1] : 'transparent';
      return `<button class="gear-slot ${it ? '' : 'empty'} ${on ? 'on' : ''}" data-gear-eq="${slot}" style="--q:${col}">
          <span class="gs-ic">${icon(this.slotIcon(slot, it), 22)}${this.resDot(it)}</span>
          <span class="gs-txt"><small>${SLOT_NAMES[slot]}</small><b>${it ? escapeHtml(itemName(it)) : slot === 'weapon' ? 'Punhos' : 'vazio'}</b></span>
        </button>`;
    }).join('');
    const bag = Array.from({ length: BAG_SIZE }, (_, i) => {
      const it = c.bag[i];
      if (!it) return '<span class="bag-cell empty"></span>';
      const d = itemDef(it);
      const on = sel?.uid === it.uid;
      const tooLow = d && c.level < itemMinLevel(d);
      return `<button class="bag-cell ${on ? 'on' : ''} ${tooLow ? 'low' : ''}" data-gear-bag="${it.uid}" style="--q:${QUALITY_COLORS[it.quality - 1]}" title="${escapeHtml(itemName(it))} (${QUALITY_NAMES[it.quality - 1]})${it.resonance ? ` · pede ${VALUE_NAMES[it.resonance]}` : ''}">${icon(d ? this.slotIcon(d.slot, it) : 'empty', 20)}${this.resDot(it)}</button>`;
    }).join('');
    return `<div class="grid stats">
      <section class="card level-card">
        <h4>Nível <em>${c.level}</em> ${tip(
          'O nível cresce com a experiência de combate. Cada nível dá Vida e Fluxo máximo, libera Elos (3 no nível 3, 4 no nível 5) e permite vestir equipamentos de tiers mais altos. Morrer custa experiência (penalidade de morte).',
        )}</h4>
        <div class="bigbar"><i style="width:${Math.min(100, (c.xp / next) * 100)}%"></i></div>
        <div class="kv"><span>Experiência</span><b>${c.xp} / ${next}</b></div>
        <div class="kv"><span>${escapeHtml(sim.map.name)} (tier ${sim.map.tier})</span><b>nível recomendado ${band.min}–${band.max} · ${where}</b></div>
        ${this.echoRow()}
      </section>
      <section class="card gear-card">
        <h4>Equipamento ${tip('O que você veste. A arma decide o Golpe básico e dá o Poder; elmo e peito dão Vida e Guarda; botas, Velocidade; o Foco fortalece uma afinidade. Equipamentos nunca mudam o nível das magias. Não dá para trocar em combate.')}</h4>
        <div class="gear-slots">${slots}</div>
      </section>
      <section class="card bag-card">
        <h4>Mochila <span class="muted">${c.bag.length}/${BAG_SIZE}</span> ${tip('Equipamentos que você pegou. Criaturas deixam itens do tier da região; o brilho é a qualidade (Comum, Bom, Excelente, Primoroso, Obra-prima). Itens em vermelho pedem um nível maior.')}</h4>
        <div class="bag-grid">${bag}</div>
      </section>
      ${this.itemDetail()}
      ${st.lines.filter((l) => !l.special).map(statCard).join('')}
      ${specials.map(statCard).join('')}
    </div>`;
  }

  /** "Como você mudou": cada ato marcante com setas para o que mexeu (sem números). */
  private shiftList(): string {
    const c = this.sim.c;
    if (!c.shifts.length) return `<p class="empty-note">Conversas, lutas e escolhas mudam quem você é. Cada mudança aparece aqui, com o que a causou.</p>`;
    const ago = (t: number) => {
      const m = Math.max(0, Math.round((c.playTime - t) / 60));
      return m < 1 ? 'agora' : m < 60 ? `há ${m} min` : `há ${Math.round(m / 60)} h`;
    };
    return `<ol class="shift-list">${c.shifts
      .map(
        (s) => `<li><span class="sh-cause">${escapeHtml(s.cause)}</span><span class="sh-when">${ago(s.t)}</span><span class="sh-chips">${s.changes
          .map((ch) => {
            const name = shiftName(ch.kind, ch.id);
            const col = ch.kind === 'value' ? '#f0cf7a' : (TRAIT_GROUP_COLOR[ch.id] ?? '#cfd8e3');
            return `<i class="sh-chip ${ch.kind}" style="--c:${col}">${escapeHtml(name)} ${ch.dir > 0 ? '↑' : '↓'}</i>`;
          })
          .join('')}</span></li>`,
      )
      .join('')}</ol>`;
  }

  private psycheTab(): string {
    const c = this.sim.c;
    const p = c.psyche;
    const active = (Object.values(p.emotions) as Emotion[]).sort((a, b) => b.intensity - a.intensity);
    const crisis =
      p.crisis.phase === 'active'
        ? `<div class="alert bad"><b>${CRISIS_NAMES[p.crisis.id]}</b> ${CRISIS_DESC[p.crisis.id]}</div>`
        : p.crisis.phase === 'warning'
          ? `<div class="alert warn"><b>${CRISIS_NAMES[p.crisis.id]}</b> se aproxima.</div>`
          : '';
    const groups = Object.entries(TRAIT_GROUPS)
      .map(
        ([g, ids]) => `<div class="tgroup" style="--g:${GROUP_COLORS[g]}"><h5>${g}</h5>${traitSliders(p.traits, ids, GROUP_COLORS[g]!)}</div>`,
      )
      .join('');
    const memList = (list: typeof p.shortMemory, long: boolean) =>
      list.length
        ? `<ol class="timeline ${long ? 'long' : ''}">${list
            .map(
              (m) =>
                `<li style="--c:${EMOTION_COLORS[m.emotion]}"><span class="tl-dot"></span><span class="tl-text">${m.text}</span><span class="tl-meta">${EMOTION_NAMES[m.emotion]}${m.count > 1 ? ` · ×${m.count}` : ''}</span></li>`,
            )
            .join('')}</ol>`
        : `<p class="empty-note">${long ? 'Eventos fortes ou repetidos viram memórias marcantes — e mudam quem você é.' : 'Nada marcante ainda.'}</p>`;
    const memTab = this.memTab;
    const memCount = (n: number) => `<small>${n}</small>`;
    return `<div class="grid psy">
      <div class="psy-col">
      <section class="card wheel-card">
        <h4>Agora ${tip(
          'Suas emoções do momento e o estresse (no centro). Cada emoção muda o Fluxo em combate: Fúria fortalece o Ímpeto e deixa a Maré lenta para voltar à defesa; Medo fortalece o Véu e encarece o Ímpeto; Calma acelera a Maré e a regeneração; Euforia barateia as magias, mas faz a barra de Fluxo mentir; Luto encolhe a reserva; Orgulho fortalece a Assinatura e impede o Silêncio; Vergonha a enfraquece. Estresse alto vira Crise: medite em Silêncio no santuário para baixar.',
        )}</h4>
        ${emotionWheel(p.emotions, p.stress)}
        ${crisis}
        <div class="emo-legend">${
          active.length
            ? active
                .slice(0, 4)
                .map((e) => `<span style="--c:${EMOTION_COLORS[e.id]}"><i></i>${EMOTION_NAMES[e.id]}</span>`)
                .join('')
            : '<span class="muted">Sereno — nenhuma emoção forte.</span>'
        }</div>
      </section>
      <section class="card radar-card">
        <h4>Afinidade <em>${AFFINITY_NAMES[c.affinity]}</em> ${tip(
          `${AFFINITY_DESC[c.affinity]} Magias da sua afinidade entram em qualquer Elo sem perder nível. As das outras perdem 1 nível efetivo por passo de distância no pentágono e pedem Elos mais altos (o rótulo de cada ponta mostra a partir de qual). A forma colorida mostra quanto a sua personalidade puxa para cada afinidade.`,
        )}</h4>
        ${affinityRadar(c)}
      </section>
      </div>
      <div class="psy-col">
      <section class="card traits-card">
        <h4>Personalidade ${tip(
          '16 traços, cada um entre dois polos. Eles decidem sua afinidade e a ressonância das magias: as que combinam com você ganham Maestria mais rápido. Mudam devagar com o que você faz e com memórias marcantes. Os traços mais fortes aparecem destacados; passe o mouse numa linha para ler a frase.',
        )}</h4>
        <div class="tgrid">${groups}</div>
      </section>
      <div class="psy-row">
      <section class="card values-card">
        <h4>Valores ${tip(
          'O que você defende, de contra (−) a favor (+). Agir a favor de um valor traz emoção boa; agir contra traz culpa ou raiva. Um valor forte (dourado) dá +1 nível à primeira Restrição alinhada a ele em cada Elo. Usar uma Restrição contra os seus valores soma estresse a cada uso.',
        )}</h4>
        ${valuesEqualizer(p.values)}
      </section>
      <section class="card mem-card">
        <h4>Memórias ${tip(
          'Recentes: os últimos 8 eventos que mexeram com você (×N = quantas vezes). Marcantes: eventos muito fortes ou repetidos ficam para sempre e, ao entrar aqui, deslocam sua personalidade um pouco. Cada cor é a emoção que o evento despertou.',
        )}
          <span class="segs mini">
            <button class="seg ${memTab === 'recent' ? 'on' : ''}" data-mem="recent">Recentes ${memCount(p.shortMemory.length)}</button>
            <button class="seg ${memTab === 'long' ? 'on' : ''}" data-mem="long">Marcantes ${memCount(p.longMemory.length)}</button>
            <button class="seg ${memTab === 'shifts' ? 'on' : ''}" data-mem="shifts">Como você mudou ${memCount(c.shifts.length)}</button>
          </span>
        </h4>
        <div class="mem-scroll" data-keep-scroll="mem">${memTab === 'recent' ? memList(p.shortMemory, false) : memTab === 'long' ? memList(p.longMemory, true) : this.shiftList()}</div>
      </section>
      </div>
      </div>
    </div>`;
  }

  // -------------------------------------------------------------------------
  // Grade de Elos
  // -------------------------------------------------------------------------

  private elosTab(): string {
    const sim = this.sim;
    const c = sim.c;
    if (!c.elos[this.selectedElo - 1]?.unlocked) this.selectedElo = c.elos.find((e) => e.unlocked)?.level ?? 1;
    const rail = c.elos
      .map((slot) => {
        const tech = slot.technique ? TECHNIQUES[slot.technique as TechniqueId] : null;
        const info = slot.unlocked && tech ? sim.slotInfo(slot) : null;
        const sel = slot.level === this.selectedElo;
        const art = !slot.unlocked ? 'lock' : slot.sealed ? 'seal' : tech ? tech.icon : 'empty';
        const unlockHint = { 3: 'nível 3', 4: 'nível 5', 5: 'vencer o Guardião' }[slot.level] ?? 'mais adiante';
        const sub = !slot.unlocked
          ? `Libera: ${unlockHint}`
          : slot.sealed
            ? 'Selado'
            : tech
              ? `${tech.role} · ${slot.restrictions.length ? `${slot.restrictions.length} Restr.` : 'sem Restr.'}`
              : 'escolha uma magia';
        return `<button class="erow ${sel ? 'sel' : ''} ${slot.unlocked ? '' : 'locked'} ${info?.beyondLimit ? 'beyond' : ''} ${slot.sealed ? 'sealed' : ''}" data-elo="${slot.level}" ${slot.unlocked ? '' : 'disabled'}>
          <kbd class="ek">${SLOT_KEYS[slot.level - 1]}</kbd>
          <span class="er-ic" ${tech ? `style="color:${AFFINITY_COLORS[tech.affinity]}"` : ''}>${icon(art, 22)}</span>
          <span class="er-txt"><small>Elo ${slot.level}</small><b>${!slot.unlocked ? 'Bloqueado' : tech ? tech.name : 'Vazio'}</b><small>${sub}</small></span>
          ${info ? `<span class="e-eff ${info.effective > slot.level ? 'up' : info.effective < slot.level ? 'down' : ''}" title="Nível efetivo">${info.effective}</span>` : ''}
        </button>`;
      })
      .join('');
    const slot = c.elos[this.selectedElo - 1]!;
    const right =
      this.eloView === 'elo'
        ? `<section class="card edetail" data-keep-scroll="edetail">${this.eloDetail()}</section>`
        : `<section class="card cat-host">${catalogHtml(sim, this.cat, this.eloView, { slot, editable: this.editable() })}</section>`;
    return `<div class="grid elos">
      <section class="erail">${rail}<p class="rail-note">Cada Elo é uma tecla. Restrições sobem o nível efetivo; custo e recarga continuam os do Elo.</p></section>
      ${right}
    </div>`;
  }

  private eloDetail(): string {
    const sim = this.sim;
    const c = sim.c;
    const slot = c.elos[this.selectedElo - 1]!;
    const editable = this.editable();
    const tech = slot.technique ? TECHNIQUES[slot.technique as TechniqueId] : null;
    const lockNote = editable ? '' : `<div class="alert warn">Só dá para reconfigurar no santuário, fora de combate. Você ainda pode consultar tudo.</div>`;
    const fits = c.knownSpells.filter((id) => spellNeed(sim, id) <= slot.level).length;
    const head = (info: EffectiveInfo | null) => `<div class="ed-head">
        <h3>Elo ${slot.level} <kbd class="ek big" title="Tecla deste Elo">${SLOT_KEYS[slot.level - 1]}</kbd></h3>
        ${info ? `<div class="eff-big ${info.beyondLimit ? 'beyond' : ''}"><span>nível efetivo</span><b>${info.effective}</b>${info.beyondLimit ? '<em>Além-limite</em>' : ''}</div>` : ''}
      </div>`;
    if (!tech) {
      return `${head(null)}${lockNote}
        <div class="ed-sec"><h5>Magia</h5>
          <button class="socket spell empty" data-open="spells">
            <span class="sk-ic">${icon('plus', 26)}</span>
            <span class="sk-txt"><b>Escolher magia</b><small>${fits} das suas ${c.knownSpells.length} magias cabem neste Elo</small></span>
          </button>
        </div>
        <div class="ed-sec"><h5>Restrições</h5><p class="empty-note">Escolha uma magia primeiro: cada magia aceita Restrições diferentes.</p></div>`;
    }
    const info = sim.slotInfo(slot)!;
    const discount = modifierDiscount(c.mastery[tech.id]);
    const cost = Math.round(sim.slotCost(slot, info));
    const stats = [
      ['Potência', `×${info.power.toFixed(2)}`, 'pelo nível efetivo'],
      ['Pontos', `${info.points}`, 'de forja'],
      ['Custo', `${cost}`, `Fluxo · ${info.costPct}% do Elo ${slot.level}`],
      ['Recarga', `${sim.slotCooldown(slot, info).toFixed(1)} s`, `do Elo ${slot.level}`],
    ]
      .map(([k, v, s]) => `<div class="stat"><span>${k}</span><b>${v}</b><small>${s}</small></div>`)
      .join('');
    const color = AFFINITY_COLORS[tech.affinity];
    const spellSocket = `<div class="socket spell" style="--c:${color}">
        <button class="sk-main" data-open="spells" title="${editable ? 'Trocar a magia deste Elo' : 'Ver detalhes'}">
          <span class="sk-ic">${icon(tech.icon, 34)}</span>
          <span class="sk-txt"><b>${tech.name}</b><small>${tech.role} · <span style="color:${color}">${AFFINITY_NAMES[tech.affinity]}</span> · Maestria ${displayLevel(c.mastery[tech.id])}</small><span class="sk-desc">${tech.desc}</span></span>
          <span class="sk-cta">${editable ? 'Trocar' : 'Detalhes'}</span>
        </button>
        ${editable ? `<button class="sk-x" data-a="clear-spell" title="Esvaziar o Elo">${icon('x', 14)}</button>` : ''}
      </div>`;
    const sockets = Array.from({ length: info.maxRestrictions }, (_, i) => {
      const id = slot.restrictions[i];
      if (!id)
        return `<button class="socket pact empty" data-open="pacts">
          <span class="sk-ic">${icon('plus', 18)}</span><span class="sk-txt"><b>Restrição</b><small>${tech.pacts.length} compatíveis com ${tech.name}</small></span>
        </button>`;
      const d = PACTS[id];
      const v = d.value ? c.psyche.values[d.value] : 0;
      const valTag = d.value
        ? `<span class="val ${v >= STRONG_VALUE ? 'good' : v <= -STRONG_VALUE ? 'bad' : ''}" title="${v >= STRONG_VALUE ? 'Valor forte em você' : v <= -STRONG_VALUE ? 'Contra os seus valores: cada uso soma estresse' : 'Valor ligado a esta cláusula'}">${VALUE_NAMES[d.value]}</span>`
        : '';
      const aligned = info.alignedPact === id;
      return `<div class="socket pact filled ${d.oath ? 'oath' : ''} ${aligned ? 'aligned' : ''}">
          <button class="sk-main" data-open-pact="${id}" title="Ver detalhes">
            <span class="sk-lvl">+${d.level}${aligned ? '<i title="Alinhada a um valor forte: +1 nível">+1</i>' : ''}</span>
            <span class="sk-txt"><b>${d.name}</b><small>${d.oath ? 'Juramento' : 'Restrição'} ${valTag}</small><span class="sk-desc">${d.desc}</span></span>
          </button>
          ${editable ? `<button class="sk-x" data-rm-pact="${id}" title="Remover">${icon('x', 14)}</button>` : ''}
        </div>`;
    }).join('');
    return `${head(info)}
      ${lockNote}
      ${slot.sealed ? '<div class="alert bad">Elo selado por juramento quebrado. Medite em Silêncio no santuário para cumprir a penitência.</div>' : ''}
      <div class="ed-sec"><h5>Magia</h5>${spellSocket}</div>
      ${levelLadder(info)}
      <div class="stats">${stats}</div>
      <div class="ed-sec"><h5>Restrições <small>${slot.restrictions.length}/${info.maxRestrictions} · cada nível = +1 nível efetivo</small></h5>
        <div class="sockets">${sockets}</div></div>
      <div class="ed-sec"><h5>Forja <small>${discount ? `Maestria: −${discount} no custo de cada modificador` : 'clique nos pontos para distribuir'}</small></h5>
        ${forgeEqualizer(slot, info, tech, discount, editable)}</div>`;
  }

  // -------------------------------------------------------------------------
  // Grimório (consulta) e catálogo de escolha
  // -------------------------------------------------------------------------

  private codexTab(): string {
    return `<section class="card cat-host">${catalogHtml(this.sim, this.cat, this.codexKind, null)}</section>`;
  }

  /** Catálogo visível agora (e em que contexto), ou null. */
  private catalogNow(): { kind: CatalogKind; ctx: PickContext | null } | null {
    if (this.current === 'codex') return { kind: this.codexKind, ctx: null };
    if (this.current === 'elos' && this.eloView !== 'elo')
      return { kind: this.eloView, ctx: { slot: this.sim.c.elos[this.selectedElo - 1]!, editable: this.editable() } };
    return null;
  }

  private catalogMove(delta: number): void {
    const cur = this.catalogNow();
    if (!cur) return;
    const { list } = visibleEntries(this.sim, this.cat, cur.kind, cur.ctx);
    if (!list.length) return;
    const sel = cur.kind === 'spells' ? this.cat.selSpell : this.cat.selPact;
    const i = Math.max(0, list.findIndex((e) => e.id === sel));
    const next = list[Math.min(list.length - 1, Math.max(0, i + delta))]!.id;
    if (cur.kind === 'spells') this.cat.selSpell = next as SpellId;
    else this.cat.selPact = next as PactId;
    this.render();
    this.root.querySelector('.crow.sel')?.scrollIntoView({ block: 'nearest' });
  }

  /** Enter: a ação principal da ficha aberta (equipar, adicionar, remover). */
  private catalogPrimary(): void {
    this.root.querySelector<HTMLButtonElement>('.cd-actions [data-cat-act]:not(:disabled)')?.click();
  }

  private equipSpell(id: SpellId | null): void {
    const c = this.sim.c;
    const slot = c.elos[this.selectedElo - 1]!;
    if (id === slot.technique) return;
    // Cada magia ocupa um Elo só: troca de lugar se já estiver em outro.
    const other = id ? c.elos.find((s) => s !== slot && s.technique === id) : null;
    if (other) {
      other.technique = slot.technique;
      other.mods = {};
      sanitizeSlot(other);
    }
    slot.technique = id;
    slot.mods = {};
    sanitizeSlot(slot);
    this.sfx?.ui();
  }

  private setPact(id: PactId, on: boolean): void {
    const c = this.sim.c;
    const slot = c.elos[this.selectedElo - 1]!;
    if (!on) slot.restrictions = slot.restrictions.filter((x) => x !== id);
    else if (!canAddRestriction(slot, id) && slot.technique && SPELLS[slot.technique as SpellId].pacts.includes(id)) slot.restrictions.push(id);
    else return;
    const info = this.sim.slotInfo(slot);
    if (info && slot.technique) trimMods(slot, info, modifierDiscount(c.mastery[slot.technique as MasteryId]));
    this.sfx?.ui();
  }

  /** Teclas com o catálogo aberto (fora do campo de busca). Devolve true se consumiu. */
  handleKey(code: string): boolean {
    const cur = this.catalogNow();
    if (!cur) return false;
    if (code === 'ArrowDown' || code === 'ArrowUp') {
      this.catalogMove(code === 'ArrowDown' ? 1 : -1);
      return true;
    }
    if (code === 'Enter' || code === 'NumpadEnter') {
      this.catalogPrimary();
      return true;
    }
    if (code === 'Slash' || code === 'NumpadDivide' || code === 'IntlRo') {
      this.focusSearch();
      return true;
    }
    if (code === 'Escape' && cur.ctx) {
      this.eloView = 'elo';
      this.render();
      return true;
    }
    return false;
  }

  private focusSearch(): void {
    const el = this.root.querySelector<HTMLInputElement>('[data-search]');
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }

  private onSearchKey(e: KeyboardEvent): void {
    const el = e.target as HTMLElement;
    if (!el.matches('[data-search]')) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      this.catalogMove(e.key === 'ArrowDown' ? 1 : -1);
      this.focusSearch();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.catalogPrimary();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if ((el as HTMLInputElement).value) {
        this.setQuery('');
        this.focusSearch();
      } else (el as HTMLInputElement).blur();
    }
  }

  private setQuery(q: string): void {
    const cur = this.catalogNow();
    if (!cur) return;
    if (cur.kind === 'spells') this.cat.spellQuery = q;
    else this.cat.pactQuery = q;
    this.render();
  }

  private onFilterChange(e: Event): void {
    const el = e.target as HTMLSelectElement;
    const f = el.dataset.f;
    const cur = this.catalogNow();
    if (!f || !cur) return;
    if (f === 'sort') {
      if (cur.kind === 'spells') this.cat.spellSort = el.value as CatalogState['spellSort'];
      else this.cat.pactSort = el.value as CatalogState['pactSort'];
    } else if (f === 'role') this.cat.spellRole = el.value;
    else if (f === 'value') this.cat.pactValue = el.value as CatalogState['pactValue'];
    this.render();
  }

  // -------------------------------------------------------------------------
  // Maestria
  // -------------------------------------------------------------------------

  private masteryTab(): string {
    const c = this.sim.c;
    const aff = AFFINITY_COLORS[c.affinity];
    const id = this.selectedNode;
    const r = c.mastery[id];
    const lvl = displayLevel(r);
    const idle = this.sim.playTime - r.lastUsedAt;
    const graceLeft = Math.max(0, GRACE_PLAYED_S - idle);
    const nodes = buildConstellation(c.knownSpells);
    const node = nodes.find((n) => n.id === id) ?? nodes[0]!;
    const spell = isSpell(id) ? SPELLS[id] : null;
    const res = spell ? resonance(spell.tags, c.psyche.traits) : 1;
    const techRow =
      spell
        ? `<div class="kv"><span>Custo de Fluxo</span><b>${Math.round((1 - masteryCostMult(r)) * 100)}% mais barato</b></div>
           <div class="kv"><span>Modificadores</span><b>${modifierDiscount(r) ? `−${modifierDiscount(r)} ponto` : 'sem desconto (nível 5)'}</b></div>`
        : '';
    return `<div class="grid mastery">
      <section class="card const-card">
        <h4>Maestria <span class="hint-i" title="Você fica bom no que faz. Anel dourado: progresso do nível. Anel externo: Afiação.">?</span></h4>
        ${constellation(c.mastery, c.knownSpells, id, aff)}
        <div class="legend"><span><i class="lg prog" style="background:${aff}"></i>progresso do nível</span><span><i class="lg sharp"></i>Afiação</span><span class="muted">clique num nó para ver detalhes</span></div>
      </section>
      <section class="card mdetail">
        <div class="md-head"><span class="md-ic" style="color:${aff}">${icon(node.icon, 30)}</span><div><h3>${MASTERY_NAMES[id]}</h3><span class="muted">Nível ${lvl} de 20${r.peak >= lvl + 1 ? ` · pico ${Math.floor(r.peak)}` : ''}</span></div></div>
        <div class="bigbar"><i style="width:${(r.level - lvl) * 100}%;background:${aff}"></i></div>
        <p class="card-sub">${MASTERY_EFFECT[id]}</p>
        <div class="kv"><span>Afiação</span><b>${Math.round(r.sharpness * 100)}% · eficácia ×${sharpnessMult(r.sharpness).toFixed(2)}</b></div>
        ${techRow}
        <div class="kv"><span>Desuso</span><b>${graceLeft > 0 ? `protegido por mais ${Math.ceil(graceLeft / 3600)} h jogadas` : 'perdendo Afiação'}</b></div>
        <div class="kv"><span>Piso</span><b>nunca abaixo do nível ${Math.max(1, Math.floor(r.peak * 0.5))}</b></div>
        ${
          spell
            ? `<div class="note">
          <b>Ressonância</b>
          <p>${spell.name} é ${spell.tags.map((t) => NATURE_NAMES[t]).join(' e ')} — ${res > 1 ? 'ressoa com quem você é: custa menos e aprende mais rápido.' : res < 1 ? 'dissonante com quem você é: aprende pela metade.' : 'neutra com a sua personalidade.'}</p>
        </div>`
            : ''
        }
        <p class="tip">A Maestria sobe mais rápido sob risco real: inimigos mais fortes, vida baixa, elites por perto.</p>
      </section>
    </div>`;
  }

  // -------------------------------------------------------------------------
  // Ajuda e pausa
  // -------------------------------------------------------------------------

  private small(title: string, body: string): void {
    this.root.className = 'screen overlay';
    this.root.innerHTML = `<div class="win small"><header class="win-head"><h2>${title}</h2><button class="x" data-a="close" title="Fechar (Esc)">×</button></header><div class="win-body">${body}</div></div>`;
    this.root.onmousedown = (e) => {
      if (e.target === this.root) this.close();
    };
    this.root.onclick = (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
      if (a === 'close' || a === 'resume') this.close();
      if (a === 'help') this.open('help');
      if (a === 'quit') this.onQuit();
      if (a === 'end-playtest' && this.playtest) {
        this.playtestMsg = 'Gravando…';
        this.render();
        void this.playtest.finish().then((msg) => {
          this.playtestMsg = `${msg} Uma nova sessão começou.`;
          this.render();
        });
      }
      if (a === 'mute' && this.sfx) {
        this.sfx.toggleMute();
        this.render();
      }
    };
  }

  private renderHelp(): void {
    const rows: Array<[string, string]> = [
      ['WASD', 'Mover'],
      ['Mouse', 'Mirar'],
      ['Botão esquerdo · Espaço', 'Golpe básico'],
      ['Botão direito', 'Magia do Elo 1'],
      ['1 2 3 4 · Q E R F', 'Magias nos Elos 1 a 8'],
      ['Clique num NPC', 'Conversar'],
      ['Shift · Tab', 'Posturas: Silêncio, Olhar (toque de novo para sair)'],
      ['Roda do mouse · Z / X', 'Maré: «« « • » »» entre defesa (Véu) e ataque (Ímpeto)'],
      ['C · K · G · M · N', 'Psique · Grade de Elos · Grimório · Maestria · Mapa'],
      ['H · Esc', 'Ajuda · Pausa'],
    ];
    this.small(
      'Como jogar',
      `<div class="keys">${rows.map(([k, v]) => `<div><kbd>${k}</kbd><span>${v}</span></div>`).join('')}</div>
      <div class="tips">
        <div class="tipc">${icon('tide', 22)}<p>Quando o chão ficar vermelho sob você, gire a Maré para a defesa <b>no instante</b> do golpe: Maré perfeita.</p></div>
        <div class="tipc">${icon('gaze', 22)}<p>O Olhar revela Espreitadores em Sombra e armadilhas.</p></div>
        <div class="tipc">${icon('silence', 22)}<p>Medite no santuário em Silêncio para baixar o estresse antes que vire Crise.</p></div>
        <div class="tipc">${icon('signature', 22)}<p>A cada 3 acertos do Punho do Voto no mesmo alvo, o golpe ignora a armadura.</p></div>
      </div>`,
    );
  }

  private renderPause(): void {
    this.small(
      'Pausa',
      `<div class="actions col">
        <button class="btn primary" data-a="resume">Continuar</button>
        <button class="btn" data-a="help">Como jogar</button>
        <button class="btn" data-a="quit">Salvar e sair para o título</button>
      </div>
      <div class="audio-row">
        <span>Som</span>
        <input type="range" min="0" max="1" step="0.05" value="${this.sfx?.volume ?? 0.6}" data-vol/>
        <button class="btn" data-a="mute">${this.sfx?.muted ? 'Ligar' : 'Silenciar'}</button>
      </div>
      ${
        this.playtest
          ? `<div class="pt-pause">
        <b><span class="pt-rec"></span> Sessão de playtest</b>
        <p class="muted small">${escapeHtml(this.playtest.summary())}</p>
        <p class="muted small">Enter, durante o jogo, deixa uma anotação. Quando terminar de jogar, encerre: o relatório vai para a pasta <b>playtests/</b> do projeto.</p>
        <button class="btn" data-a="end-playtest">Encerrar sessão e gravar relatório</button>
        ${this.playtestMsg ? `<p class="small pt-msg">${escapeHtml(this.playtestMsg)}</p>` : ''}
      </div>`
          : ''
      }
      <p class="muted small" style="text-align:center;margin:10px 0 0">Tecla <kbd>\`</kbd> abre o painel de playtest.</p>`,
    );
    this.root.querySelector<HTMLInputElement>('[data-vol]')?.addEventListener('input', (e) => {
      this.sfx?.setVolume(+(e.target as HTMLInputElement).value);
      this.sfx?.ui();
    });
  }
}
