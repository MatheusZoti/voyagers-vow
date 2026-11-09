import './style.css';
import './ui/panels.css';
import './ui/world-ui.css';
import './ui/feel.css';
import { createCharacter, refreshEloUnlocks, type Character } from '../sim/character';
import { tierLevels } from '../sim/stats';
import { Simulation, TICK, type SimEvent } from '../sim/sim';
import { Hud } from './hud';
import { InputController } from './input';
import { deleteCharacter, disableSaving, loadCharacter, saveCharacter } from './save';
import { registerMap } from '../sim/world/regions';
import type { MapData } from '../sim/world/terrain';
import { Sfx } from './sfx';
import { GameView } from './three/view';
import { DebugPanel, loadTuning } from './ui/debug';
import { DialogueBox } from './ui/dialogue';
import { Panels } from './ui/panels';
import { creationScreen, titleScreen } from './ui/screens';
import { PlaytestRecorder } from './playtest';

/** Teste de mapa vindo do editor (?playtest=1): não grava sessão de playtest. */
const mapTest = new URLSearchParams(location.search).has('playtest');
/** Sessão de playtest guiado: sempre ligada no servidor de desenvolvimento. */
const recorder = import.meta.env.DEV && !mapTest ? new PlaytestRecorder() : null;

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

/** Cartão com o nome da região ao entrar nela. */
function regionCard(name: string, tier: number): void {
  const el = document.createElement('div');
  el.className = 'region-card';
  const band = tierLevels(tier);
  el.innerHTML = `<span>Tier ${tier} · nível ${band.min}–${band.max}</span><b>${name}</b>`;
  document.body.append(el);
  setTimeout(() => el.classList.add('out'), 2200);
  setTimeout(() => el.remove(), 3200);
}

