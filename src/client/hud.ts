import { AFFINITY_NAMES } from '../sim/flow/affinity';
import { POSTURE_IDS, POSTURES } from '../sim/flow/flow';
import { xpToNext } from '../sim/character';
import { EMOTION_COLORS, EMOTION_NAMES } from '../sim/psyche/emotions';
import { CRISIS_NAMES, dominant, STRESS_BAND_NAMES, stressBand } from '../sim/psyche/psyche';
import type { NoticeTone, SimEvent, Simulation } from '../sim/sim';
import { TECHNIQUES, type TechniqueId } from '../sim/techniques';

import { emotionWheel } from './ui/charts';
import { escapeHtml } from './util';

export { escapeHtml };
import { icon } from './ui/icons';

const SLOT_KEYS =['Q', 'E', 'R', 'F', 'T', 'G', 'V', 'B'];

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html) el.innerHTML = html;
  return el;
};

/** HUD em DOM: só o essencial em combate (emoção dominante + estresse), o resto na ficha. */
export class Hud {
  private hp = h('div', 'bar-fill hp');
  private hpText = h('span', 'bar-text');
  private flow = h('div', 'bar-fill flow');
  private flowText = h('span', 'bar-text');
  private xp = h('div', 'xp-fill');
  private emotion = h('div', 'emotion');
  private stress = h('div', 'stress-fill');
  private stressLabel = h('span', 'stress-label');
  private crisis = h('div', 'crisis-tag');
  private banner = h('div', 'banner');
  private notices = h('div', 'notices');
  private bossBar = h('div', 'boss');
  private bossFill = h('div', 'boss-fill');
  private postures: HTMLElement[] = [];
  private slots: HTMLElement[] = [];
  private tideFill = h('div', 'tide-atk');
  private tideMarker = h('div', 'tide-target');
  private tideText = h('span', 'tide-text');
  private status = h('div', 'status');
  private hint = h('div', 'hint');
  private level = h('div', 'level');
  private miniWheel = h('div', 'mini-wheel');
  private lastWheel = '';
  private lastStatic = '';

  constructor(
    private root: HTMLElement,
    private sim: Simulation,
  ) {
    root.innerHTML = '';
    root.hidden = false;

    // Topo esquerdo: Psique.
    const psy = h('div', 'panel psyche');
    const stressBar = h('div', 'stress-bar');
    stressBar.append(this.stress);
    const txt = h('div', 'psy-text');
    txt.append(this.emotion, stressBar, this.stressLabel, this.crisis);
    psy.append(this.miniWheel, txt);
    psy.title = 'Psique (C)';
    root.append(psy);

    // Topo direito: personagem.
    const who = h('div', 'panel who');
    const xpBar = h('div', 'xp-bar');
    xpBar.append(this.xp);
    who.append(this.level, xpBar, this.status);
    root.append(who);

    // Chefe.
    this.bossBar.append(h('div', 'boss-name', 'Guardião da Ponte'));
    const bb = h('div', 'boss-track');
    bb.append(this.bossFill);
    this.bossBar.append(bb);
    root.append(this.bossBar);

    root.append(this.banner, this.notices, this.hint);

    // Barra inferior.
    const bottom = h('div', 'bottom');
    const bars = h('div', 'bars');
    const hpBar = h('div', 'bar');
    hpBar.append(this.hp, this.hpText);
    const flowBar = h('div', 'bar');
    flowBar.append(this.flow, this.flowText);
    bars.append(hpBar, flowBar);

    const row = h('div', 'row');
    const postureGroup = h('div', 'group');
    for (const id of POSTURE_IDS) {
      const d = POSTURES[id];
      const b = h('div', 'key posture', `<span class="k">${d.key}</span><span class="pi">${icon(id, 22)}</span><span class="n">${d.name}</span>`);
      b.style.setProperty('--c', d.color);
      b.title = d.desc;
      postureGroup.append(b);
      this.postures.push(b);
    }
    const tide = h('div', 'tide');
    const track = h('div', 'tide-track');
    track.append(this.tideFill, this.tideMarker);
    tide.append(h('span', 'tide-label', `${icon('tide', 14)} Maré`), track, this.tideText);
    tide.title = 'Roda do mouse (ou Z/X): distribui o Fluxo entre ataque e defesa.';

    const slotGroup = h('div', 'group');
    for (let i = 0; i < 5; i++) {
      const s = h('div', 'key slot');
      slotGroup.append(s);
      this.slots.push(s);
    }
    row.append(postureGroup, tide, slotGroup);
    bottom.append(bars, row);
    root.append(bottom);
  }

