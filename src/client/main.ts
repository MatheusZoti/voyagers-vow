import './style.css';
import { createCharacter, type Character } from '../sim/character';
import { Simulation, TICK } from '../sim/sim';
import { Hud } from './hud';
import { InputController } from './input';
import { deleteCharacter, loadCharacter, saveCharacter } from './save';
import { GameView } from './three/view';
import { Panels } from './ui/panels';
import { revealScreen, riteScreen, titleScreen } from './ui/screens';

const gameEl = document.getElementById('game')!;
const hudEl = document.getElementById('hud')!;
const screenEl = document.getElementById('screen')!;
const floatersEl = document.getElementById('floaters')!;

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
      riteScreen(screenEl, (name, answers) => {
        deleteCharacter();
        const c = createCharacter(name, answers);
        saveCharacter(c);
        revealScreen(screenEl, c, () => startGame(c));
      }),
  });
}

function startGame(c: Character): void {
  screenEl.className = 'screen';
  screenEl.innerHTML = '';
  const sim = new Simulation(c);
  const view = new GameView(gameEl, floatersEl, sim);
  const hud = new Hud(hudEl, sim);
  const panels = new Panels(screenEl, sim);
  const input = new InputController(view.renderer.domElement);
  input.rightClickSlot = () => c.elos.find((s) => s.technique === 'signature' && s.unlocked)?.level ?? null;

  let paused = false;
  const setPaused = (v: boolean) => {
    paused = v;
    input.enabled = !v;
    if (v) input.release();
  };
  panels.onClose = () => setPaused(false);
  panels.onQuit = () => {
    saveCharacter(c);
    showTitle();
  };
  input.onKey = (code) => {
    const map: Record<string, 'sheet' | 'elos' | 'mastery' | 'help'> = { KeyC: 'sheet', KeyK: 'elos', KeyM: 'mastery', KeyH: 'help' };
    if (code === 'Escape') {
      if (panels.current) panels.close();
      else {
        setPaused(true);
        panels.open('pause');
      }
      return;
    }
    const id = map[code];
    if (id) {
      panels.toggle(id);
      setPaused(panels.current !== null);
    }
  };

  hud.pushNotice('Bem-vindo ao Vale da Ponte. H mostra os controles.', 'info');
  hud.pushNotice('Atravesse o vale e enfrente o Guardião da Ponte.', 'info');

  let last = performance.now();
  let acc = 0;
  let saveTimer = 0;
  let raf = 0;
  let running = true;
  const frame = (now: number) => {
    if (!running) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!paused) {
      acc += dt;
      while (acc >= TICK) {
        acc -= TICK;
        const aim = view.screenToGround(input.cursor.x, input.cursor.y);
        const fallback = { x: sim.player.pos.x + sim.player.facing.x, y: sim.player.pos.y + sim.player.facing.y };
        const events = sim.step(input.poll(aim, fallback));
        view.handleEvents(events);
        hud.handleEvents(events);
      }
      saveTimer += dt;
      if (saveTimer > 10) {
        saveTimer = 0;
        saveCharacter(c);
      }
    }
    view.render(paused ? 0 : dt);
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
    view.dispose();
    hudEl.innerHTML = '';
    hudEl.hidden = true;
  };
}

showTitle();
