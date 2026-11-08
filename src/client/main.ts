import './style.css';
import './ui/panels.css';
import './ui/world-ui.css';
import './ui/feel.css';
import { createCharacter, type Character } from '../sim/character';
import { Simulation, TICK, type SimEvent } from '../sim/sim';
import { Hud } from './hud';
import { InputController } from './input';
import { deleteCharacter, loadCharacter, saveCharacter } from './save';
import { Sfx } from './sfx';
import { GameView } from './three/view';
import { DebugPanel, loadTuning } from './ui/debug';
import { DialogueBox } from './ui/dialogue';
import { Panels } from './ui/panels';
import { creationScreen, titleScreen } from './ui/screens';

const gameEl = document.getElementById('game')!;
const hudEl = document.getElementById('hud')!;
const screenEl = document.getElementById('screen')!;
const floatersEl = document.getElementById('floaters')!;
const dialogEl = document.getElementById('dialog')!;
const debugEl = document.getElementById('debug')!;

const sfx = new Sfx();
// O áudio só pode nascer num gesto do jogador.
const unlockAudio = () => sfx.unlock();
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

loadTuning();

let stopGame: (() => void) | null = null;

function showTitle(): void {
  stopGame?.();
  stopGame = null;
  hudEl.hidden = true;
  const saved = loadCharacter();
  titleScreen(screenEl, {
    hasSave: saved?.name ?? null,
    onContinue: () => saved && startGame(saved),
    onNew: () =>
      creationScreen(screenEl, (name, affinity) => {
        deleteCharacter();
        const c = createCharacter(name, affinity);
        saveCharacter(c);
        startGame(c);
      }),
  });
}

/**
 * Pausa no acerto (hit-stop): congela a simulação por alguns centésimos para o golpe "pesar".
 * Golpes comuns quase nada; finalizadores, magias e críticos mais; a morte do chefe, bastante.
 */
function hitstopFor(events: SimEvent[]): number {
  let h = 0;
  for (const ev of events) {
    if (ev.t === 'damage' && ev.target === 'enemy' && !ev.immune) h = Math.max(h, ev.crit ? 0.11 : ev.big ? 0.06 : 0.03);
    else if (ev.t === 'damage' && ev.target === 'player') h = Math.max(h, ev.amount >= 20 ? 0.08 : 0.03);
    else if (ev.t === 'enemyDeath') h = Math.max(h, ev.boss ? 0.45 : 0.05);
    else if (ev.t === 'perfectTide') h = Math.max(h, 0.14);
  }
  return h;
}

function startGame(c: Character): void {
  screenEl.className = 'screen';
  screenEl.innerHTML = '';
  const sim = new Simulation(c);
  const view = new GameView(gameEl, floatersEl, sim);
  const hud = new Hud(hudEl, sim);
  const panels = new Panels(screenEl, sim);
  panels.sfx = sfx;
  const input = new InputController(view.renderer.domElement);
  const dialogue = new DialogueBox(dialogEl, sim);
  const debug = new DebugPanel(debugEl, sim);
  // Botão direito: a magia do Elo 1.
  input.rightClickSlot = () => (c.elos[0]?.technique ? 1 : null);

  let paused = false;
  const setPaused = (v: boolean) => {
    paused = v;
    input.enabled = !v;
    if (v) input.release();
  };
  panels.onClose = () => setPaused(false);
  dialogue.onClose = () => setPaused(false);
  const openDialogue = (fn: () => void) => {
    if (panels.current) return;
    setPaused(true);
    sfx.ui();
    fn();
  };
  // Clique num NPC: conversar (se estiver perto).
  input.onLeftClick = (x, y) => {
    const pt = view.screenToGround(x, y);
    const npc = pt ? sim.npcAt(pt, 1.1) : null;
    if (!npc) return false;
    if (sim.npcDistance(npc) > 3.5) {
      hud.pushNotice('Chegue mais perto para conversar.', 'info');
      return true;
    }
    openDialogue(() => dialogue.talkTo(npc));
    return true;
  };
  panels.onQuit = () => {
    saveCharacter(c);
    showTitle();
  };
  input.onKey = (code) => {
    if (dialogue.open) return;
    if (code === 'Backquote' || code === 'F2') return debug.toggle();
    const map: Record<string, 'psyche' | 'elos' | 'mastery' | 'help'> = { KeyC: 'psyche', KeyK: 'elos', KeyM: 'mastery', KeyH: 'help' };
    if (code === 'Escape') {
      if (panels.current) panels.close();
      else {
        setPaused(true);
        panels.open('pause');
      }
      sfx.ui();
      return;
    }
    const id = map[code];
    if (id) {
      panels.toggle(id);
      setPaused(panels.current !== null);
      sfx.ui();
    }
  };

  hud.pushNotice('Bem-vindo ao Vale da Ponte. H mostra os controles.', 'info');
  if (!c.dialogues.length) hud.pushNotice('Mestre Oren quer falar com você. Clique nele para conversar.', 'info');

  let last = performance.now();
  let acc = 0;
  let hitstop = 0;
  let saveTimer = 0;
  let raf = 0;
  let running = true;
  const frame = (now: number) => {
    if (!running) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    debug.tick(dt);
    if (!paused && hitstop > 0) {
      // Congelado no impacto: o mundo quase para, a tela ainda treme.
      hitstop -= dt;
      acc = 0;
      view.render(dt * 0.06);
    } else {
      if (!paused) {
        acc += dt;
        while (acc >= TICK) {
          acc -= TICK;
          const aim = view.screenToGround(input.cursor.x, input.cursor.y);
          const fallback = { x: sim.player.pos.x + sim.player.facing.x, y: sim.player.pos.y + sim.player.facing.y };
          const events = sim.step(input.poll(aim, fallback));
          view.handleEvents(events);
          hud.handleEvents(events);
          sfx.handle(events, c.affinity);
          for (const ev of events) if (ev.t === 'dialogue') openDialogue(() => dialogue.show(ev.id));
          hitstop = Math.max(hitstop, hitstopFor(events));
          if (paused || hitstop > 0) break;
        }
        const hoverPt = view.screenToGround(input.cursor.x, input.cursor.y);
        view.setHoverNpc(hoverPt ? sim.npcAt(hoverPt, 1.1) : null);
        saveTimer += dt;
        if (saveTimer > 10) {
          saveTimer = 0;
          saveCharacter(c);
        }
      }
      view.render(paused ? 0 : dt);
    }
    hud.update();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  const onUnload = () => saveCharacter(c);
  window.addEventListener('beforeunload', onUnload);
  // Exposto para depuração no console.
  (window as unknown as { vv: unknown }).vv = { sim, view };

  stopGame = () => {
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('beforeunload', onUnload);
    saveCharacter(c);
    input.dispose();
    if (dialogue.open) dialogue.close();
    if (debug.open) debug.toggle();
    view.dispose();
    hudEl.innerHTML = '';
    hudEl.hidden = true;
  };
}

showTitle();
