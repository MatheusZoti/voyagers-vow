import { AFFINITY_COLORS, AFFINITY_DESC, AFFINITY_NAMES, minSlotFor } from '../../sim/flow/affinity';
import { canAddRestriction, PACT_IDS, PACTS, trimMods, type ModId, type PactId } from '../../sim/elos';
import { xpToNext } from '../../sim/character';
import { displayLevel, GRACE_PLAYED_S, masteryCostMult, modifierDiscount, sharpnessMult } from '../../sim/mastery';
import { EMOTION_COLORS, EMOTION_NAMES, type Emotion } from '../../sim/psyche/emotions';
import { CRISIS_DESC, CRISIS_NAMES } from '../../sim/psyche/psyche';
import { TRAIT_GROUPS, VALUE_NAMES } from '../../sim/psyche/traits';
import type { Simulation } from '../../sim/sim';
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
import type { Sfx } from '../sfx';
import { escapeHtml } from '../util';
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
import { icon } from './icons';

export type TabId = 'psyche' | 'elos' | 'mastery';
export type PanelId = TabId | 'help' | 'pause';

const TABS: Array<{ id: TabId; name: string; key: string }> = [
  { id: 'psyche', name: 'Psique', key: 'C' },
  { id: 'elos', name: 'Grade de Elos', key: 'K' },
  { id: 'mastery', name: 'Maestria', key: 'M' },
];

const GROUP_COLORS: Record<string, string> = {
  Temperamento: '#ff7a6a',
  Mente: '#6fd0ff',
  Social: '#7ee0a8',
  'Ambição': '#e2b65a',
};

const SPELL_MASTERY = '+2% de efeito por nível; −1,5% de custo de Fluxo por nível; −1 no custo dos modificadores a cada 5 níveis.';

const MASTERY_EFFECT: Record<MasteryId, string> = {
  ...(Object.fromEntries(SPELL_IDS.map((id) => [id, SPELL_MASTERY])) as Record<SpellId, string>),
  point: 'Crítico mais forte (+0,1x por nível); −1,5% de custo por nível.',
  basic: '+3% de dano do golpe básico por nível.',
  veil: '+0,5% de redução de dano no Véu por nível.',
  silence: 'Inimigos te percebem de mais perto (−2% do raio por nível). Sobe passando despercebido perto de inimigos e meditando.',
  impetus: 'Sobe sustentando o Ímpeto em combate.',
  gaze: 'Sobe revelando inimigos em Sombra e armadilhas.',
  tide: '+4% de velocidade da Maré por nível. Sobe com Marés perfeitas.',
  capacity: '+4 de reserva de Fluxo por nível. Sobe sustentando o Ímpeto.',
};

/** Janela do personagem (abas) e menus de ajuda e pausa. O jogo pausa enquanto ela está aberta. */
export class Panels {
  current: PanelId | null = null;
  onClose: () => void = () => {};
  onQuit: () => void = () => {};
  sfx: Sfx | null = null;
  private selectedElo = 2;
  private selectedNode: MasteryId = 'basic';

