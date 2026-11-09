import { AFFINITY_COLORS, AFFINITY_NAMES } from '../sim/flow/affinity';
import { POSTURES, TIDE_LEVELS, tideLabel, tideLevel, type Posture } from '../sim/flow/flow';
import { xpToNext } from '../sim/character';
import { EMOTION_COLORS, EMOTION_NAMES } from '../sim/psyche/emotions';
import { CRISIS_NAMES, dominant, STRESS_BAND_NAMES, stressBand } from '../sim/psyche/psyche';
import type { NoticeTone, SimEvent, Simulation } from '../sim/sim';
import { TECHNIQUES, type TechniqueId } from '../sim/techniques';

import { emotionWheel } from './ui/charts';
import { escapeHtml } from './util';

export { escapeHtml };
import { icon } from './ui/icons';

import { SLOT_KEYS } from './keys';

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
  private postures: Array<{ el: HTMLElement; id: Posture }> = [];
  private slots: HTMLElement[] = [];
  private tideFill = h('div', 'tide-atk');
  private tideMarker = h('div', 'tide-target');
  private tideText = h('span', 'tide-text');
  private status = h('div', 'status');
  private hint = h('div', 'hint');
  private level = h('div', 'level');
  private miniWheel = h('div', 'mini-wheel');
  private vignette = h('div', 'vignette');
  private prevCd: number[] = [];
  private lastWheel = '';
  private lastStatic = '';

  constructor(
    private root: HTMLElement,
    private sim: Simulation,
  ) {
    root.innerHTML = '';
    root.hidden = false;
    root.append(this.vignette);

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
    for (const id of ['silence', 'gaze'] as const) {
      const d = POSTURES[id];
      const b = h('div', 'key posture', `<span class="k">${d.key}</span><span class="pi">${icon(id, 22)}</span><span class="n">${d.name}</span>`);
      b.style.setProperty('--c', d.color);
      b.title = d.desc;
      postureGroup.append(b);
      this.postures.push({ el: b, id });
    }
    const tide = h('div', 'tide');
    const track = h('div', 'tide-track');
    track.append(this.tideFill, this.tideMarker);
    for (let i = 1; i < TIDE_LEVELS * 2; i++) {
      const notch = h('div', 'tide-notch');
      notch.style.left = `${(i / (TIDE_LEVELS * 2)) * 100}%`;
      track.append(notch);
    }
    tide.append(h('span', 'tide-label', `${icon('tide', 14)} Maré`), track, this.tideText);
    tide.title = 'Roda do mouse (ou Z/X): 5 degraus entre defesa (Véu) e ataque (Ímpeto). Cada degrau fora do centro dá ±15% e drena 1% do Fluxo/s.';

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
    for (const ev of events) {
      if (ev.t === 'notice') this.pushNotice(ev.text, ev.tone);
      // Borda vermelha ao levar dano (reinicia a animação a cada golpe).
      if (ev.t === 'damage' && ev.target === 'player') {
        this.vignette.classList.remove('hit');
        void this.vignette.offsetWidth;
        this.vignette.style.setProperty('--hit', String(Math.min(1, 0.35 + ev.amount / 40)));
        this.vignette.classList.add('hit');
      }
      if (ev.t === 'perfectTide') {
        this.vignette.classList.remove('perfect');
        void this.vignette.offsetWidth;
        this.vignette.classList.add('perfect');
      }
    }
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
    this.vignette.classList.toggle('low', !p.dead && p.hp / maxHp < 0.3);
    this.hp.style.width = `${(p.hp / maxHp) * 100}%`;
    this.hpText.textContent = `${Math.ceil(p.hp)} / ${maxHp}`;
    // A Euforia faz a barra de Fluxo mentir para cima.
    const fmax = sim.flowMax();
    const shown = Math.min(fmax, p.flow + sim.mods.flowDisplayBias * fmax);
    this.flow.style.width = `${(shown / fmax) * 100}%`;
    this.flow.classList.toggle('locked', sim.time < p.flowLockUntil);
    // Maré fora do centro: o Fluxo não regenera e escoa (a barra mostra isso).
    const draining = tideLevel(p.tide.value) !== 0;
    this.flow.classList.toggle('draining', draining);
    this.flowText.textContent = draining ? `Fluxo ${Math.floor(shown)} ▼ Maré` : `Fluxo ${Math.floor(shown)}`;
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

    const tideLvl = tideLevel(p.tide.target);
    for (const k of this.postures) k.el.classList.toggle('active', p.posture === k.id);

    this.tideFill.style.width = `${p.tide.value * 100}%`;
    this.tideMarker.style.left = `${p.tide.target * 100}%`;
    this.tideText.textContent = sim.mods.tideLock !== null ? `travada · ${tideLabel(tideLvl)}` : tideLabel(tideLvl);
    this.tideText.dataset.lvl = String(tideLvl);

    // Elos.
    this.slots.forEach((el, i) => {
      const slot = c.elos[i]!;
      const info = slot.unlocked && slot.technique ? sim.slotInfo(slot) : null;
      const cd = p.slotCd[slot.level] ?? 0;
      if ((this.prevCd[i] ?? 0) > 0 && cd <= 0) {
        el.classList.remove('ready');
        void el.offsetWidth;
        el.classList.add('ready');
      }
      this.prevCd[i] = cd;
      const tech = slot.technique ? TECHNIQUES[slot.technique as TechniqueId] : null;
      const state = !slot.unlocked ? 'locked' : slot.sealed ? 'sealed' : !tech ? 'empty' : '';
      const key = `${i}|${state}|${tech?.id}|${info?.effective}|${cd > 0 ? Math.ceil(cd * 10) : 0}|${info ? Math.round(sim.slotCost(slot, info)) : 0}|${p.flow < (info ? sim.slotCost(slot, info) : 0)}`;
      if (el.dataset.key === key) return;
      el.dataset.key = key;
      el.className = `key slot ${state} ${info?.beyondLimit ? 'beyond' : ''} ${info && p.flow < sim.slotCost(slot, info) ? 'nocost' : ''} ${el.classList.contains('ready') ? 'ready' : ''}`;
      const label = !slot.unlocked ? '—' : slot.sealed ? 'Selado' : tech ? tech.name : 'Vazio';
      const art = !slot.unlocked ? 'lock' : slot.sealed ? 'seal' : tech ? tech.icon : 'empty';
      el.innerHTML =
        `<span class="k">${SLOT_KEYS[i]}</span><span class="lvl">Elo ${slot.level}${info && info.effective !== slot.level ? ` → ${info.effective}` : ''}</span>` +
        `<span class="si" ${tech && !slot.sealed ? `style="color:${AFFINITY_COLORS[tech.affinity]}"` : ""}>${icon(art, 22)}</span><span class="n">${label}</span>` +
        (info ? `<span class="cost">${Math.round(sim.slotCost(slot, info))}</span>` : '') +
        (cd > 0 ? `<span class="cd">${cd.toFixed(1)}</span>` : '');
    });

    // Chefe.
    const boss = sim.boss();
    const showBoss = !!boss && boss.state !== 'dead' && p.bossEngaged;
    this.bossBar.classList.toggle('show', showBoss);
    if (boss && showBoss) this.bossFill.style.width = `${(boss.hp / boss.maxHp) * 100}%`;

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
      else if (sim.inSanctuary()) hint = `${sim.map.safeName}: <b>Shift</b> Silêncio para meditar · <b>K</b> Grade de Elos · <b>C</b> Ficha`;
      this.hint.innerHTML = hint;
      this.hint.classList.toggle('show', !!hint);
    }
  }
}
