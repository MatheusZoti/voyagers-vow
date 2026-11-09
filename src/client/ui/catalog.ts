import { AFFINITY_COLORS, AFFINITY_NAMES, AFFINITY_RING, minSlotFor, type Affinity } from '../../sim/flow/affinity';
import { canAddRestriction, ELO_TABLE, MOD_IDS, MODS, PACT_IDS, PACTS, type EloSlot, type ModId, type PactId } from '../../sim/elos';
import { displayLevel } from '../../sim/mastery';
import { STRONG_VALUE, VALUE_IDS, VALUE_NAMES, type ValueId } from '../../sim/psyche/traits';
import type { Simulation } from '../../sim/sim';
import { NATURE_NAMES, resonance, SPELL_RULES, SPELLS, type SpellDef, type SpellId } from '../../sim/techniques';
import { escapeHtml, hintTip } from '../util';
import { affinityRadar, pactPips } from './charts';
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
      const why = ctx ? sim.equipProblem(ctx.slot.level, id) : null;
      return { id, why, hide: why !== null, on: ctx?.slot.technique === id };
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
  return { why: canAddRestriction(slot, id, sim.maxPactLevel(spell.id)), hide: false, on: false };
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
  const bar = `<div class="cat-bar">${head}
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
    ? list.map((e) => (spells ? spellRow(sim, e as Entry<SpellId>, sel === e.id, ctx) : pactRow(e as Entry<PactId>, sel === e.id))).join('')
    : `<div class="cat-empty">Nada encontrado.<button class="link" data-a="reset-filters">Limpar busca e filtros</button></div>`;
  const noun = spells ? (list.length === 1 ? 'magia' : 'magias') : list.length === 1 ? 'Restrição' : 'Restrições';
  const count = `<div class="cat-count"><span>${list.length} ${noun}</span>${
    hidden
      ? `<button class="link" data-a="show-all" title="${spells ? 'Pedem um Elo mais alto' : 'Não combinam com a magia deste Elo'}">+${hidden} ${spells ? 'não cabem neste Elo' : 'não combinam'} · mostrar</button>`
      : ctx && st.showAll
        ? `<button class="link" data-a="show-all">ocultar as que não servem</button>`
        : ''
  }</div>`;
  const detail = sel ? (spells ? spellDetail(sim, sel as SpellId, ctx) : pactDetail(sim, sel as PactId, ctx)) : `<p class="empty-note">Nada selecionado.</p>`;
  const keys = ctx
    ? `<kbd>↑</kbd><kbd>↓</kbd> navegar · <kbd>Enter</kbd> ${spells ? 'equipar' : 'adicionar / remover'} · <kbd>Esc</kbd> voltar`
    : `<kbd>↑</kbd><kbd>↓</kbd> navegar · <kbd>/</kbd> buscar`;
  return `<div class="cat ${ctx ? 'pick' : 'codex'}" data-kind="${kind}">
    ${bar}
    <div class="cat-filters">${filters}</div>
    <div class="cat-main">
      <div class="cat-col">${!ctx && spells ? buildCard(sim) : ''}${count}<div class="cat-list" data-keep-scroll="cat-list" role="listbox">${rows}</div></div>
      <aside class="cat-detail" data-keep-scroll="cat-detail">${detail}</aside>
    </div>
    <div class="cat-keys">${keys}</div>
  </div>`;
}

/**
 * Tendência dos Elos: para onde as magias equipadas puxam o seu conjunto.
 * A afinidade do personagem é fixa; o que muda é o que você escolhe equipar.
 */
function buildCard(sim: Simulation): string {
  const c = sim.c;
  const count = Object.fromEntries(AFFINITY_RING.map((a) => [a, 0])) as Record<Affinity, number>;
  let total = 0;
  for (const slot of c.elos) {
    if (!slot.unlocked || !slot.technique) continue;
    count[SPELLS[slot.technique as SpellId].affinity] += 1;
    total++;
  }
  const max = Math.max(1, ...Object.values(count));
  const weights = Object.fromEntries(AFFINITY_RING.map((a) => [a, count[a] / max])) as Record<Affinity, number>;
  const top = AFFINITY_RING.filter((a) => total && count[a] === max);
  const lean = !total
    ? 'nenhuma magia equipada'
    : top.length === 1
      ? `puxa para <b style="color:${AFFINITY_COLORS[top[0]!]}">${AFFINITY_NAMES[top[0]!]}</b>`
      : `equilibrado: ${top.map((a) => `<b style="color:${AFFINITY_COLORS[a]}">${AFFINITY_NAMES[a]}</b>`).join(' · ')}`;
  return `<div class="cat-build">
    <div class="cb-head"><b>Tendência dos Elos</b>${hintTip(
      `A forma mostra de quais afinidades são as magias equipadas nos seus Elos (${total} no total). Sua afinidade (${AFFINITY_NAMES[c.affinity]}) é fixa: magias dela entram em qualquer Elo sem perder nível. As outras perdem 1 nível efetivo por passo de distância no pentágono e pedem Elos mais altos; o rótulo de cada ponta mostra a partir de qual.`,
    )}<span>${lean}</span></div>
    ${affinityRadar(c, weights)}
  </div>`;
}

function spellRow(sim: Simulation, e: Entry<SpellId>, sel: boolean, ctx: PickContext | null): string {
  const s = SPELLS[e.id];
  const need = spellNeed(sim, e.id);
  const where = whereEquipped(sim, e.id);
  const tag = where && ctx ? `<em class="tag ${ctx && where === ctx.slot ? 'here' : ''}">${ctx && where === ctx.slot ? 'neste Elo' : `Elo ${where.level}`}</em>` : '';
  return `<button class="crow ${sel ? 'sel' : ''} ${e.why ? 'blocked' : ''}" data-pick="${e.id}" role="option" aria-selected="${sel}" style="--c:${AFFINITY_COLORS[s.affinity]}" title="${escapeHtml(e.why ?? '')}">
    <span class="cr-ic">${icon(s.icon, 20)}</span>
    <span class="cr-txt"><b>${s.name}</b><small>${s.role} · ${AFFINITY_NAMES[s.affinity]}</small></span>
    <span class="cr-tags">${tag}<span class="need ${e.why ? 'bad' : need > 1 ? 'up' : ''}">${e.why ? icon('lock', 11) : ''}Elo ${need}+</span></span>
  </button>`;
}

function pactRow(e: Entry<PactId>, sel: boolean): string {
  const d = PACTS[e.id];
  return `<button class="crow pact ${sel ? 'sel' : ''} ${e.why ? 'blocked' : ''} ${d.oath ? 'oath' : ''}" data-pick="${e.id}" role="option" aria-selected="${sel}" title="${escapeHtml(e.why ?? '')}">
    <span class="cr-lvl">+${d.level}</span>
    <span class="cr-txt"><b>${d.name}</b><small>${d.oath ? 'Juramento' : 'Restrição'}${d.value ? ` · ${VALUE_NAMES[d.value]}` : ''}</small></span>
    <span class="cr-tags">${e.on ? '<em class="tag here">neste Elo</em>' : ''}${pactPips(d.level)}</span>
  </button>`;
}

const stat = (k: string, v: string, s = '') => `<div class="stat"><span>${k}</span><b>${v}</b>${s ? `<small>${s}</small>` : ''}</div>`;

// ---------------------------------------------------------------------------
// Ficha detalhada da magia: tudo vem dos dados que a simulação usa
// (SpellDef, fx, SPELL_RULES, MODS, ELO_TABLE), para o texto nunca mentir.
// ---------------------------------------------------------------------------

const num = (v: number, d = 2) => v.toLocaleString('pt-BR', { maximumFractionDigits: d });
const sec = (v: number) => `${num(v)} s`;
const met = (v: number) => `${num(v)} m`;
const pct = (v: number) => `${num(v * 100, 0)}%`;

/** Como a magia escolhe e atinge os alvos, com os números reais. */
function howItWorks(s: SpellDef): string[] {
  const fx = s.fx;
  const R = SPELL_RULES;
  switch (fx.shape) {
    case 'dash':
      return [
        `Você avança até <b>${met(s.range)}</b> na direção da mira; para ao bater numa parede.`,
        `Ao chegar, atinge todos num raio de <b>${met(s.radius)}</b> logo à sua frente.`,
        `A cada <b>${fx.pierceEvery}</b> acertos no mesmo inimigo, o golpe ignora a armadura dele (a contagem fica guardada em cada inimigo).`,
      ];
    case 'charge':
      return [
        `Não causa dano sozinho: carrega o <b>próximo golpe</b> (básico ou magia) dado em até <b>${sec(fx.chargeS!)}</b>.`,
        `O golpe carregado vira crítico: <b>×${num(fx.critBase!)}</b>, vezes (70% + 30% da potência do Elo), vezes +20% por ponto de Dano na forja.`,
        `Por <b>${sec(fx.defenseZeroS!)}</b> você fica com <b>defesa zero</b>: a Maré e o Véu não reduzem nada do dano que você recebe.`,
        `Com a Restrição "Só contra elites", a carga espera um alvo de elite e não se gasta em inimigos comuns.`,
        `Abalo, Restaurar e Quebra-Guarda da forja agem no golpe crítico.`,
      ];
    case 'beam':
      return [
        `Dispara em linha reta até <b>${met(s.range)}</b> na direção da mira; para na primeira parede.`,
        `Atravessa e atinge <b>todos</b> os inimigos no caminho, numa faixa de <b>${met(s.radius * 2)}</b> de largura.`,
      ];
    case 'delayed':
      return [
        `Marca um ponto na direção da mira: onde está o cursor, até <b>${met(s.range)}</b> de você.`,
        `<b>${sec(fx.delayS!)}</b> depois, atinge todos num raio de <b>${met(s.radius)}</b>. Dá tempo de o alvo sair: mire onde ele vai estar.`,
        ...(fx.stunS ? [`Atordoa quem for atingido por <b>${sec(fx.stunS)}</b> (chefe: ${sec(fx.stunS * R.bossStunMult)}).`] : []),
        ...(fx.rootS ? [`Prende quem for atingido por <b>${sec(fx.rootS)}</b> (chefe: <b>${sec(fx.rootBossS!)}</b>).`] : []),
      ];
    case 'cone':
      return [
        `Atinge os inimigos até <b>${met(s.range)}</b> num cone de <b>${num(fx.coneHalfDeg! * 2, 0)}°</b> à sua frente (quem está colado em você, a menos de 0,8 m, sempre é pego).`,
        `Puxa cada um até ficar a cerca de <b>1 m</b> de você. Elites vêm só ${pct(R.eliteShoveMult)} do caminho; o chefe não se move.`,
        `Todos os puxados passam a perseguir você.`,
      ];
    case 'chain': {
      const seq = Array.from({ length: fx.jumps! + 1 }, (_, i) => pct(Math.pow(fx.jumpFalloff!, i))).join(' → ');
      return [
        `Acerta primeiro o inimigo visível mais próximo da mira, até <b>${met(s.range)}</b> de você (inimigos em Sombra só com o Olhar).`,
        `Depois salta <b>${fx.jumps}</b> vezes, sempre para o inimigo mais próximo do último atingido, até <b>${met(s.radius)}</b> de distância.`,
        `Cada salto causa ${pct(1 - fx.jumpFalloff!)} a menos: <b>${seq}</b> do dano.`,
        `Sem alvo ao alcance, o raio sai no vazio e conta como erro.`,
      ];
    }
    case 'targetArea':
      return [
        `Brotam no ponto mirado (até <b>${met(s.range)}</b>), num raio de <b>${met(s.radius)}</b>.`,
        `Prendem no lugar por <b>${sec(fx.rootS!)}</b> (chefe: <b>${sec(fx.rootBossS!)}</b>). Funcionam em elites.`,
        `Presos não andam, mas ainda atacam quem estiver ao alcance deles.`,
      ];
    case 'arc':
      return [
        `Corta em <b>${num(fx.arcDeg!, 0)}°</b> à sua frente, até <b>${met(s.range)}</b> (quem está colado em você, a menos de 0,6 m, sempre é pego).`,
        `Atinge todos os inimigos dentro do arco de uma vez.`,
      ];
    case 'aura':
      return [
        `Atinge todos ao seu redor num raio de <b>${met(s.radius)}</b>; não precisa mirar.`,
        `Empurra cada um <b>${met(fx.pushM!)}</b> para longe (elites, ${pct(R.eliteShoveMult)}; o chefe não se move).`,
        `Atordoa por <b>${sec(fx.stunS!)}</b> (chefe: ${sec(fx.stunS! * R.bossStunMult)}). Atordoar durante o preparo cancela o golpe do inimigo.`,
      ];
    case 'mark':
      return [
        `Marca o inimigo <b>comum</b> (não elite) visível mais próximo da mira, até <b>${met(s.range)}</b>.`,
        `Por <b>${sec(fx.charmS!)}</b> ele luta do seu lado: ataca o aliado dele mais próximo (até ${met(fx.charmSeekM!)}) com <b>${pct(fx.charmDamageMult!)}</b> do dano normal; a armadura do alvo conta.`,
        `Não causa dano direto. Sem inimigo comum ao alcance, o Fluxo é gasto mesmo assim.`,
      ];
    case 'self':
      return [
        `Cura <b>${pct(fx.healFrac!)}</b> da sua vida máxima, ou <b>${pct(fx.healFrac! + fx.healLowBonus!)}</b> se você estiver abaixo de ${pct(fx.lowHpFrac!)} de vida.`,
        `A cura escala com o nível do Elo: 70% + 30% da potência.`,
        `Não precisa mirar e não causa dano.`,
      ];
    case 'ward':
      return [
        `Cria um escudo que absorve <b>${pct(fx.shieldFrac!)}</b> da sua vida máxima em dano (70% + 30% da potência do Elo).`,
        `Dura <b>${sec(fx.shieldS!)}</b> ou até quebrar. Lançar de novo substitui o escudo.`,
      ];
    case 'fan':
      return [
        `Dispara <b>${fx.fanCount}</b> agulhas num leque de <b>${num(fx.fanDeg!, 0)}°</b>, até <b>${met(s.range)}</b>.`,
        `Cada agulha para no primeiro inimigo e causa o dano inteiro: de perto, várias acertam o mesmo alvo.`,
      ];
    case 'zone':
      return [
        `Cria uma poça no ponto mirado (até <b>${met(s.range)}</b>), num raio de <b>${met(s.radius)}</b>, que dura <b>${sec(fx.durationS!)}</b>.`,
        `A cada <b>${sec(fx.tickS!)}</b>, fere todos dentro dela e <b>ignora armadura</b>: até ${Math.round(fx.durationS! / fx.tickS!)} pulsos.`,
      ];
    case 'single':
      return [
        `Atinge só o inimigo visível mais próximo da mira, até <b>${met(s.range)}</b>. Funciona em elites.`,
        `Atordoa por <b>${sec(fx.stunS!)}</b> (chefe: ${sec(fx.stunS! * R.bossStunMult)}). Atordoar durante o preparo cancela o golpe do inimigo.`,
      ];
    case 'vortex':
      return [
        `No ponto mirado (até <b>${met(s.range)}</b>), puxa todos num raio de <b>${met(s.radius)}</b> para o centro.`,
        `Elites vêm só ${pct(R.eliteShoveMult)} do caminho; o chefe não se move. Todos os puxados passam a perseguir você.`,
      ];
  }
}

/** O que cada modificador faz nesta magia em particular. */
function modEffect(s: SpellDef, id: ModId): string {
  const R = SPELL_RULES;
  const crit = s.fx.shape === 'charge' ? ' no golpe crítico' : '';
  switch (id) {
    case 'damage':
      return `+20% de dano${crit} por ponto`;
    case 'area':
      if (s.fx.shape === 'chain') return '+1 salto e +30% de distância de salto por ponto';
      if (s.fx.shape === 'beam') return '+30% de largura da faixa por ponto';
      return '+30% de raio do impacto por ponto';
    case 'range':
      if (s.fx.shape === 'dash') return '+12% de distância do avanço por ponto (até o seu raio de visão)';
      return '+12% de alcance por ponto (nunca além do seu raio de visão)';
    case 'cadence':
      return '−12% de recarga por ponto';
    case 'restore':
      return `Cura ${pct(R.restoreFrac)} da sua vida máxima${s.fx.shape === 'charge' ? ' no golpe crítico' : ' se acertar alguém'}`;
    case 'stun':
      return crit ? `Atordoa ${sec(R.stunModS)} o alvo do golpe crítico (vale cheio até no chefe)` : `Atordoa ${sec(R.stunModS)} cada alvo atingido (chefe: ${sec(R.stunModS * R.bossStunMult)})`;
    case 'shatter':
      return `Ignora a armadura${crit || ' sempre'}`;
  }
}

/** Rótulos dos números principais, que mudam de sentido conforme a forma da magia. */
function headlineStats(sim: Simulation, s: SpellDef): string {
  const fx = s.fx;
  const need = spellNeed(sim, s.id);
  const reach =
    fx.shape === 'charge' || fx.shape === 'aura' || fx.shape === 'self' || fx.shape === 'ward'
      ? stat('Alcance', fx.shape === 'aura' ? 'ao redor' : fx.shape === 'charge' ? '—' : 'você')
      : stat(fx.shape === 'dash' ? 'Avanço' : 'Alcance', met(s.range));
  const size =
    fx.shape === 'beam'
      ? stat('Largura', met(s.radius * 2))
      : fx.shape === 'chain'
        ? stat('Salto', met(s.radius), `${fx.jumps} saltos`)
        : fx.shape === 'cone'
          ? stat('Cone', `${num(fx.coneHalfDeg! * 2, 0)}°`)
          : fx.shape === 'arc'
            ? stat('Arco', `${num(fx.arcDeg!, 0)}°`)
            : fx.shape === 'fan'
              ? stat('Leque', `${num(fx.fanDeg!, 0)}°`, `${fx.fanCount} agulhas`)
            : s.radius
              ? stat('Raio', met(s.radius))
              : stat('Alvo', fx.shape === 'mark' || fx.shape === 'single' ? '1 inimigo' : 'você');
  const power = fx.shape === 'charge' ? stat('Crítico base', `×${num(fx.critBase!)}`, 'no próximo golpe') : stat('Dano base', s.baseDamage ? `${s.baseDamage}` : '—');
  return `<div class="stats">${power}${reach}${size}${stat('Elo mínimo', `${need}`, 'para você')}</div>`;
}

/**
 * Base da magia no nível natural para o personagem: no Elo mínimo da afinidade dele,
 * sem Restrições, forja, Maré, emoções nem Maestria. Estável: não muda com o momento.
 */
function naturalBlock(sim: Simulation, s: SpellDef): string {
  const need = spellNeed(sim, s.id);
  if (need > 8) return '';
  const info = sim.slotInfo({ level: need, unlocked: true, technique: s.id, restrictions: [], mods: {}, sealed: false });
  if (!info) return '';
  const main =
    s.fx.shape === 'charge'
      ? stat('Crítico', `×${num(s.fx.critBase! * (0.7 + 0.3 * info.power))}`, 'no próximo golpe')
      : stat('Dano por alvo', s.baseDamage ? num(s.baseDamage * info.power, 0) : '—', s.baseDamage ? 'antes da armadura' : 'sem dano direto');
  return `<div class="cd-now">
    <div class="pv-main"><span>Nível natural para você</span><b>nível ${info.effective}</b><span>no Elo ${need}</span></div>
    <div class="pv-stats">${main}${stat('Potência', `×${num(info.power)}`)}${stat('Custo', `${info.costPct}%`, 'da reserva de Fluxo')}${stat('Recarga', sec(info.cooldown))}</div>
    <p class="cd-note">Base, sem Restrições, forja, Maré, emoções nem Maestria. Restrições sobem o nível; custo e recarga são sempre os do Elo.</p>
  </div>`;
}

/** Regras que valem para toda magia, com os números da simulação. */
function commonRules(): string {
  const R = SPELL_RULES;
  const rows = [
    `<b>Custo e recarga vêm do Elo</b>, não da magia: Elo 1 custa ${ELO_TABLE[1]!.cost}% da reserva e recarrega em ${sec(ELO_TABLE[1]!.cooldown)}; Elo 8 custa ${ELO_TABLE[8]!.cost}% e recarrega em ${sec(ELO_TABLE[8]!.cooldown)}. O Fluxo é pago ao lançar, mesmo se errar.`,
    `<b>Potência</b>: cada nível efetivo acima do 1 soma +30% de dano. Restrições sobem o nível efetivo; magias de outra afinidade perdem nível pela distância no pentágono.`,
    `<b>Dano final</b> = dano base × potência × forja × Maré × emoções × Foco (+10%). A Maestria não muda o dano: ela decide até qual Elo a magia sobe e quais Restrições cabem nela.`,
    `<b>Só atinge o que você vê</b>: inimigos fora do seu raio de visão (10 m; 14 m com o Olhar) são ignorados.`,
    `<b>Armadura</b> do inimigo reduz o dano, a menos que a magia a ignore (Quebra-Guarda, Punho do Voto a cada ${SPELLS.votePunch.fx.pierceEvery} acertos).`,
    `<b>Recuo</b>: cada acerto empurra o inimigo um pouco (elites, ${pct(R.eliteKnockMult)}; o chefe não se move) e o faz perseguir você.`,
    `<b>Chefes</b> sofrem só ${pct(R.bossStunMult)} de qualquer atordoamento e não são puxados nem empurrados.`,
  ];
  return `<details class="cd-rules"><summary>Regras de todas as magias</summary><ul>${rows.map((r) => `<li>${r}</li>`).join('')}</ul></details>`;
}

function spellDetail(sim: Simulation, id: SpellId, ctx: PickContext | null): string {
  const c = sim.c;
  const s = SPELLS[id];
  const color = AFFINITY_COLORS[s.affinity];
  const need = spellNeed(sim, id);
  const where = whereEquipped(sim, id);
  const res = resonance(s.tags, c.psyche.traits);
  const resText =
    res > 1
      ? `<span class="good">Forte</span>: −${pct(1 - 1 / res)} de custo.`
      : res < 1
        ? `<span class="bad">Fraca</span>: +${pct(1 / Math.max(0.5, res) - 1)} de custo.`
        : 'Neutra.';

  let preview = '';
  let action = '';
  if (ctx) {
    const slot = ctx.slot;
    const problem = sim.equipProblem(slot.level, id);
    const blocked = problem !== null;
    if (!blocked) {
      const kept = slot.restrictions.filter((p) => s.pacts.includes(p));
      const temp: EloSlot = { ...slot, technique: id, restrictions: kept, mods: slot.technique === id ? slot.mods : {} };
      const pv = sim.spellPreview(temp)!;
      const lost = slot.restrictions.length - kept.length;
      preview = `<div class="cd-preview">
        <div class="pv-main"><span>No Elo ${slot.level}</span><b>nível ${pv.info.effective}</b>${pv.info.beyondLimit ? '<em>Além-limite</em>' : ''}</div>
        <div class="pv-stats">${stat('Dano por alvo', pv.damage ? num(pv.damage, 0) : '—')}${stat('Custo', `${num(pv.cost, 0)}`, 'Fluxo')}${stat('Recarga', sec(pv.cooldown))}${stat('Forja', `${pv.info.points}`, 'pontos')}</div>
        ${lost ? `<p class="pv-warn">${lost} Restrição(ões) do Elo não combinam com ${s.name} e sairão.</p>` : ''}
        ${slot.technique && slot.technique !== id && Object.keys(slot.mods).length ? '<p class="pv-warn">A forja deste Elo será zerada.</p>' : ''}
      </div>`;
    }
    if (blocked) action = `<button class="btn" disabled>${icon('lock', 14)} ${problem}</button>`;
    else if (!ctx.editable) action = `<button class="btn" disabled>${icon('lock', 14)} Só no santuário, fora de combate</button>`;
    else if (slot.technique === id) action = `<button class="btn" disabled>Equipada neste Elo</button><button class="btn ghost" data-cat-act="clear">Esvaziar o Elo</button>`;
    else if (where) action = `<button class="btn primary" data-cat-act="equip">Trocar com o Elo ${where.level}</button>`;
    else action = `<button class="btn primary" data-cat-act="equip">Equipar no Elo ${slot.level}</button>`;
  }

  const pacts = s.pacts
    .map((p) => {
      const d = PACTS[p];
      return ctx
        ? `<span class="mchip ${d.oath ? 'oath' : ''}">+${d.level} ${d.name}</span>`
        : `<button class="mchip link ${d.oath ? 'oath' : ''}" data-goto-pact="${p}">+${d.level} ${d.name}</button>`;
    })
    .join('');
  const mods = s.mods
    .map(
      (m) => `<li><span class="md-ic">${icon(m, 15)}</span><span class="md-txt"><b>${MODS[m].name}</b><small>${modEffect(s, m)}</small></span>
        <span class="md-cost" title="Custo em pontos de forja · máximo de pontos">${MODS[m].cost} pt · máx ${MODS[m].max}</span></li>`,
    )
    .join('');
  return `<div class="cd-head" style="--c:${color}">
      <span class="cd-art">${icon(s.icon, 40)}</span>
      <div><h3>${s.name}</h3><p>${s.role} · <b style="color:${color}">${AFFINITY_NAMES[s.affinity]}</b></p></div>
    </div>
    <p class="cd-desc">${s.desc}</p>
    ${preview || (ctx ? '' : naturalBlock(sim, s))}
    ${headlineStats(sim, s)}
    <h6 class="cd-sub">Como funciona</h6>
    <ul class="cd-how" style="--c:${color}">${howItWorks(s)
      .map((l) => `<li>${l}</li>`)
      .join('')}</ul>
    <h6 class="cd-sub">Forja nesta magia <small>${s.mods.length} de ${MOD_IDS.length} modificadores</small></h6>
    <ul class="cd-mods">${mods}</ul>
    <dl class="cd-facts">
      <div><dt>Natureza ${hintTip(
        'O jeito de agir da magia. Cada natureza combina com traços da sua personalidade: agressiva com Coragem e Ira; protetora com Empatia e Disciplina; enganadora com pouca Sinceridade; paciente com Perseverança e Disciplina. Essa combinação define a Ressonância.',
      )}</dt><dd>${s.tags.length ? s.tags.map((t) => NATURE_NAMES[t].charAt(0).toUpperCase() + NATURE_NAMES[t].slice(1)).join(' e ') : '—'}</dd></div>
      ${ctx ? `<div><dt>Equipada</dt><dd>${where ? `Elo ${where.level}` : 'Não'}</dd></div>` : ''}
      <div><dt>Ressonância ${hintTip('O quanto a natureza da magia combina com a sua personalidade. Muda o custo de Fluxo.')}</dt><dd>${resText}</dd></div>
    </dl>
    <h6 class="cd-sub">Restrições compatíveis <small>${s.pacts.length} de ${PACT_IDS.length}</small></h6>
    <div class="cd-chips">${pacts}</div>
    ${commonRules()}
    <div class="cd-spacer"></div>
    ${action ? `<div class="cd-actions">${action}</div>` : ''}`;
}

function pactDetail(sim: Simulation, id: PactId, ctx: PickContext | null): string {
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