  constructor(
    private root: HTMLElement,
    private sim: Simulation,
  ) {}

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
    const body = tab === 'psyche' ? this.psycheTab() : tab === 'elos' ? this.elosTab() : this.masteryTab();
    const prev = this.root.querySelector<HTMLElement>('.win:not(.small)');
    const scroll = prev?.dataset.cur === tab ? (prev.querySelector('.win-body')?.scrollTop ?? 0) : 0;
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
        <div class="win-body">${body}</div>
      </div>`;
    const wb = this.root.querySelector('.win-body');
    if (wb) wb.scrollTop = scroll;
    this.root.onmousedown = (e) => {
      if (e.target === this.root) this.close();
    };
    this.root.onclick = (e) => this.onClick(e);
  }

  private onClick(e: MouseEvent): void {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-tab],[data-a],[data-elo],[data-tech],[data-pact],[data-mod],[data-node]');
    if (!t) return;
    const c = this.sim.c;
    if (t.dataset.a === 'close') return this.close();
    if (t.dataset.tab) return this.open(t.dataset.tab as TabId);
    if (t.dataset.node) {
      this.selectedNode = t.dataset.node as MasteryId;
      return this.render();
    }
    if (t.dataset.elo) {
      this.selectedElo = +t.dataset.elo;
      return this.render();
    }
    if (!this.editable() || (t as HTMLButtonElement).disabled) return;
    const slot = c.elos[this.selectedElo - 1]!;
    if (t.dataset.tech !== undefined) {
      const val = (t.dataset.tech || null) as TechniqueId | null;
      if (val === slot.technique) return;
      // Cada técnica ocupa um Elo só: troca de lugar se já estiver em outro.
      const other = c.elos.find((s) => s !== slot && s.technique === val && val);
      if (other) {
        other.technique = slot.technique;
        other.mods = {};
        sanitizeSlot(other);
      }
      slot.technique = val;
      slot.mods = {};
      sanitizeSlot(slot);
      return this.render();
    }
    if (t.dataset.pact) {
      const id = t.dataset.pact as PactId;
      if (slot.restrictions.includes(id)) slot.restrictions = slot.restrictions.filter((x) => x !== id);
      else if (!canAddRestriction(slot, id)) slot.restrictions.push(id);
      else return;
      const info = this.sim.slotInfo(slot);
      if (info && slot.technique) trimMods(slot, info, modifierDiscount(c.mastery[slot.technique as MasteryId]));
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
    return `<div class="grid psy">
      <section class="card wheel-card">
        <h4>Agora</h4>
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
        <h4>Afinidade <em>${AFFINITY_NAMES[c.affinity]}</em></h4>
        <p class="card-sub">${AFFINITY_DESC[c.affinity]} Técnicas de outras afinidades perdem nível pela distância no hexágono.</p>
        ${affinityRadar(c)}
      </section>
      <section class="card traits-card">
        <h4>Personalidade <span class="hint-i" title="Passe o mouse em cada linha para ler a frase. Memórias marcantes deslocam os traços aos poucos.">?</span></h4>
        <div class="tgrid">${groups}</div>
      </section>
      <section class="card values-card">
        <h4>Valores</h4>
        <p class="card-sub">Agir a favor de um valor traz emoção boa; contra, culpa ou raiva. Valores fortes reforçam Pactos alinhados.</p>
        ${valuesEqualizer(p.values)}
      </section>
      <section class="card mem-card">
        <h4>Memórias</h4>
        <div class="mem-cols"><div><h6>Recentes</h6>${memList(p.shortMemory, false)}</div><div><h6>Marcantes</h6>${memList(p.longMemory, true)}</div></div>
      </section>
    </div>`;
  }

  // -------------------------------------------------------------------------
  // Grade de Elos
  // -------------------------------------------------------------------------

  private elosTab(): string {
    const sim = this.sim;
    const c = sim.c;
    if (!c.elos[this.selectedElo - 1]?.unlocked) this.selectedElo = c.elos.find((e) => e.unlocked)?.level ?? 1;
    const cards = c.elos
      .map((slot) => {
        const tech = slot.technique ? TECHNIQUES[slot.technique as TechniqueId] : null;
        const info = slot.unlocked && tech ? sim.slotInfo(slot) : null;
        const sel = slot.level === this.selectedElo;
        const art = !slot.unlocked ? 'lock' : slot.sealed ? 'seal' : tech ? tech.icon : 'empty';
        const unlockHint = { 3: 'nível 3', 4: 'nível 5', 5: 'vencer o Guardião' }[slot.level] ?? 'mais adiante';
        return `<button class="ecard ${sel ? 'sel' : ''} ${slot.unlocked ? '' : 'locked'} ${info?.beyondLimit ? 'beyond' : ''} ${slot.sealed ? 'sealed' : ''}" data-elo="${slot.level}" ${slot.unlocked ? '' : 'disabled'}>
          <span class="e-num">Elo ${slot.level}</span>
          ${info ? `<span class="e-eff ${info.effective > slot.level ? 'up' : info.effective < slot.level ? 'down' : ''}">${info.effective}</span>` : ''}
          <span class="e-name">${!slot.unlocked ? 'Bloqueado' : slot.sealed ? 'Selado' : tech ? tech.name : 'Vazio'}</span>
          <span class="e-art" ${tech ? `style="color:${AFFINITY_COLORS[tech.affinity]}"` : ''}>${icon(art, 64)}</span>
          <span class="e-foot">${
            !slot.unlocked
              ? `Libera: ${unlockHint}`
              : info
                ? `${slot.restrictions.length ? `${slot.restrictions.length} Restr.` : 'sem Restrições'} · ${info.pointsUsed}/${info.points} pts`
                : 'escolha uma magia'
          }</span>
        </button>`;
      })
      .join('');
    return `<div class="grid elos">
      <section class="ecards">${cards}</section>
      <section class="card edetail">${this.eloDetail()}</section>
    </div>`;
  }

  private eloDetail(): string {
    const sim = this.sim;
    const c = sim.c;
    const slot = c.elos[this.selectedElo - 1]!;
    const editable = this.editable();
    const tech = slot.technique ? TECHNIQUES[slot.technique as TechniqueId] : null;
    // Grimório: magias conhecidas, com o Elo mínimo de cada uma (1 + distância no pentágono).
    const techPick =
      `<button class="gspell empty ${slot.technique ? '' : 'on'}" data-tech="" ${editable ? '' : 'disabled'}>${icon('empty', 18)}<span class="gs-name">Vazio</span></button>` +
      c.knownSpells
        .map((id) => {
          const s = SPELLS[id];
          const on = slot.technique === id;
          const need = minSlotFor(c.affinity, s.affinity, s.minLevel);
          const blocked = slot.level < need;
          const where = c.elos.find((x) => x !== slot && x.technique === id);
          const title = blocked ? `Precisa de Elo ${need}+ (${AFFINITY_NAMES[s.affinity]})` : where ? `Está no Elo ${where.level}: troca de lugar` : s.desc;
          return `<button class="gspell ${on ? 'on' : ''} ${blocked ? 'blocked' : ''}" data-tech="${id}" ${!editable || blocked ? 'disabled' : ''} title="${escapeHtml(title)}" style="--c:${AFFINITY_COLORS[s.affinity]}">
            <span class="gs-ic">${icon(s.icon, 18)}</span>
            <span class="gs-name">${s.name}</span>
            <span class="gs-meta">${s.role} · ${AFFINITY_NAMES[s.affinity]}</span>
            <span class="gs-need ${need > 1 ? 'up' : ''}">${blocked ? icon('lock', 12) : ''}Elo ${need}+</span>
            ${where ? `<small class="gs-where">no Elo ${where.level}</small>` : ''}
          </button>`;
        })
        .join('');
    const lockNote = editable ? '' : `<div class="alert warn">Só dá para reconfigurar no santuário, fora de combate.</div>`;
    if (!tech) {
      return `<div class="ed-head"><h3>Elo ${slot.level}</h3></div>${lockNote}<h5 class="gtitle">Grimório</h5><div class="grimoire">${techPick}</div>
        <p class="empty-note">Escolha uma magia para este Elo. Magias de outras afinidades pedem Elos mais altos.</p>`;
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
    const pacts = PACT_IDS.filter((id) => tech.pacts.includes(id))
      .map((id) => {
        const d = PACTS[id];
        const on = slot.restrictions.includes(id);
        const why = on ? null : canAddRestriction(slot, id);
        const aligned = d.value && c.psyche.values[d.value] >= 25;
        const contrary = d.value && c.psyche.values[d.value] <= -25;
        return `<button class="pact-card ${on ? 'on' : ''} ${d.oath ? 'oath' : ''}" data-pact="${id}" ${!editable || (why && !on) ? 'disabled' : ''} title="${escapeHtml(why ?? '')}">
          <span class="pc-top">${pactPips(d.level)}<b>+${d.level}</b>${d.oath ? '<em>juramento</em>' : ''}${
            d.value
              ? `<span class="val ${aligned ? 'good' : contrary ? 'bad' : ''}" title="${aligned ? 'Valor forte: a primeira Restrição alinhada conta +1 nível' : contrary ? 'Contra os seus valores: cada uso soma estresse' : 'Valor ligado a esta cláusula'}">${VALUE_NAMES[d.value]}</span>`
              : ''
          }</span>
          <span class="pc-name">${d.name}</span>
          <span class="pc-desc">${d.desc}</span>
        </button>`;
      })
      .join('');
    const slotsDots = Array.from({ length: info.maxRestrictions }, (_, i) => `<i class="${i < slot.restrictions.length ? 'on' : ''}"></i>`).join('');
    return `<div class="ed-head">
        <h3>Elo ${slot.level}</h3>
        <div class="eff-big ${info.beyondLimit ? 'beyond' : ''}"><span>nível efetivo</span><b>${info.effective}</b>${info.beyondLimit ? '<em>Além-limite</em>' : ''}</div>
      </div>
      ${lockNote}
      ${slot.sealed ? '<div class="alert bad">Elo selado por juramento quebrado. Medite em Silêncio no santuário para cumprir a penitência.</div>' : ''}
      <h5 class="gtitle">Grimório</h5><div class="grimoire">${techPick}</div>
      <p class="card-sub"><b style="color:${AFFINITY_COLORS[tech.affinity]}">${tech.name}</b> · ${tech.role} de ${AFFINITY_NAMES[tech.affinity]}. ${tech.desc}</p>
      ${levelLadder(info)}
      <div class="stats">${stats}</div>
      <div class="ed-sec"><h5>Restrições <span class="slots">${slotsDots}</span><small>${slot.restrictions.length}/${info.maxRestrictions} · cada nível = +1 nível efetivo</small></h5>
        <div class="pacts">${pacts}</div></div>
      <div class="ed-sec"><h5>Forja <small>${discount ? `Maestria: −${discount} no custo de cada modificador` : 'clique nos pontos para distribuir'}</small></h5>
        ${forgeEqualizer(slot, info, tech, discount, editable)}</div>`;
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
      ['Q E R F T', 'Magias nos Elos 1 a 5'],
      ['Clique num NPC', 'Conversar'],
      ['1 2 3 4', 'Posturas: Véu, Silêncio, Ímpeto, Olhar'],
      ['Roda do mouse · Z / X', 'Maré: mais defesa / mais ataque'],
      ['C · K · M', 'Psique · Grade de Elos · Maestria'],
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
      <p class="muted small" style="text-align:center;margin:10px 0 0">Tecla <kbd>\`</kbd> abre o painel de playtest.</p>`,
    );
    this.root.querySelector<HTMLInputElement>('[data-vol]')?.addEventListener('input', (e) => {
      this.sfx?.setVolume(+(e.target as HTMLInputElement).value);
      this.sfx?.ui();
    });
  }
}
