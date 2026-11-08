import { AFFINITY_COLORS, AFFINITY_NAMES, AFFINITY_RING, affinityPenalty, minSlotFor, type Affinity } from '../../sim/flow/affinity';
import { canAddRestriction, MODS, PACT_IDS, PACTS, type EloSlot, type PactId } from '../../sim/elos';
import { displayLevel } from '../../sim/mastery';
import { STRONG_VALUE, VALUE_IDS, VALUE_NAMES, type ValueId } from '../../sim/psyche/traits';
import type { Simulation } from '../../sim/sim';
import { NATURE_NAMES, resonance, SPELLS, type SpellId } from '../../sim/techniques';
import { countOverrides, PACT_LEVEL_MAX, PACT_LEVEL_MIN, pactDefault, SPELL_FIELDS, spellDefault } from '../../sim/overrides';
import { gmOverrides } from '../gm';
import { escapeHtml } from '../util';
import { pactPips } from './charts';
import { icon } from './icons';

/**
 * Catálogo de magias e Restrições. Feito para escalar a centenas de itens:
 * busca, filtros e ordenação em cima de uma lista compacta, e uma ficha detalhada
 * ao lado. O mesmo componente serve a dois usos:
 *  - Grimório (aba G): só consulta;
 *  - Grade de Elos: escolher a magia ou uma Restrição para um Elo (modo escolha).
 * Regras de UX:
 *  - no modo escolha, o que não cabe no Elo fica oculto (com contagem e botão para mostrar);
 *  - o que cabe mas está bloqueado agora (ex.: Elo cheio) aparece, apagado, com o motivo;
 *  - a ficha mostra o efeito no Elo antes de confirmar.
 */

export type CatalogKind = 'spells' | 'pacts';
export type SpellSort = 'need' | 'name' | 'affinity' | 'mastery';
export type PactSort = 'level' | 'name';

/** Em qual Elo a escolha cai. Sem contexto = só consulta. */
export interface PickContext {
  slot: EloSlot;
  editable: boolean;
}

export class CatalogState {
  spellQuery = '';
  spellAffinity: Affinity | 'all' = 'all';
  spellRole = 'all';
  spellSort: SpellSort = 'need';
  pactQuery = '';
  pactLevel = 0;
  pactKind: 'all' | 'restr' | 'oath' = 'all';
  pactValue: ValueId | 'none' | 'all' = 'all';
  pactSort: PactSort = 'level';
  /** mostra também o que não cabe no Elo (modo escolha) */
  showAll = false;
  selSpell: SpellId | null = null;
  selPact: PactId | null = null;

  resetFilters(kind: CatalogKind): void {
    if (kind === 'spells') {
      this.spellQuery = '';
      this.spellAffinity = 'all';
      this.spellRole = 'all';
    } else {
      this.pactQuery = '';
      this.pactLevel = 0;
      this.pactKind = 'all';
      this.pactValue = 'all';
    }
  }
}

