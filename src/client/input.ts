import type { Posture } from '../sim/flow/flow';
import type { Vec2 } from '../sim/math';
import { emptyInput, type PlayerInput } from '../sim/sim';

/** Coleta teclado e mouse e entrega um PlayerInput por tick. */
export class InputController {
  private keys = new Set<string>();
  private mouse = { x: 0, y: 0, left: false };
  private pendingSlot: number | null = null;
  private pendingPosture: Posture | null = null;
  private tideSteps = 0;
  /** ação de UI (abrir painéis etc.) */
  onKey: (code: string) => void = () => {};
  enabled = true;
  rightClickSlot: () => number | null = () => null;
  /** clique esquerdo no mundo; retorna true se foi consumido (ex.: conversar com NPC) */
  onLeftClick: (x: number, y: number) => boolean = () => false;
  private ac = new AbortController();

  constructor(private el: HTMLElement) {
    const o = { signal: this.ac.signal };
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      this.keys.add(e.code);
      // Tab alterna o Olhar: não deixa o navegador mover o foco.
      if (e.code === 'Tab') e.preventDefault();
      if (e.repeat) return;
      this.onKey(e.code);
      if (!this.enabled) return;
      // Elos 1–4 nas teclas 1–4; Elos 5–8 em Q E R F.
      const slotKeys: Record<string, number> = { Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4, KeyQ: 5, KeyE: 6, KeyR: 7, KeyF: 8 };
      if (e.code in slotKeys) this.pendingSlot = slotKeys[e.code]!;
      // Shift alterna o Silêncio; Tab, o Olhar. 1 a 4 estão livres (Véu e Ímpeto viraram a Maré).
      if (e.key === 'Shift') this.pendingPosture = 'silence';
      if (e.code === 'Tab') this.pendingPosture = 'gaze';
      if (e.code === 'KeyZ') this.tideSteps -= 1;
      if (e.code === 'KeyX') this.tideSteps += 1;
    }, o);
    window.addEventListener('keyup', (e) => this.keys.delete(e.code), o);
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.left = false;
    }, o);
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    }, o);
    el.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (e.button === 0 && this.onLeftClick(e.clientX, e.clientY)) return;
      if (e.button === 0) this.mouse.left = true;
      if (e.button === 2) this.pendingSlot = this.rightClickSlot();
    }, o);
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
    }, o);
    el.addEventListener('contextmenu', (e) => e.preventDefault(), o);
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (!this.enabled) return;
        // Roda para cima = mais ataque; para baixo = mais defesa.
        this.tideSteps += e.deltaY < 0 ? 1 : -1;
      },
      { passive: false, signal: this.ac.signal },
    );
  }

  get cursor(): { x: number; y: number } {
    return this.mouse;
  }

  /** Monta o input deste tick. Ações de toque único são consumidas. */
  poll(aim: Vec2 | null, fallbackAim: Vec2): PlayerInput {
    const input = emptyInput();
    if (!this.enabled) return input;
    const k = this.keys;
    // Câmera olha para o norte (-Z = -y no mundo): W sobe na tela.
    input.move.x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    input.move.y = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
    input.aim = aim ?? fallbackAim;
    input.basic = this.mouse.left || k.has('Space');
    input.useSlot = this.pendingSlot;
    input.togglePosture = this.pendingPosture;
    input.tideSteps = this.tideSteps;
    this.pendingSlot = null;
    this.pendingPosture = null;
    this.tideSteps = 0;
    return input;
  }

  dispose(): void {
    this.ac.abort();
  }

  release(): void {
    this.keys.clear();
    this.mouse.left = false;
  }
}
