import { AFFINITY_COLORS, type Affinity } from '../sim/flow/affinity';
import type { SimEvent } from '../sim/sim';

/**
 * Sons gerados por código (WebAudio), sem arquivos. Curtos e secos, no espírito low-poly.
 * O contexto só nasce no primeiro gesto do jogador (regra dos navegadores).
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private last: Record<string, number> = {};
  volume = 0.6;
  muted = false;

  constructor() {
    try {
      const v = localStorage.getItem('voyagers-vow/volume');
      if (v !== null) this.volume = Math.max(0, Math.min(1, +v));
      this.muted = localStorage.getItem('voyagers-vow/muted') === '1';
    } catch {
      /* sem armazenamento */
    }
  }

  /** Chamar num gesto do usuário (clique/tecla). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master && !this.muted) this.master.gain.value = v;
    try {
      localStorage.setItem('voyagers-vow/volume', String(v));
    } catch {
      /* ignore */
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
    try {
      localStorage.setItem('voyagers-vow/muted', this.muted ? '1' : '0');
    } catch {
      /* ignore */
    }
    return this.muted;
  }

  /** Evita empilhar o mesmo som no mesmo instante (ex.: 5 acertos de uma área). */
  private throttle(key: string, ms: number): boolean {
    const now = performance.now();
    if (now - (this.last[key] ?? 0) < ms) return false;
    this.last[key] = now;
    return true;
  }

  private tone(freq: number, dur: number, opts: { type?: OscillatorType; to?: number; gain?: number; delay?: number; attack?: number } = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t + dur);
    const peak = opts.gain ?? 0.3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + (opts.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, opts: { freq?: number; q?: number; type?: BiquadFilterType; gain?: number; delay?: number; sweepTo?: number } = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuf) return;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(opts.freq ?? 1200, t);
    if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(opts.gain ?? 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  // ----- sons do jogo

  swing(finisher: boolean): void {
    this.noise(finisher ? 0.2 : 0.12, { freq: finisher ? 700 : 1100, sweepTo: finisher ? 2400 : 3000, q: 0.8, gain: finisher ? 0.22 : 0.14 });
  }

  hit(big: boolean, crit: boolean): void {
    if (!this.throttle('hit', 35)) return;
    this.tone(big ? 110 : 160, big ? 0.16 : 0.09, { type: 'triangle', to: 50, gain: big ? 0.45 : 0.3 });
    this.noise(0.06, { freq: 900, q: 0.7, gain: big ? 0.3 : 0.2 });
    if (crit) {
      this.tone(880, 0.25, { type: 'square', to: 1760, gain: 0.08, delay: 0.02 });
      this.tone(60, 0.3, { type: 'sine', to: 30, gain: 0.5 });
    }
  }

  hurt(): void {
    if (!this.throttle('hurt', 80)) return;
    this.tone(220, 0.18, { type: 'sawtooth', to: 90, gain: 0.16 });
    this.noise(0.1, { freq: 400, q: 1.2, gain: 0.25 });
  }

  spell(aff: Affinity): void {
    if (!this.throttle('spell', 60)) return;
    switch (aff) {
      case 'vigor':
        this.tone(90, 0.22, { type: 'triangle', to: 45, gain: 0.5 });
        this.noise(0.15, { freq: 300, q: 0.8, gain: 0.3 });
        break;
      case 'projection':
        this.tone(1200, 0.25, { type: 'sawtooth', to: 300, gain: 0.08 });
        this.noise(0.2, { freq: 3000, sweepTo: 600, q: 2, gain: 0.18 });
        break;
      case 'mutation':
        for (let i = 0; i < 4; i++) this.noise(0.05, { freq: 4000 - i * 600, q: 6, gain: 0.25, delay: i * 0.03 });
        this.tone(1600, 0.12, { type: 'square', to: 400, gain: 0.05 });
        break;
      case 'forge':
        this.tone(660, 0.35, { type: 'triangle', gain: 0.15 });
        this.tone(990, 0.3, { type: 'sine', gain: 0.08, delay: 0.02 });
        this.noise(0.08, { freq: 5000, q: 3, gain: 0.15 });
        break;
      case 'dominion':
        this.tone(140, 0.45, { type: 'sine', to: 70, gain: 0.35 });
        this.tone(210, 0.4, { type: 'sine', to: 105, gain: 0.15 });
        break;
    }
  }

  warn(heavy: boolean): void {
    if (!this.throttle('warn', 150)) return;
    this.tone(heavy ? 300 : 420, heavy ? 0.4 : 0.18, { type: 'sawtooth', to: heavy ? 120 : 260, gain: heavy ? 0.12 : 0.05 });
  }

  slam(): void {
    this.tone(55, 0.5, { type: 'sine', to: 28, gain: 0.7 });
    this.noise(0.4, { freq: 200, q: 0.5, type: 'lowpass', gain: 0.5 });
  }

  perfect(): void {
    [784, 1047, 1319].forEach((f, i) => this.tone(f, 0.35, { type: 'sine', gain: 0.12, delay: i * 0.06 }));
  }

  death(boss: boolean): void {
    if (!this.throttle('death', 50)) return;
    this.noise(boss ? 1 : 0.25, { freq: boss ? 300 : 700, sweepTo: 80, q: 0.7, gain: boss ? 0.5 : 0.2 });
    if (boss) this.tone(110, 1.4, { type: 'triangle', to: 40, gain: 0.4 });
  }

  learn(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.4, { type: 'triangle', gain: 0.12, delay: i * 0.08 }));
  }

  levelUp(): void {
    [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.45, { type: 'triangle', gain: 0.13, delay: i * 0.07 }));
  }

  playerDeath(): void {
    this.tone(330, 1.2, { type: 'sawtooth', to: 60, gain: 0.15 });
  }

  ui(): void {
    this.tone(1200, 0.05, { type: 'sine', gain: 0.06 });
  }

  /** Traduz os eventos da simulação em sons. */
  handle(events: SimEvent[], affinity: Affinity): void {
    if (!this.ctx) return;
    for (const ev of events) {
      switch (ev.t) {
        case 'swing':
          this.swing(!!ev.finisher);
          break;
        case 'damage':
          if (ev.target === 'enemy' && !ev.immune) this.hit(!!ev.big, !!ev.crit);
          else if (ev.target === 'player') this.hurt();
          break;
        case 'signature':
        case 'beam':
        case 'slash':
        case 'tether':
        case 'chain':
        case 'chains':
        case 'mark':
          this.spell(spellAffinity(ev) ?? affinity);
          break;
        case 'spellMark':
          this.spell('projection');
          break;
        case 'impact':
          this.spell(spellAffinity(ev) ?? affinity);
          break;
        case 'pointCharge':
          this.tone(400, 0.3, { type: 'sine', to: 1200, gain: 0.15 });
          break;
        case 'telegraph':
          this.warn(ev.heavy);
          break;
        case 'telegraphArc':
          this.warn(false);
          break;
        case 'perfectTide':
          this.perfect();
          break;
        case 'enemyDeath':
          this.death(ev.boss);
          break;
        case 'learn':
          this.learn();
          break;
        case 'levelUp':
          this.levelUp();
          break;
        case 'playerDeath':
          this.playerDeath();
          break;
        case 'quake':
          this.slam();
          break;
        case 'trap':
          this.noise(0.2, { freq: 2500, q: 3, gain: 0.3 });
          break;
        default:
          break;
      }
    }
  }
}

/** Afinidade pela cor do efeito (o evento carrega a cor da afinidade da magia). */
function spellAffinity(ev: SimEvent): Affinity | null {
  const color = 'color' in ev ? ev.color : null;
  if (!color) return null;
  return (Object.keys(AFFINITY_COLORS) as Affinity[]).find((a) => AFFINITY_COLORS[a] === color) ?? null;
}
