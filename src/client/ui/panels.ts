import { AFFINITY_NAMES, affinityPenalty } from '../../sim/flow/affinity';
import { canAddMod, canAddRestriction, MOD_IDS, MODS, modCost, PACT_IDS, PACTS, trimMods, type ModId, type PactId } from '../../sim/elos';
import { displayLevel, modifierDiscount } from '../../sim/mastery';
import { EMOTION_COLORS, EMOTION_NAMES, type Emotion } from '../../sim/psyche/emotions';
import { STRESS_BAND_NAMES, stressBand } from '../../sim/psyche/psyche';
import { TRAIT_GROUPS, traitPhrase, VALUE_IDS, VALUE_NAMES, valuePhrase } from '../../sim/psyche/traits';
import type { Simulation } from '../../sim/sim';
import {
  MASTERY_IDS,
  MASTERY_NAMES,
  NATURE_NAMES,
  resonance,
  sanitizeSlot,
  TECHNIQUES,
  type MasteryId,
  type TechniqueId,
} from '../../sim/techniques';
import { escapeHtml } from '../hud';
import { capitalize } from './screens';

export type PanelId = 'sheet' | 'elos' | 'mastery' | 'help' | 'pause';

/** Painéis sobre o jogo. O jogo pausa enquanto um painel está aberto. */
export class Panels {
  current: PanelId | null = null;
  onClose: () => void = () => {};
  onQuit: () => void = () => {};

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
    this.onClose();
  }

  private frame(title: string, body: string, wide = false): void {
    this.root.className = 'screen overlay';
    this.root.innerHTML = `
      <div class="sheet ${wide ? 'wide' : ''}">
        <header><h2>${title}</h2><button class="x" data-a="close" title="Fechar (Esc)">×</button></header>
        <div class="sheet-body">${body}</div>
      </div>`;
    this.root.querySelector('[data-a="close"]')!.addEventListener('click', () => this.close());
    this.root.onmousedown = (e) => {
      if (e.target === this.root) this.close();
    };
  }

  render(): void {
    switch (this.current) {
      case 'sheet':
        return this.renderSheet();
      case 'elos':
        return this.renderElos();
      case 'mastery':
        return this.renderMastery();
      case 'help':
        return this.renderHelp();
      case 'pause':
        return this.renderPause();
      default:
        return;
    }
  }

  private renderSheet(): void {
    const c = this.sim.c;
    const p = c.psyche;
    const groups = Object.entries(TRAIT_GROUPS)
      .map(([g, ids]) => {
        const lines = ids.map((id) => traitPhrase(id, p.traits[id])).filter(Boolean) as string[];
        return `<div class="trait-group"><h4>${g}</h4>${lines.length ? `<ul>${lines.map((l) => `<li>${capitalize(l)}</li>`).join('')}</ul>` : '<p class="muted">Nada que chame atenção.</p>'}</div>`;
      })
      .join('');
    const values = VALUE_IDS.map((id) => valuePhrase(id, p.values[id])).filter(Boolean) as string[];
    const emotions = (Object.values(p.emotions) as Emotion[])
      .sort((a, b) => b.intensity - a.intensity)
      .map(
        (e) =>
          `<span class="chip" style="--c:${EMOTION_COLORS[e.id]}">${EMOTION_NAMES[e.id]} <i style="width:${Math.round(e.intensity * 100)}%"></i></span>`,
      )
      .join('');
    const mem = (list: typeof p.shortMemory) =>
      list.length
        ? `<ul class="mem">${list.map((m) => `<li><span class="dot" style="background:${EMOTION_COLORS[m.emotion]}"></span>${m.text}${m.count > 1 ? ` <span class="muted">×${m.count}</span>` : ''}</li>`).join('')}</ul>`
        : '<p class="muted">Nenhuma ainda.</p>';
    this.frame(
      `${escapeHtml(c.name)} <small>Afinidade ${AFFINITY_NAMES[c.affinity]}</small>`,
      `<div class="cols">
        <section>${groups}
          <div class="trait-group"><h4>Valores</h4>${values.length ? `<ul>${values.map((l) => `<li>${capitalize(l)}</li>`).join('')}</ul>` : '<p class="muted">Ainda não sabe bem no que acredita.</p>'}</div>
        </section>
        <section>
          <h4>Agora</h4>
          <p>Estado: <b>${STRESS_BAND_NAMES[stressBand(p.stress)]}</b></p>
          <div class="chips">${emotions || '<span class="muted">Sereno</span>'}</div>
          <h4>Memórias recentes</h4>${mem(p.shortMemory)}
          <h4>Memórias marcantes</h4>${mem(p.longMemory)}
          <p class="muted small">Memórias marcantes mudam quem você é, devagar.</p>
        </section>
      </div>`,
      true,
    );
  }

  private renderMastery(): void {
    const c = this.sim.c;
    const rows = MASTERY_IDS.map((id) => {
      const r = c.mastery[id];
      const lvl = displayLevel(r);
      const frac = r.level - lvl;
      return `<tr>
        <td>${MASTERY_NAMES[id]}</td>
        <td class="num">${lvl}${r.peak > r.level + 0.99 ? ` <span class="muted">(pico ${Math.floor(r.peak)})</span>` : ''}</td>
        <td><div class="mini"><i style="width:${frac * 100}%"></i></div></td>
        <td class="num">${Math.round(r.sharpness * 100)}%</td>
      </tr>`;
    }).join('');
    const sig = TECHNIQUES.signature;
    const res = resonance(sig.tags, c.psyche.traits);
    this.frame(
      'Maestria',
      `<p class="muted">Você fica bom no que faz. A Maestria sobe com uso real (mais rápido sob risco) e a Afiação cai depois de ~5 h jogadas sem uso. Nunca abaixo de 50% do pico.</p>
      <table class="table"><thead><tr><th>Técnica</th><th>Nível</th><th>Progresso</th><th>Afiação</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="small">Ressonância da Assinatura (${sig.tags.map((t) => NATURE_NAMES[t]).join(', ')}): <b>${res > 1 ? 'ressoa — custa menos e aprende mais rápido' : res < 1 ? 'dissonante — aprende pela metade' : 'neutra'}</b></p>`,
    );
  }

  private renderElos(): void {
    const sim = this.sim;
    const c = sim.c;
    const editable = sim.inSanctuary() && !sim.inCombat();
    const techOptions: Array<TechniqueId | ''> = ['', 'signature', 'point'];
    const slots = c.elos
      .map((slot) => {
        if (!slot.unlocked) return `<div class="elo locked"><div class="elo-head"><b>Elo ${slot.level}</b><span class="muted">bloqueado</span></div></div>`;
        const info = sim.slotInfo(slot);
        const techId = slot.technique as TechniqueId | null;
        const tech = techId ? TECHNIQUES[techId] : null;
        const discount = techId ? modifierDiscount(c.mastery[techId as MasteryId]) : 0;
        const select = `<select data-slot="${slot.level}" ${editable ? '' : 'disabled'}>${techOptions
          .map((t) => `<option value="${t}" ${t === (techId ?? '') ? 'selected' : ''}>${t ? TECHNIQUES[t].name : '— vazio —'}</option>`)
          .join('')}</select>`;
        if (!tech || !info) return `<div class="elo"><div class="elo-head"><b>Elo ${slot.level}</b>${select}</div></div>`;
        const pen = tech.affinity ? affinityPenalty(c.affinity, tech.affinity) : 0;
        const capped = slot.level + info.restrictionBonus + info.alignedBonus > slot.level + 4;
        const breakdown = [
          `Elo ${slot.level}`,
          info.restrictionBonus ? `+${info.restrictionBonus} Restrições` : '',
          info.alignedBonus ? `+1 valor forte (${VALUE_NAMES[PACTS[info.alignedPact!].value!]})` : '',
          capped ? `(teto Elo + 4)` : '',
          pen ? `−${pen} afinidade (${AFFINITY_NAMES[tech.affinity!]})` : '',
        ]
          .filter(Boolean)
          .join(' ');
        // Só aparecem as Restrições que fazem sentido para esta técnica.
        const pacts = PACT_IDS.filter((id) => tech.pacts.includes(id)).map((id) => {
          const on = slot.restrictions.includes(id);
          const why = on ? null : canAddRestriction(slot, id);
          const d = PACTS[id];
          const aligned = d.value && c.psyche.values[d.value] >= 25;
          const contrary = d.value && c.psyche.values[d.value] <= -25;
          return `<label class="pact ${on ? 'on' : ''} ${why ? 'off' : ''}" title="${escapeHtml(why ?? '')}">
            <input type="checkbox" data-pact="${id}" data-slot="${slot.level}" ${on ? 'checked' : ''} ${!editable || (why && !on) ? 'disabled' : ''}/>
            <span class="lv">+${d.level}</span>
            <span class="pact-text"><span class="pact-name">${d.name}</span><span class="pact-desc">${d.desc}</span></span>
            ${d.value ? `<span class="val ${aligned ? 'good' : contrary ? 'bad' : ''}" title="${aligned ? 'Valor forte: a primeira Restrição alinhada conta +1 nível' : contrary ? 'Contra os seus valores: cada uso soma estresse' : ''}">${VALUE_NAMES[d.value]}</span>` : ''}
          </label>`;
        }).join('');
        const mods = MOD_IDS.filter((id) => tech.mods.includes(id)).map((id) => {
          const n = slot.mods[id] ?? 0;
          const why = canAddMod(slot, info, id, discount);
          return `<div class="mod" title="${MODS[id].desc}">
            <span>${MODS[id].name} <span class="muted">(${modCost(id, discount)})</span></span>
            <span class="ctl"><button data-mod="${id}" data-d="-1" data-slot="${slot.level}" ${!editable || !n ? 'disabled' : ''}>−</button><b>${n}</b><button data-mod="${id}" data-d="1" data-slot="${slot.level}" ${!editable || why ? 'disabled' : ''}>+</button></span>
          </div>`;
        }).join('');
        return `<div class="elo ${info.beyondLimit ? 'beyond' : ''} ${slot.sealed ? 'sealed' : ''}">
          <div class="elo-head"><b>Elo ${slot.level}</b>${select}
            <span class="eff">nível efetivo <b>${info.effective}</b>${info.beyondLimit ? ' · Além-limite' : ''}</span></div>
          <p class="small muted">${breakdown} · custo ${info.costPct}% · recarga ${sim.slotCooldown(slot, info).toFixed(1)} s · potência ×${info.power.toFixed(2)}${slot.sealed ? ' · <b class="bad">SELADO</b>' : ''}</p>
          <div class="elo-cols">
            <div><h5>Restrições (${slot.restrictions.length}/${info.maxRestrictions})</h5>${pacts}</div>
            <div><h5>Forja (${info.pointsUsed}/${info.points} pontos)</h5>${mods}</div>
          </div>
        </div>`;
      })
      .join('');
    this.frame(
      'Grade de Elos',
      `${editable ? '' : '<p class="warnline">Só é possível reconfigurar os Elos no santuário, fora de combate.</p>'}
      <p class="muted small">Restrições elevam o nível efetivo (até Elo + 4; acima de 8 é Além-limite). A técnica ganha pontos e potência do nível efetivo, mas paga custo e recarga do Elo real. A primeira Restrição alinhada a um valor forte conta +1.</p>
      <div class="elos">${slots}</div>`,
      true,
    );
    if (!editable) return;

    this.root.querySelectorAll<HTMLSelectElement>('select[data-slot]').forEach((sel) =>
      sel.addEventListener('change', () => {
        const slot = c.elos[+sel.dataset.slot! - 1]!;
        const val = (sel.value || null) as TechniqueId | null;
        // Cada técnica ocupa um Elo só: troca de lugar se já estiver em outro.
        const other = c.elos.find((s) => s !== slot && s.technique === val && val);
        if (other) {
          other.technique = slot.technique;
          other.mods = {};
        }
        slot.technique = val;
        slot.mods = {};
        sanitizeSlot(slot);
        if (other) sanitizeSlot(other);
        this.render();
      }),
    );
    this.root.querySelectorAll<HTMLInputElement>('input[data-pact]').forEach((cb) =>
      cb.addEventListener('change', () => {
        const slot = c.elos[+cb.dataset.slot! - 1]!;
        const id = cb.dataset.pact as PactId;
        if (cb.checked) slot.restrictions.push(id);
        else slot.restrictions = slot.restrictions.filter((x) => x !== id);
        const info = sim.slotInfo(slot);
        if (info && slot.technique) trimMods(slot, info, modifierDiscount(c.mastery[slot.technique as MasteryId]));
        this.render();
      }),
    );
    this.root.querySelectorAll<HTMLButtonElement>('button[data-mod]').forEach((b) =>
      b.addEventListener('click', () => {
        const slot = c.elos[+b.dataset.slot! - 1]!;
        const id = b.dataset.mod as ModId;
        const n = (slot.mods[id] ?? 0) + +b.dataset.d!;
        if (n <= 0) delete slot.mods[id];
        else slot.mods[id] = n;
        this.render();
      }),
    );
  }

  private renderHelp(): void {
    this.frame(
      'Como jogar',
      `<table class="table keys">
        <tr><td>WASD</td><td>Mover</td></tr>
        <tr><td>Mouse</td><td>Mirar</td></tr>
        <tr><td>Botão esquerdo / Espaço</td><td>Golpe básico</td></tr>
        <tr><td>Botão direito</td><td>Assinatura (Punho do Voto)</td></tr>
        <tr><td>Q E R F T</td><td>Técnicas nos Elos 1 a 5</td></tr>
        <tr><td>1 2 3 4</td><td>Posturas: Véu, Silêncio, Ímpeto, Olhar</td></tr>
        <tr><td>Roda do mouse · Z / X</td><td>Maré: mais defesa / mais ataque</td></tr>
        <tr><td>C · K · M</td><td>Ficha · Grade de Elos · Maestria</td></tr>
        <tr><td>H · Esc</td><td>Ajuda · Pausa</td></tr>
      </table>
      <h4>Dicas</h4>
      <ul>
        <li>Quando o chão ficar vermelho sob você, gire a Maré para a defesa <b>no instante</b> do golpe: Maré perfeita.</li>
        <li>O Olhar (4) revela Espreitadores em Sombra e armadilhas.</li>
        <li>Medite no santuário em Silêncio (2) para baixar o estresse antes que ele vire Crise.</li>
        <li>A cada 3 acertos do Punho do Voto no mesmo alvo, o golpe ignora a armadura.</li>
      </ul>`,
    );
  }

  private renderPause(): void {
    this.frame(
      'Pausa',
      `<div class="actions col">
        <button class="btn primary" data-a="resume">Continuar</button>
        <button class="btn" data-a="help">Como jogar</button>
        <button class="btn" data-a="quit">Salvar e sair para o título</button>
      </div>`,
    );
    this.root.querySelector('[data-a="resume"]')!.addEventListener('click', () => this.close());
    this.root.querySelector('[data-a="help"]')!.addEventListener('click', () => this.open('help'));
    this.root.querySelector('[data-a="quit"]')!.addEventListener('click', () => this.onQuit());
  }
}