export interface Entry<T extends string> {
  id: T;
  /** motivo para não poder escolher agora */
  why: string | null;
  /** não cabe neste Elo de jeito nenhum (fica oculto por padrão) */
  hide: boolean;
  /** já está neste Elo */
  on: boolean;
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export const spellNeed = (sim: Simulation, id: SpellId) => minSlotFor(sim.c.affinity, SPELLS[id].affinity, SPELLS[id].minLevel);

const whereEquipped = (sim: Simulation, id: SpellId) => sim.c.elos.find((e) => e.technique === id) ?? null;

// ---------------------------------------------------------------------------
// Listas filtradas
// ---------------------------------------------------------------------------

export function spellEntries(sim: Simulation, st: CatalogState, ctx: PickContext | null): { list: Entry<SpellId>[]; hidden: number } {
  const c = sim.c;
  const q = norm(st.spellQuery.trim());
  let list: Entry<SpellId>[] = c.knownSpells
    .filter((id) => {
      const s = SPELLS[id];
      if (st.spellAffinity !== 'all' && s.affinity !== st.spellAffinity) return false;
      if (st.spellRole !== 'all' && s.role !== st.spellRole) return false;
      return !q || norm(`${s.name} ${s.role} ${AFFINITY_NAMES[s.affinity]} ${s.desc}`).includes(q);
    })
    .map((id) => {
      const need = spellNeed(sim, id);
      const blocked = ctx !== null && ctx.slot.level < need;
      return { id, why: blocked ? `Precisa de Elo ${need} ou maior` : null, hide: blocked, on: ctx?.slot.technique === id };
    });
  const hidden = ctx && !st.showAll ? list.filter((e) => e.hide).length : 0;
  if (ctx && !st.showAll) list = list.filter((e) => !e.hide);
  const byName = (a: Entry<SpellId>, b: Entry<SpellId>) => SPELLS[a.id].name.localeCompare(SPELLS[b.id].name, 'pt');
  const ring = (id: SpellId) => AFFINITY_RING.indexOf(SPELLS[id].affinity);
  const lvl = (id: SpellId) => displayLevel(c.mastery[id]);
  list.sort((a, b) => {
    if (st.spellSort === 'need') return spellNeed(sim, a.id) - spellNeed(sim, b.id) || ring(a.id) - ring(b.id) || byName(a, b);
    if (st.spellSort === 'affinity') return ring(a.id) - ring(b.id) || byName(a, b);
    if (st.spellSort === 'mastery') return lvl(b.id) - lvl(a.id) || byName(a, b);
    return byName(a, b);
  });
  return { list, hidden };
}

function pactState(sim: Simulation, ctx: PickContext | null, id: PactId): { why: string | null; hide: boolean; on: boolean } {
  if (!ctx) return { why: null, hide: false, on: false };
  const slot = ctx.slot;
  if (slot.restrictions.includes(id)) return { why: null, hide: false, on: true };
  const spell = slot.technique ? SPELLS[slot.technique as SpellId] : null;
  if (!spell) return { why: 'Escolha uma magia para o Elo primeiro', hide: false, on: false };
  if (!spell.pacts.includes(id)) return { why: `Não combina com ${spell.name}`, hide: true, on: false };
  return { why: canAddRestriction(slot, id), hide: false, on: false };
}

export function pactEntries(sim: Simulation, st: CatalogState, ctx: PickContext | null): { list: Entry<PactId>[]; hidden: number } {
  const q = norm(st.pactQuery.trim());
  let list: Entry<PactId>[] = PACT_IDS.filter((id) => {
    const d = PACTS[id];
    if (st.pactLevel && d.level !== st.pactLevel) return false;
    if (st.pactKind === 'oath' && !d.oath) return false;
    if (st.pactKind === 'restr' && d.oath) return false;
    if (st.pactValue === 'none' && d.value !== null) return false;
    if (st.pactValue !== 'all' && st.pactValue !== 'none' && d.value !== st.pactValue) return false;
    return !q || norm(`${d.name} ${d.desc} ${d.onBreak} ${d.value ? VALUE_NAMES[d.value] : ''} ${d.oath ? 'juramento' : 'restricao'}`).includes(q);
  }).map((id) => ({ id, ...pactState(sim, ctx, id) }));
  const hidden = ctx && !st.showAll ? list.filter((e) => e.hide).length : 0;
  if (ctx && !st.showAll) list = list.filter((e) => !e.hide);
  list.sort((a, b) => {
    const byName = PACTS[a.id].name.localeCompare(PACTS[b.id].name, 'pt');
    // O que já está no Elo vem primeiro.
    if (a.on !== b.on) return a.on ? -1 : 1;
    return st.pactSort === 'level' ? PACTS[a.id].level - PACTS[b.id].level || byName : byName;
  });
  return { list, hidden };
}

/** Garante uma seleção visível; devolve a lista para quem renderiza. */
export function visibleEntries(sim: Simulation, st: CatalogState, kind: CatalogKind, ctx: PickContext | null) {
  if (kind === 'spells') {
    const r = spellEntries(sim, st, ctx);
    if (!r.list.some((e) => e.id === st.selSpell)) st.selSpell = r.list.find((e) => e.on)?.id ?? r.list[0]?.id ?? null;
    return r;
  }
  const r = pactEntries(sim, st, ctx);
  if (!r.list.some((e) => e.id === st.selPact)) st.selPact = r.list[0]?.id ?? null;
  return r;
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

const opt = (v: string, label: string, cur: string) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`;

export function catalogHtml(sim: Simulation, st: CatalogState, kind: CatalogKind, ctx: PickContext | null): string {
  const c = sim.c;
  const { list, hidden } = visibleEntries(sim, st, kind, ctx);
  const spells = kind === 'spells';
  const head = ctx
    ? `<button class="cat-back" data-a="back" title="Voltar ao Elo (Esc)">${icon('back', 16)}Elo ${ctx.slot.level}</button>
       <h4 class="cat-title">${spells ? 'Escolher magia' : 'Escolher Restrição'}</h4>`
    : `<div class="segs cat-kinds">
         <button class="seg ${spells ? 'on' : ''}" data-codex="spells">Magias <small>${c.knownSpells.length}</small></button>
         <button class="seg ${spells ? '' : 'on'}" data-codex="pacts">Restrições <small>${PACT_IDS.length}</small></button>
       </div>`;
  const sort = spells
    ? [opt('need', 'Elo mínimo', st.spellSort), opt('affinity', 'Afinidade', st.spellSort), opt('mastery', 'Maestria', st.spellSort), opt('name', 'Nome', st.spellSort)]
    : [opt('level', 'Nível', st.pactSort), opt('name', 'Nome', st.pactSort)];
  const query = spells ? st.spellQuery : st.pactQuery;
  const gm = !ctx && !!c.gm;
  const edits = gm ? countOverrides(gmOverrides) : 0;
  const gmTools = gm
    ? `<div class="gm-tools" title="Os ajustes valem para todos os personagens deste navegador e ficam salvos nele.">
        <span class="gm-badge">${icon('book', 13)} Mestre · ${edits ? `${edits} ajuste${edits > 1 ? 's' : ''}` : 'sem ajustes'}</span>
        <button class="link" data-gm="copy" ${edits ? '' : 'disabled'} title="Copia os ajustes em JSON (para mandar e virar padrão no código)">Copiar</button>
        <button class="link danger" data-gm="reset-all" ${edits ? '' : 'disabled'}>Restaurar tudo</button>
      </div>`
    : '';
  const bar = `<div class="cat-bar">${head}${gmTools}
      <label class="cat-search">${icon('search', 15)}<input type="text" data-search value="${escapeHtml(query)}" placeholder="Buscar ${spells ? 'magia' : 'Restrição'}…" autocomplete="off" spellcheck="false"><kbd>/</kbd></label>
      <label class="cat-sort">Ordenar<select data-f="sort">${sort.join('')}</select></label>
    </div>`;

  let filters: string;
  if (spells) {
    const roles = [...new Set(c.knownSpells.map((id) => SPELLS[id].role))].sort((a, b) => a.localeCompare(b, 'pt'));
    filters = `<div class="chips">${(['all', ...AFFINITY_RING] as const)
      .map(
        (a) =>
          `<button class="chip ${st.spellAffinity === a ? 'on' : ''}" data-f-aff="${a}" ${a === 'all' ? '' : `style="--c:${AFFINITY_COLORS[a]}"`}>${a === 'all' ? 'Todas' : `<i></i>${AFFINITY_NAMES[a]}`}</button>`,
      )
      .join('')}</div>
      <select data-f="role">${[opt('all', 'Todos os papéis', st.spellRole), ...roles.map((r) => opt(r, r, st.spellRole))].join('')}</select>`;
  } else {
    filters = `<div class="chips">${[0, 1, 2, 3, 4]
      .map((n) => `<button class="chip ${st.pactLevel === n ? 'on' : ''}" data-f-level="${n}">${n ? `+${n}` : 'Todos'}</button>`)
      .join('')}</div>
      <div class="chips">${(
        [
          ['all', 'Todas'],
          ['restr', 'Restrições'],
          ['oath', 'Juramentos'],
        ] as const
      )
        .map(([k, l]) => `<button class="chip ${st.pactKind === k ? 'on' : ''} ${k === 'oath' ? 'oath' : ''}" data-f-kind="${k}">${l}</button>`)
        .join('')}</div>
      <select data-f="value">${[opt('all', 'Qualquer valor', st.pactValue), ...VALUE_IDS.map((v) => opt(v, VALUE_NAMES[v], st.pactValue)), opt('none', 'Sem valor', st.pactValue)].join('')}</select>`;
  }

  const sel = spells ? st.selSpell : st.selPact;
  const rows = list.length
    ? list.map((e) => (spells ? spellRow(sim, e as Entry<SpellId>, sel === e.id, ctx, gm) : pactRow(e as Entry<PactId>, sel === e.id, gm))).join('')
    : `<div class="cat-empty">Nada encontrado.<button class="link" data-a="reset-filters">Limpar busca e filtros</button></div>`;
  const noun = spells ? (list.length === 1 ? 'magia' : 'magias') : list.length === 1 ? 'Restrição' : 'Restrições';
  const count = `<div class="cat-count"><span>${list.length} ${noun}</span>${
    hidden
      ? `<button class="link" data-a="show-all" title="${spells ? 'Pedem um Elo mais alto' : 'Não combinam com a magia deste Elo'}">+${hidden} ${spells ? 'não cabem neste Elo' : 'não combinam'} · mostrar</button>`
      : ctx && st.showAll
        ? `<button class="link" data-a="show-all">ocultar as que não servem</button>`
        : ''
  }</div>`;
  const detail = sel ? (spells ? spellDetail(sim, sel as SpellId, ctx, gm) : pactDetail(sim, sel as PactId, ctx, gm)) : `<p class="empty-note">Nada selecionado.</p>`;
  const keys = ctx
    ? `<kbd>↑</kbd><kbd>↓</kbd> navegar · <kbd>Enter</kbd> ${spells ? 'equipar' : 'adicionar / remover'} · <kbd>Esc</kbd> voltar`
    : `<kbd>↑</kbd><kbd>↓</kbd> navegar · <kbd>/</kbd> buscar`;
  return `<div class="cat ${ctx ? 'pick' : 'codex'} ${gm ? 'gm' : ''}" data-kind="${kind}">
    ${bar}
    <div class="cat-filters">${filters}</div>
    <div class="cat-main">
      <div class="cat-col">${count}<div class="cat-list" data-keep-scroll="cat-list" role="listbox">${rows}</div></div>
      <aside class="cat-detail" data-keep-scroll="cat-detail">${detail}</aside>
    </div>
    <div class="cat-keys">${keys}</div>
  </div>`;
}

const editedMark = '<i class="gm-dot" title="Ajustada pelo Mestre"></i>';

function spellRow(sim: Simulation, e: Entry<SpellId>, sel: boolean, ctx: PickContext | null, gm = false): string {
  const s = SPELLS[e.id];
  const need = spellNeed(sim, e.id);
  const where = whereEquipped(sim, e.id);
  const tag = where ? `<em class="tag ${ctx && where === ctx.slot ? 'here' : ''}">${ctx && where === ctx.slot ? 'neste Elo' : `Elo ${where.level}`}</em>` : '';
  return `<button class="crow ${sel ? 'sel' : ''} ${e.why ? 'blocked' : ''}" data-pick="${e.id}" role="option" aria-selected="${sel}" style="--c:${AFFINITY_COLORS[s.affinity]}" title="${escapeHtml(e.why ?? '')}">
    <span class="cr-ic">${icon(s.icon, 20)}</span>
    <span class="cr-txt"><b>${s.name}${gm && gmOverrides.spells[e.id] ? editedMark : ''}</b><small>${s.role} · ${AFFINITY_NAMES[s.affinity]}</small></span>
    <span class="cr-tags">${tag}<span class="need ${e.why ? 'bad' : need > 1 ? 'up' : ''}">${e.why ? icon('lock', 11) : ''}Elo ${need}+</span></span>
  </button>`;
}

function pactRow(e: Entry<PactId>, sel: boolean, gm = false): string {
  const d = PACTS[e.id];
  return `<button class="crow pact ${sel ? 'sel' : ''} ${e.why ? 'blocked' : ''} ${d.oath ? 'oath' : ''}" data-pick="${e.id}" role="option" aria-selected="${sel}" title="${escapeHtml(e.why ?? '')}">
    <span class="cr-lvl">+${d.level}</span>
    <span class="cr-txt"><b>${d.name}${gm && gmOverrides.pacts[e.id] ? editedMark : ''}</b><small>${d.oath ? 'Juramento' : 'Restrição'}${d.value ? ` · ${VALUE_NAMES[d.value]}` : ''}</small></span>
    <span class="cr-tags">${e.on ? '<em class="tag here">neste Elo</em>' : ''}${pactPips(d.level)}</span>
  </button>`;
}

const stat = (k: string, v: string, s = '') => `<div class="stat"><span>${k}</span><b>${v}</b>${s ? `<small>${s}</small>` : ''}</div>`;

/** Campo numérico do Mestre: − valor + e o padrão do código quando alterado. */
function gmField(field: string, label: string, value: number, def: number, step: number, min: number, max: number, unit: string, hint: string): string {
  const changed = value !== def;
  return `<label class="gm-field ${changed ? 'changed' : ''}" title="${escapeHtml(hint)}">
    <span class="gf-label">${label}${unit ? ` <small>${unit}</small>` : ''}</span>
    <span class="gf-step">
      <button type="button" data-gm-step="${field}" data-d="-1" ${value <= min ? 'disabled' : ''} aria-label="Diminuir">−</button>
      <input type="text" inputmode="decimal" data-gm-field="${field}" value="${String(value).replace('.', ',')}" aria-label="${label}" autocomplete="off" spellcheck="false">
      <button type="button" data-gm-step="${field}" data-d="1" ${value >= max ? 'disabled' : ''} aria-label="Aumentar">+</button>
    </span>
    <small class="gf-def">${changed ? `padrão ${String(def).replace('.', ',')}` : '&nbsp;'}</small>
  </label>`;
}

function spellDetail(sim: Simulation, id: SpellId, ctx: PickContext | null, gm = false): string {
  const c = sim.c;
  const s = SPELLS[id];
  const color = AFFINITY_COLORS[s.affinity];
  const need = spellNeed(sim, id);
  const pen = affinityPenalty(c.affinity, s.affinity);
  const where = whereEquipped(sim, id);
  const res = resonance(s.tags, c.psyche.traits);
  const resText =
    res > 1 ? 'Forte: combina com quem você é, a Maestria sobe mais rápido.' : res < 1 ? 'Fraca: vai contra quem você é, a Maestria sobe devagar.' : 'Neutra.';

  let preview = '';
  let action = '';
  if (ctx) {
    const slot = ctx.slot;
    const blocked = slot.level < need;
    if (!blocked) {
      const kept = slot.restrictions.filter((p) => s.pacts.includes(p));
      const temp: EloSlot = { ...slot, technique: id, restrictions: kept, mods: slot.technique === id ? slot.mods : {} };
      const info = sim.slotInfo(temp)!;
      const lost = slot.restrictions.length - kept.length;
      preview = `<div class="cd-preview">
        <div class="pv-main"><span>No Elo ${slot.level}</span><b>nível ${info.effective}</b>${info.beyondLimit ? '<em>Além-limite</em>' : ''}</div>
        <div class="pv-stats">${stat('Potência', `×${info.power.toFixed(2)}`)}${stat('Custo', `${Math.round(sim.slotCost(temp, info))}`, 'Fluxo')}${stat('Recarga', `${sim.slotCooldown(temp, info).toFixed(1)} s`)}${stat('Forja', `${info.points}`, 'pontos')}</div>
        ${lost ? `<p class="pv-warn">${lost} Restrição(ões) do Elo não combinam com ${s.name} e sairão.</p>` : ''}
        ${slot.technique && slot.technique !== id && Object.keys(slot.mods).length ? '<p class="pv-warn">A forja deste Elo será zerada.</p>' : ''}
      </div>`;
    }
    if (blocked) action = `<button class="btn" disabled>${icon('lock', 14)} Precisa de Elo ${need}+</button>`;
    else if (!ctx.editable) action = `<button class="btn" disabled>${icon('lock', 14)} Só no santuário, fora de combate</button>`;
    else if (slot.technique === id) action = `<button class="btn" disabled>Equipada neste Elo</button><button class="btn ghost" data-cat-act="clear">Esvaziar o Elo</button>`;
    else if (where) action = `<button class="btn primary" data-cat-act="equip">Trocar com o Elo ${where.level}</button>`;
    else action = `<button class="btn primary" data-cat-act="equip">Equipar no Elo ${slot.level}</button>`;
  }

  const pacts = (gm ? [...PACT_IDS] : s.pacts)
    .map((p) => {
      const d = PACTS[p];
      if (gm) {
        const on = s.pacts.includes(p);
        return `<button class="mchip toggle ${on ? 'on' : ''} ${d.oath ? 'oath' : ''}" data-gm-pact="${p}" title="${on ? 'Compatível: clique para tirar' : 'Clique para tornar compatível'}">${on ? '✓' : '+'} +${d.level} ${d.name}</button>`;
      }
      return ctx
        ? `<span class="mchip ${d.oath ? 'oath' : ''}">+${d.level} ${d.name}</span>`
        : `<button class="mchip link ${d.oath ? 'oath' : ''}" data-goto-pact="${p}">+${d.level} ${d.name}</button>`;
    })
    .join('');
  return `<div class="cd-head" style="--c:${color}">
      <span class="cd-art">${icon(s.icon, 40)}</span>
      <div><h3>${s.name}</h3><p>${s.role} · <b style="color:${color}">${AFFINITY_NAMES[s.affinity]}</b>${s.tags.length ? ` · ${s.tags.map((t) => NATURE_NAMES[t]).join(', ')}` : ''}</p></div>
    </div>
    <p class="cd-desc">${s.desc}</p>
    ${
      gm
        ? `<div class="gm-box">
        <div class="gm-head"><b>${icon('book', 14)} Valores da magia</b>${gmOverrides.spells[id] ? `<button class="link" data-gm="reset-spell">Restaurar padrão</button>` : '<small>iguais ao código</small>'}</div>
        <div class="gm-fields">${SPELL_FIELDS.map((f) => gmField(f.key, f.label, s[f.key], spellDefault(id)[f.key], f.step, f.min, f.max, f.unit, f.hint)).join('')}</div>
        <p class="gm-note">Elo mínimo para você: ${need}. Os ajustes valem na hora, para todos os personagens deste navegador.</p>
      </div>`
        : `<div class="stats">${stat('Dano base', s.baseDamage ? `${s.baseDamage}` : '—')}${stat('Alcance', s.range ? `${s.range} m` : '—')}${stat('Raio', s.radius ? `${s.radius} m` : '—')}${stat('Elo mínimo', `${need}`, 'para você')}</div>`
    }
    <dl class="cd-facts">
      <div><dt>Afinidade</dt><dd>${pen ? `Fora da sua: −${pen} no nível efetivo` : 'A sua: sem penalidade'}</dd></div>
      <div><dt>Maestria</dt><dd>Nível ${displayLevel(c.mastery[id])}</dd></div>
      <div><dt>Ressonância</dt><dd>${resText}</dd></div>
      <div><dt>Equipada</dt><dd>${where ? `Elo ${where.level}` : 'Não'}</dd></div>
    </dl>
    ${preview}
    <h6 class="cd-sub">Forja <small>${s.mods.length} modificadores</small></h6>
    <div class="cd-chips">${s.mods.map((m) => `<span class="mchip" title="${escapeHtml(MODS[m].desc)}">${icon(m, 13)}${MODS[m].name}</span>`).join('')}</div>
    <h6 class="cd-sub">Restrições compatíveis <small>${s.pacts.length}${gm ? ` de ${PACT_IDS.length} · clique para ligar/desligar` : ''}</small></h6>
    <div class="cd-chips">${pacts}</div>
    <div class="cd-spacer"></div>
    ${action ? `<div class="cd-actions">${action}</div>` : ''}`;
}

function pactDetail(sim: Simulation, id: PactId, ctx: PickContext | null, gm = false): string {
  const c = sim.c;
  const d = PACTS[id];
  const v = d.value ? c.psyche.values[d.value] : 0;
  const valueText = d.value
    ? `${VALUE_NAMES[d.value]}: ${
        v >= STRONG_VALUE
          ? '<span class="good">forte em você</span>. A primeira Restrição alinhada de um Elo conta +1 nível.'
          : v <= -STRONG_VALUE
            ? '<span class="bad">contra os seus valores</span>. Cada uso soma estresse.'
            : 'neutro em você.'
      }`
    : 'Nenhum valor ligado.';
  const compatible = c.knownSpells.filter((s) => SPELLS[s].pacts.includes(id));

  let preview = '';
  let action = '';
  if (ctx) {
    const slot = ctx.slot;
    const st = pactState(sim, ctx, id);
    const now = sim.slotInfo(slot);
    if (now) {
      const next = sim.slotInfo({ ...slot, restrictions: st.on ? slot.restrictions.filter((x) => x !== id) : [...slot.restrictions, id] })!;
      if (!st.why || st.on)
        preview = `<div class="cd-preview">
          <div class="pv-main"><span>Elo ${slot.level}${st.on ? ' sem ela' : ''}</span><b>nível ${now.effective} → ${next.effective}</b>${next.beyondLimit ? '<em>Além-limite</em>' : ''}</div>
          <div class="pv-stats">${stat('Potência', `×${next.power.toFixed(2)}`)}${stat('Forja', `${next.points}`, 'pontos')}${stat('Restrições', `${slot.restrictions.length + (st.on ? -1 : 1)}/${now.maxRestrictions}`)}</div>
          ${next.effective === now.effective && !st.on ? '<p class="pv-warn">O Elo já está no teto de Restrições (+4) ou do nível 12: não sobe mais.</p>' : ''}
        </div>`;
    }
    if (!ctx.editable) action = `<button class="btn" disabled>${icon('lock', 14)} Só no santuário, fora de combate</button>`;
    else if (st.on) action = `<button class="btn danger" data-cat-act="remove">Remover do Elo ${slot.level}</button>`;
    else if (st.why) action = `<button class="btn" disabled>${icon('lock', 14)} ${st.why}</button>`;
    else action = `<button class="btn primary" data-cat-act="add">Adicionar ao Elo ${slot.level}</button>`;
  }

  const spells = compatible
    .map((s) =>
      ctx
        ? `<span class="mchip" style="--c:${AFFINITY_COLORS[SPELLS[s].affinity]}">${icon(SPELLS[s].icon, 13)}${SPELLS[s].name}</span>`
        : `<button class="mchip link" data-goto-spell="${s}" style="--c:${AFFINITY_COLORS[SPELLS[s].affinity]}">${icon(SPELLS[s].icon, 13)}${SPELLS[s].name}</button>`,
    )
    .join('');
  return `<div class="cd-head pact ${d.oath ? 'oath' : ''}">
      <span class="cd-lvl">+${d.level}</span>
      <div><h3>${d.name}</h3><p>${d.oath ? 'Juramento: pode ser quebrado' : 'Restrição: só deixa de se aplicar'} · ${pactPips(d.level)}</p></div>
    </div>
    ${
      gm
        ? `<div class="gm-box">
        <div class="gm-head"><b>${icon('book', 14)} Valores da Restrição</b>${gmOverrides.pacts[id] ? `<button class="link" data-gm="reset-pact">Restaurar padrão</button>` : '<small>iguais ao código</small>'}</div>
        <div class="gm-fields">${gmField('level', 'Nível', d.level, pactDefault(id).level, 1, PACT_LEVEL_MIN, PACT_LEVEL_MAX, '', 'Quanto a Restrição soma ao nível efetivo do Elo (+1 a +4).')}</div>
        <p class="gm-note">Elos com esta Restrição recalculam o nível efetivo na hora; a forja excedente é devolvida.</p>
      </div>`
        : ''
    }
    <div class="cd-rule"><h6>Regra</h6><p>${d.desc}</p></div>
    <div class="cd-rule ${d.oath ? 'oath' : ''}"><h6>Se quebrar</h6><p>${d.onBreak}</p></div>
    <dl class="cd-facts">
      <div><dt>Nível efetivo</dt><dd>+${d.level} no Elo onde estiver</dd></div>
      <div><dt>Valor</dt><dd>${valueText}</dd></div>
    </dl>
    ${preview}
    <h6 class="cd-sub">Magias compatíveis <small>${compatible.length} de ${c.knownSpells.length} conhecidas</small></h6>
    <div class="cd-chips">${spells || '<span class="empty-note">Nenhuma das suas magias aceita esta Restrição.</span>'}</div>
    <div class="cd-spacer"></div>
    ${action ? `<div class="cd-actions">${action}</div>` : ''}`;
}