function startGame(c: Character, arrive?: { x: number; y: number }): void {
  screenEl.className = 'screen';
  screenEl.innerHTML = '';
  const sim = new Simulation(c, 99, arrive);
  regionCard(sim.map.name, sim.map.tier);
  const view = new GameView(gameEl, floatersEl, sim);
  const hud = new Hud(hudEl, sim);
  const panels = new Panels(screenEl, sim);
  panels.sfx = sfx;
  panels.playtest = recorder;
  recorder?.attach(sim);
  // Registra os painéis abertos (inclusive por clique nas abas).
  const openPanel = panels.open.bind(panels);
  panels.open = (id) => {
    openPanel(id);
    recorder?.ui(id);
  };
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
    if (panels.handleKey(code)) return;
    // Enter: anotação do playtest (o jogo pausa enquanto você escreve).
    if ((code === 'Enter' || code === 'NumpadEnter') && recorder && !panels.current) {
      setPaused(true);
      recorder.openNote(() => setPaused(false));
      return;
    }
    const map: Record<string, 'psyche' | 'stats' | 'elos' | 'codex' | 'mastery' | 'map' | 'help'> = {
      KeyC: 'psyche',
      KeyI: 'stats',
      KeyK: 'elos',
      KeyG: 'codex',
      KeyM: 'mastery',
      KeyN: 'map',
      KeyH: 'help',
    };
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
      if (panels.current) recorder?.ui(panels.current);
      setPaused(panels.current !== null);
      sfx.ui();
    }
  };

  if (c.region === 'vale') hud.pushNotice('Bem-vindo ao Vale da Ponte. H mostra os controles.', 'info');
  if (c.region === 'vale' && !c.dialogues.length) hud.pushNotice('Mestre Oren quer falar com você. Clique nele para conversar.', 'info');

  let last = performance.now();
  let acc = 0;
  let hitstop = 0;
  /** câmera lenta do tutorial (fator do tempo e quanto falta, em segundos reais) */
  let slow = { factor: 1, left: 0 };
  let hintEl: HTMLDivElement | null = null;
  const showTideHint = (windup: number) => {
    slow = { factor: 0.35, left: windup / 0.35 };
    hintEl?.remove();
    hintEl = document.createElement('div');
    hintEl.className = 'tide-hint';
    hintEl.innerHTML = `<b>Golpe pesado vindo!</b>Quando o círculo vermelho estiver para fechar, gire a Maré para a <b style="display:inline;font:inherit;color:#6fd0ff">defesa</b>: roda do mouse ↓ ou <kbd>Z</kbd>. Maré perfeita = metade do dano.`;
    document.body.append(hintEl);
  };
  let saveTimer = 0;
  let raf = 0;
  let running = true;
  let travel: { to: string; arrive: { x: number; y: number } } | null = null;
  const frame = (now: number) => {
    if (!running) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!paused) recorder?.frame(dt);
    debug.tick(dt);
    if (!paused && hitstop > 0) {
      // Congelado no impacto: o mundo quase para, a tela ainda treme.
      hitstop -= dt;
      acc = 0;
      view.render(dt * 0.06);
    } else {
      if (!paused) {
        // Tutorial: o tempo anda devagar enquanto o golpe pesado se prepara.
        if (slow.left > 0) {
          slow.left -= dt;
          acc += dt * slow.factor;
          if (slow.left <= 0) {
            slow = { factor: 1, left: 0 };
            const el = hintEl;
            hintEl = null;
            setTimeout(() => el?.remove(), 1200);
          }
        } else acc += dt;
        while (acc >= TICK) {
          acc -= TICK;
          const aim = view.screenToGround(input.cursor.x, input.cursor.y);
          const fallback = { x: sim.player.pos.x + sim.player.facing.x, y: sim.player.pos.y + sim.player.facing.y };
          const cmd = input.poll(aim, fallback);
          const events = sim.step(cmd);
          recorder?.afterStep(events, TICK, cmd.move.x !== 0 || cmd.move.y !== 0);
          view.handleEvents(events);
          hud.handleEvents(events);
          sfx.handle(events, c.affinity);
          for (const ev of events) {
            if (ev.t === 'dialogue') openDialogue(() => dialogue.show(ev.id));
            if (ev.t === 'travel') travel = { to: ev.to, arrive: ev.arrive };
            if (ev.t === 'hint' && ev.id === 'perfectTide') showTideHint(ev.duration);
          }
          if (travel) break;
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
    if (travel) {
      // Troca de região: salva, desmonta esta cena e monta a próxima.
      const t = travel;
      c.region = t.to;
      stopGame?.();
      stopGame = null;
      startGame(c, t.arrive);
      return;
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  const onUnload = () => {
    saveCharacter(c);
    recorder?.save();
  };
  window.addEventListener('beforeunload', onUnload);
  // Exposto para depuração no console.
  (window as unknown as { vv: unknown }).vv = { sim, view, hud, recorder };

  stopGame = () => {
    hintEl?.remove();
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

/** `?playtest=1`: abre o mapa que está no editor com um personagem descartável (nada é salvo). */
function startPlaytest(): boolean {
  if (!new URLSearchParams(location.search).has('playtest')) return false;
  let d: MapData | null = null;
  try {
    d = JSON.parse(localStorage.getItem('voyagers-vow/editor/playtest') ?? 'null') as MapData | null;
  } catch {
    d = null;
  }
  if (!d) return false;
  disableSaving();
  registerMap(d);
  const c = createCharacter('Teste', 'vigor');
  c.region = d.id;
  // Começa no nível de entrada do tier do mapa, com os Elos que esse nível libera.
  c.level = tierLevels(d.tier).min;
  refreshEloUnlocks(c);
  const tag = document.createElement('div');
  tag.style.cssText =
    'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:15;pointer-events:none;padding:4px 12px;border-radius:999px;' +
    'background:rgba(20,17,14,.8);border:1px solid rgba(226,182,90,.45);color:#e2b65a;font:600 11px Inter,sans-serif;letter-spacing:.08em;text-transform:uppercase';
  tag.textContent = `Teste de mapa · ${d.name} · nada é salvo`;
  document.body.append(tag);
  startGame(c);
  return true;
}

if (!startPlaytest()) showTitle();