  handleEvents(events: SimEvent[]): void {
    for (const ev of events) if (ev.t === 'notice') this.pushNotice(ev.text, ev.tone);
  }

  pushNotice(text: string, tone: NoticeTone = 'info'): void {
    if (tone === 'crisis') {
      this.banner.textContent = text;
      this.banner.className = 'banner show';
      clearTimeout((this.banner as unknown as { _t?: number })._t);
      (this.banner as unknown as { _t?: number })._t = window.setTimeout(() => (this.banner.className = 'banner'), 3200);
    }
    const n = h('div', `notice ${tone}`);
    n.textContent = text;
    this.notices.prepend(n);
    while (this.notices.children.length > 7) this.notices.lastElementChild?.remove();
    setTimeout(() => n.classList.add('fade'), 6000);
    setTimeout(() => n.remove(), 7000);
  }

  update(): void {
    const sim = this.sim;
    const p = sim.player;
    const c = sim.c;
    const psy = c.psyche;

    const maxHp = sim.maxHp();
    this.hp.style.width = `${(p.hp / maxHp) * 100}%`;
    this.hpText.textContent = `${Math.ceil(p.hp)} / ${maxHp}`;
    // A Euforia faz a barra de Fluxo mentir para cima.
    const fmax = sim.flowMax();
    const shown = Math.min(fmax, p.flow + sim.mods.flowDisplayBias * fmax);
    this.flow.style.width = `${(shown / fmax) * 100}%`;
    this.flow.classList.toggle('locked', sim.time < p.flowLockUntil);
    this.flowText.textContent = `Fluxo ${Math.floor(shown)}`;
    this.xp.style.width = `${(c.xp / xpToNext(c.level)) * 100}%`;

    const dom = dominant(psy);
    if (dom) {
      this.emotion.textContent = EMOTION_NAMES[dom.id];
      this.emotion.style.color = EMOTION_COLORS[dom.id];
      this.emotion.style.opacity = String(0.55 + dom.intensity * 0.45);
    } else {
      this.emotion.textContent = 'Sereno';
      this.emotion.style.color = '#cfd8e3';
      this.emotion.style.opacity = '0.7';
    }
    // Mini roda de emoções: só redesenha quando algo muda de forma visível.
    const wheelKey = `${Math.round(psy.stress / 4)}|${Object.values(psy.emotions)
      .map((e) => `${e!.id}${Math.round(e!.intensity * 20)}`)
      .join(',')}`;
    if (wheelKey !== this.lastWheel) {
      this.lastWheel = wheelKey;
      this.miniWheel.innerHTML = emotionWheel(psy.emotions, psy.stress, { size: 64, labels: false });
    }
    const band = stressBand(psy.stress);
    this.stress.style.width = `${psy.stress}%`;
    this.stress.dataset.band = band;
    this.stressLabel.textContent = STRESS_BAND_NAMES[band];
    const cr = psy.crisis;
    this.crisis.textContent = cr.phase === 'active' ? CRISIS_NAMES[cr.id] : cr.phase === 'warning' ? `${CRISIS_NAMES[cr.id]} em ${cr.remaining.toFixed(1)} s` : '';
    this.crisis.className = `crisis-tag ${cr.phase}`;

    this.postures.forEach((el, i) => {
      el.classList.toggle('active', p.posture === POSTURE_IDS[i]);
    });

    const atk = Math.round(p.tide.value * 100);
    this.tideFill.style.width = `${p.tide.value * 100}%`;
    this.tideMarker.style.left = `${p.tide.target * 100}%`;
    this.tideText.textContent = sim.mods.tideLock !== null ? 'travada' : `${atk}/${100 - atk}`;

    // Elos.
    this.slots.forEach((el, i) => {
      const slot = c.elos[i]!;
      const info = slot.unlocked && slot.technique ? sim.slotInfo(slot) : null;
      const cd = p.slotCd[slot.level] ?? 0;
      const tech = slot.technique ? TECHNIQUES[slot.technique as TechniqueId] : null;
      const state = !slot.unlocked ? 'locked' : slot.sealed ? 'sealed' : !tech ? 'empty' : '';
      const key = `${i}|${state}|${tech?.id}|${info?.effective}|${cd > 0 ? Math.ceil(cd * 10) : 0}|${info ? Math.round(sim.slotCost(slot, info)) : 0}|${p.flow < (info ? sim.slotCost(slot, info) : 0)}`;
      if (el.dataset.key === key) return;
      el.dataset.key = key;
      el.className = `key slot ${state} ${info?.beyondLimit ? 'beyond' : ''} ${info && p.flow < sim.slotCost(slot, info) ? 'nocost' : ''}`;
      const label = !slot.unlocked ? '—' : slot.sealed ? 'Selado' : tech ? tech.name : 'Vazio';
      const art = !slot.unlocked ? 'lock' : slot.sealed ? 'seal' : tech ? tech.id : 'empty';
      el.innerHTML =
        `<span class="k">${SLOT_KEYS[i]}</span><span class="lvl">Elo ${slot.level}${info && info.effective !== slot.level ? ` → ${info.effective}` : ''}</span>` +
        `<span class="si">${icon(art, 22)}</span><span class="n">${label}</span>` +
        (info ? `<span class="cost">${Math.round(sim.slotCost(slot, info))}</span>` : '') +
        (cd > 0 ? `<span class="cd">${cd.toFixed(1)}</span>` : '');
    });

    // Chefe.
    const boss = sim.boss();
    const showBoss = !!boss && boss.state !== 'dead' && p.bossEngaged;
    this.bossBar.classList.toggle('show', showBoss);
    if (boss && showBoss) this.bossFill.style.width = `${(boss.hp / boss.def.hp) * 100}%`;

    // Textos estáticos (só mudam às vezes).
    const statics = `${c.name}|${c.level}|${c.affinity}|${c.penaltyLevel}|${sim.focused()}|${sim.inSanctuary()}|${sim.meditating()}|${c.elos.some((e) => e.sealed)}|${p.dead}`;
    if (statics !== this.lastStatic) {
      this.lastStatic = statics;
      this.level.innerHTML = `<b>${escapeHtml(c.name)}</b> · nível ${c.level} · <span class="aff">${AFFINITY_NAMES[c.affinity]}</span>`;
      const tags: string[] = [];
      if (c.penaltyLevel > 0) tags.push(`<span class="tag bad">Penalidade ${c.penaltyLevel}</span>`);
      if (sim.focused()) tags.push('<span class="tag good">Focado</span>');
      this.status.innerHTML = tags.join(' ');
      let hint = '';
      if (p.dead) hint = 'Você caiu… renascendo no santuário.';
      else if (sim.meditating()) hint = c.elos.some((e) => e.sealed) ? 'Cumprindo a penitência…' : 'Meditando. O estresse cai e a Calma chega.';
      else if (sim.inSanctuary()) hint = 'Santuário: <b>2</b> Silêncio para meditar · <b>K</b> Grade de Elos · <b>C</b> Ficha';
      this.hint.innerHTML = hint;
      this.hint.classList.toggle('show', !!hint);
    }
  }
}
