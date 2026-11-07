import { DIALOGUES, NPCS, type DialogueId, type NpcId } from '../../sim/psyche/dialogues';
import type { Simulation } from '../../sim/sim';
import { escapeHtml } from '../util';

/** Falas de quem não tem nada novo a dizer. */
const IDLE_LINES: Record<NpcId, string> = {
  oren: 'Medite aqui quando o peso ficar grande demais. O santuário escuta.',
  kael: 'Que foi? Vai ficar me olhando ou vai lutar?',
  traveler: 'Ainda estou me recuperando. Cuidado na trilha.',
  pilgrim: 'O altar guarda mais histórias do que moedas.',
  herald: 'O Senhor de Varn não esquece nomes.',
  huntress: 'As pegadas grandes continuam vindo da ponte.',
};

/**
 * Caixa de diálogo. As escolhas moldam a personalidade, mas o jogador nunca vê
 * o que cada resposta mede: só a reação de quem fala.
 */
export class DialogueBox {
  open = false;
  onClose: () => void = () => {};
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(
    private root: HTMLElement,
    private sim: Simulation,
  ) {}

  /** Conversa com um NPC: a próxima conversa disponível ou uma fala solta. */
  talkTo(npc: NpcId): void {
    const d = this.sim.dialogueFor(npc);
    if (d) this.show(d.id);
    else this.showLine(NPCS[npc].name, NPCS[npc].title, IDLE_LINES[npc]);
  }

  show(id: DialogueId): void {
    const d = DIALOGUES[id];
    if (!d || this.sim.c.dialogues.includes(id)) return;
    const who = d.npc ? NPCS[d.npc] : null;
    this.render(
      who?.name ?? 'O Vale',
      who?.title ?? '',
      `<p class="dl-text">${escapeHtml(d.text)}</p>
       <div class="dl-options">${d.options
         .map((o, i) => `<button class="dl-opt" data-i="${i}"><kbd>${i + 1}</kbd><span>${escapeHtml(o.text)}</span></button>`)
         .join('')}</div>`,
      who?.color,
    );
    const pick = (i: number) => {
      const reply = this.sim.answerDialogue(id, i);
      if (reply === null) return this.close();
      this.showLine(who?.name ?? 'O Vale', who?.title ?? '', reply, who?.color);
    };
    this.root.querySelectorAll<HTMLButtonElement>('.dl-opt').forEach((b) => b.addEventListener('click', () => pick(+b.dataset.i!)));
    this.bindKeys((e) => {
      const i = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
      if (i >= 0) pick(i);
    });
  }

  private showLine(name: string, title: string, text: string, color?: string): void {
    this.render(
      name,
      title,
      `<p class="dl-text">${escapeHtml(text)}</p><div class="dl-options"><button class="dl-opt single" data-a="ok"><kbd>Espaço</kbd><span>Continuar</span></button></div>`,
      color,
    );
    this.root.querySelector('[data-a="ok"]')!.addEventListener('click', () => this.close());
    this.bindKeys((e) => {
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') this.close();
    });
  }

  private render(name: string, title: string, body: string, color = '#e2b65a'): void {
    this.open = true;
    this.root.hidden = false;
    this.root.innerHTML = `<div class="dialog" style="--npc:${color}">
      <header><span class="dl-dot"></span><b>${escapeHtml(name)}</b>${title ? `<span class="dl-title">${escapeHtml(title)}</span>` : ''}</header>
      ${body}
    </div>`;
  }

  private bindKeys(fn: (e: KeyboardEvent) => void): void {
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler, true);
    this.keyHandler = (e: KeyboardEvent) => {
      e.stopPropagation();
      e.preventDefault();
      fn(e);
    };
    // Captura antes do jogo, para 1–3 não trocarem a postura.
    window.addEventListener('keydown', this.keyHandler, true);
  }

  close(): void {
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler, true);
    this.keyHandler = null;
    this.open = false;
    this.root.hidden = true;
    this.root.innerHTML = '';
    this.onClose();
  }
}
