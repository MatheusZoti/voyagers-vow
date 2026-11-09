import { xpToNext } from '../../sim/character';
import type { Simulation } from '../../sim/sim';
import { SPELL_IDS } from '../../sim/techniques';
import { DEFAULT_TUNING, resetTuning, TUNING, TUNING_LABELS, type Tuning } from '../../sim/tuning';

const KEY = 'voyagers-vow/tuning';

/** Carrega os ajustes salvos do último playtest. */
export function loadTuning(): void {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Partial<Tuning>;
    for (const k of Object.keys(DEFAULT_TUNING) as Array<keyof Tuning>) if (typeof saved[k] === 'number') TUNING[k] = saved[k]!;
  } catch {
    /* ignore */
  }
}

function saveTuning(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(TUNING));
  } catch {
    /* ignore */
  }
}

/**
 * Painel de playtest (tecla `): ajusta o balanceamento ao vivo e oferece atalhos de teste.
 * Não pausa o jogo — a ideia é mexer e sentir na hora.
 */
export class DebugPanel {
  open = false;
  private fps = 0;
  private frames = 0;
  private acc = 0;
  private fpsEl: HTMLElement | null = null;

  constructor(
    private root: HTMLElement,
    private sim: Simulation,
  ) {}

  toggle(): void {
    this.open = !this.open;
    if (this.open) this.render();
    else {
      this.root.hidden = true;
      this.root.innerHTML = '';
    }
  }

  tick(dt: number): void {
    this.frames++;
    this.acc += dt;
    if (this.acc >= 0.5) {
      this.fps = Math.round(this.frames / this.acc);
      this.frames = 0;
      this.acc = 0;
      if (this.fpsEl) this.fpsEl.textContent = `${this.fps} fps · ${this.sim.enemies.filter((e) => e.state !== 'dead').length} inimigos`;
    }
  }

  private render(): void {
    const changed = (k: keyof Tuning) => TUNING[k] !== DEFAULT_TUNING[k];
    this.root.hidden = false;
    this.root.innerHTML = `<div class="debug">
      <header><b>Playtest</b><span class="dbg-fps"></span><button data-a="close" title="Fechar (\`)">×</button></header>
      <div class="dbg-sliders">${(Object.keys(TUNING_LABELS) as Array<keyof Tuning>)
        .map(
          (k) => `<label class="${changed(k) ? 'changed' : ''}"><span>${TUNING_LABELS[k]}</span>
            <input type="range" min="0.25" max="3" step="0.05" value="${TUNING[k]}" data-k="${k}"/>
            <output>${TUNING[k].toFixed(2)}×</output></label>`,
        )
        .join('')}</div>
      <div class="dbg-actions">
        <button data-a="heal">Curar</button>
        <button data-a="level">+1 nível</button>
        <button data-a="spells">Todas as magias</button>
        <button data-a="boss">Ir ao chefe</button>
        <button data-a="home">Lugar seguro</button>
        <button data-a="calm">Limpar emoções</button>
      </div>
      <div class="dbg-actions">
        <button data-a="copy" class="wide">Copiar valores</button>
        <button data-a="reset" class="wide">Restaurar padrão</button>
      </div>
    </div>`;
    this.fpsEl = this.root.querySelector('.dbg-fps');
    this.root.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((inp) =>
      inp.addEventListener('input', () => {
        const k = inp.dataset.k as keyof Tuning;
        TUNING[k] = +inp.value;
        inp.nextElementSibling!.textContent = `${(+inp.value).toFixed(2)}×`;
        inp.parentElement!.classList.toggle('changed', TUNING[k] !== DEFAULT_TUNING[k]);
        saveTuning();
      }),
    );
    this.root.onclick = (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
      const sim = this.sim;
      const p = sim.player;
      switch (a) {
        case 'close':
          return this.toggle();
        case 'heal':
          p.hp = sim.maxHp();
          p.flow = sim.flowMax();
          return;
        case 'level':
          sim.gainXp(xpToNext(sim.c.level) - sim.c.xp, false);
          return;
        case 'spells':
          sim.c.knownSpells = [...SPELL_IDS];
          return;
        case 'boss': {
          const ar = sim.map.arena;
          if (ar) p.pos = { x: ar.x - ar.r - 3, y: ar.y };
          return;
        }
        case 'home':
          p.pos = { ...sim.map.playerStart };
          return;
        case 'calm':
          sim.c.psyche.emotions = {};
          return;
        case 'copy': {
          const text = JSON.stringify(TUNING, null, 2);
          void navigator.clipboard?.writeText(text).catch(() => {});
          (e.target as HTMLElement).textContent = 'Copiado!';
          return;
        }
        case 'reset':
          resetTuning();
          saveTuning();
          return this.render();
      }
    };
  }
}
