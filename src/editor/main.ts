import './editor.css';
import { NPCS, type NpcId } from '../sim/psyche/dialogues';
import { SPELLS, type SpellId } from '../sim/techniques';
import { ENEMIES } from '../sim/world/entities';
import { Tile, type GameMap, type SpawnKind } from '../sim/world/map';
import {
  autoConnect,
  blankMap,
  compileMap,
  formatMapJson,
  MAP_FORMAT,
  parseFloor,
  resolveRamp,
  validateMap,
  type MapData,
  type MapIssue,
  type RampDef,
} from '../sim/world/terrain';
import { Preview3D } from './preview3d';
import { draw, FLOOR_COLORS, TILE_COLORS, type Preview, type Sel, type SelKind, type View } from './render2d';

/**
 * Editor de mapas do Voyager's Vow. Roda junto do jogo (`npm run dev` → /editor.html):
 * pinta chão e andares, desenha rampas, posiciona monstros, NPCs, livros, saídas e o
 * lugar seguro, valida o mapa e grava em `src/maps/<id>.json`.
 */

// ---------------------------------------------------------------------------
// Ferramentas
// ---------------------------------------------------------------------------

type ToolId =
  | 'grass'
  | 'path'
  | 'tree'
  | 'rock'
  | 'water'
  | 'bridge'
  | 'up'
  | 'down'
  | 'setfloor'
  | 'ramp'
  | 'spawn'
  | 'npc'
  | 'book'
  | 'trap'
  | 'place'
  | 'exit'
  | 'start'
  | 'boss'
  | 'safe'
  | 'arena'
  | 'select';

interface ToolDef {
  id: ToolId;
  label: string;
  key: string;
  color: string;
  hint: string;
}

const TERRAIN: Partial<Record<ToolId, string>> = { grass: '.', path: ':', tree: 'T', rock: 'R', water: '~', bridge: '=' };

const GROUPS: Array<{ title: string; tools: ToolDef[] }> = [
  {
    title: 'Chão',
    tools: [
      { id: 'grass', label: 'Grama', key: '1', color: TILE_COLORS.grass!, hint: 'Pinta grama (chão livre).' },
      { id: 'path', label: 'Trilha', key: '2', color: TILE_COLORS.path!, hint: 'Pinta trilha de terra (caminhável, só visual).' },
      { id: 'tree', label: 'Árvore', key: '3', color: TILE_COLORS.tree!, hint: 'Árvores bloqueiam a passagem e a visão.' },
      { id: 'rock', label: 'Rocha', key: '4', color: TILE_COLORS.rock!, hint: 'Pedregulhos bloqueiam a passagem.' },
      { id: 'water', label: 'Rio', key: '5', color: TILE_COLORS.water!, hint: 'Rio no fundo de um desfiladeiro (bloqueia; a borda vira paredão).' },
      { id: 'bridge', label: 'Ponte', key: '6', color: TILE_COLORS.bridge!, hint: 'Ponte suspensa: pinte por cima do rio, de margem a margem.' },
    ],
  },
  {
    title: 'Andares',
    tools: [
      { id: 'up', label: 'Subir', key: 'Q', color: '#c98c3e', hint: 'Sobe 1 andar onde você pinta (uma vez por traço).' },
      { id: 'down', label: 'Descer', key: 'Z', color: '#3f6e57', hint: 'Desce 1 andar onde você pinta (uma vez por traço).' },
      { id: 'setfloor', label: 'Definir', key: 'F', color: '#a8a24a', hint: 'Pinta o andar escolhido (teclas 0–9 escolhem o andar).' },
      { id: 'ramp', label: 'Rampa', key: 'R', color: TILE_COLORS.ramp!, hint: 'Clique no pé da rampa e arraste na direção do andar de cima. 3 tiles de largura.' },
    ],
  },
  {
    title: 'Objetos',
    tools: [
      { id: 'spawn', label: 'Monstro', key: 'M', color: '#e0533f', hint: 'Clique para pôr um monstro (o tipo fica nas opções abaixo).' },
      { id: 'npc', label: 'NPC', key: 'N', color: '#f2d36b', hint: 'Clique para pôr um personagem com diálogo.' },
      { id: 'book', label: 'Livro', key: 'B', color: '#a98cff', hint: 'Livro antigo: ensina uma magia a quem o lê.' },
      { id: 'trap', label: 'Armadilha', key: 'T', color: '#f0a040', hint: 'Armadilha escondida no chão.' },
      { id: 'place', label: 'Lugar', key: 'L', color: '#fbf3dc', hint: 'Nome de lugar (aparece no mapa do jogo).' },
      { id: 'exit', label: 'Saída', key: 'X', color: '#6fd0ff', hint: 'Arraste um retângulo na borda: leva a outra região.' },
      { id: 'start', label: 'Início', key: 'I', color: '#7ed37a', hint: 'Onde o jogador aparece (dentro do lugar seguro).' },
      { id: 'boss', label: 'Chefe', key: 'C', color: '#ff4d6d', hint: 'Onde o chefe da região fica (dentro da arena).' },
      { id: 'safe', label: 'Refúgio', key: 'H', color: '#bfe9ff', hint: 'Lugar seguro: clique no centro e arraste para o raio.' },
      { id: 'arena', label: 'Arena', key: 'G', color: '#ff9a7a', hint: 'Arena do chefe: clique no centro e arraste para o raio.' },
    ],
  },
  {
    title: 'Editar',
    tools: [{ id: 'select', label: 'Selecionar', key: 'V', color: '#ffffff', hint: 'Clique num objeto para editar; arraste para mover; Delete apaga.' }],
  },
];
const TOOLS = GROUPS.flatMap((g) => g.tools);
const PAINT_TOOLS: ToolId[] = ['grass', 'path', 'tree', 'rock', 'water', 'bridge', 'up', 'down', 'setfloor'];

const SPAWN_KINDS: SpawnKind[] = ['grunt', 'stalker', 'brute', 'slinger'];
const DRAFT_KEY = 'voyagers-vow/editor/draft';
const LAST_KEY = 'voyagers-vow/editor/last';
const PLAYTEST_KEY = 'voyagers-vow/editor/playtest';

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

let data: MapData = blankMap('novo-mapa', 'Novo mapa', 64, 48);
let compiled: GameMap = compileMap(data);
let issues: MapIssue[] = [];
let savedJson = '';
let known: Array<{ id: string; name: string }> = [];
let apiOnline = false;
const undo: string[] = [];
const redo: string[] = [];

let tool: ToolId = 'grass';
let brush = 1;
let bucket = false;
let floorValue = 1;
let spawnKind: SpawnKind = 'grunt';
let npcId: NpcId = 'traveler';
let spellId: SpellId = Object.keys(SPELLS)[2] as SpellId;
let mode: 'natural' | 'floors' = 'natural';
let view3d = false;

let sel: Sel = null;
let hover: { x: number; y: number } | null = null;
let preview: Preview | null = null;
let flash: { x: number; y: number; t: number } | null = null;
const view: View = { z: 14, ox: 40, oy: 40 };

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const root = document.getElementById('editor')!;
root.innerHTML = `
  <header class="top">
    <span class="brand">Editor de Mapas</span>
    <select class="map-select" data-r="maps" title="Abrir mapa"></select>
    <button class="btn" data-a="new">Novo</button>
    <button class="btn primary" data-a="save" title="Ctrl+S"><span class="dirty-dot" data-r="dirty"></span> Salvar</button>
    <button class="btn" data-a="undo" title="Ctrl+Z">↶</button>
    <button class="btn" data-a="redo" title="Ctrl+Y">↷</button>
    <span class="grow"></span>
    <button class="btn" data-a="connect" title="Cria rampas ligando os platôs isolados">Ligar andares</button>
    <div class="seg" data-r="mode"><button data-m="natural" class="on">Natural</button><button data-m="floors">Andares</button></div>
    <div class="seg" data-r="dim"><button data-d="2d" class="on">2D</button><button data-d="3d">3D</button></div>
    <button class="btn primary" data-a="play">▶ Testar no jogo</button>
  </header>
  <aside class="tools" data-r="tools"></aside>
  <main class="stage" data-r="stage">
    <canvas class="c2d" data-r="canvas"></canvas>
    <div class="hint" data-r="hint"></div>
  </main>
  <aside class="side" data-r="side"></aside>
  <footer class="status" data-r="status"></footer>`;

const $ = <T extends HTMLElement>(r: string) => root.querySelector<T>(`[data-r="${r}"]`)!;
const stage = $('stage');
const canvas = $<HTMLCanvasElement>('canvas');
const ctx = canvas.getContext('2d')!;
const hintEl = $('hint');
const sideEl = $('side');
const toolsEl = $('tools');
const statusEl = $('status');
const mapsSel = $<HTMLSelectElement>('maps');
const preview3d = new Preview3D(stage);

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function toast(msg: string, kind: 'good' | 'bad' | '' = ''): void {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  stage.append(el);
  setTimeout(() => (el.style.opacity = '0'), 2600);
  setTimeout(() => el.remove(), 3000);
}

// ---------------------------------------------------------------------------
// Painel de ferramentas
// ---------------------------------------------------------------------------

function renderTools(): void {
  const opt = (label: string, html: string) => `<div class="opt-row"><span>${label}</span>${html}</div>`;
  let opts = '';
  if (PAINT_TOOLS.includes(tool)) {
    opts += `<div class="opts">${opt(
      'Pincel',
      `<div class="chips">${[1, 2, 3, 5]
        .map((b) => `<button class="chip ${brush === b && !bucket ? 'on' : ''}" data-brush="${b}">${b}</button>`)
        .join('')}<button class="chip ${bucket ? 'on' : ''}" data-bucket title="Preencher área (P)">Balde</button></div>`,
    )}</div>`;
  }
  if (tool === 'setfloor' || ['grass', 'path', 'tree', 'rock', 'bridge'].includes(tool)) {
    const label = tool === 'setfloor' ? 'Andar' : 'Andar (sobre o rio)';
    opts += `<div class="opts">${opt(
      label,
      `<div class="chips">${Array.from({ length: 6 }, (_, i) => `<button class="chip ${floorValue === i ? 'on' : ''}" data-floor="${i}" style="border-bottom:2px solid ${FLOOR_COLORS[i]}">${i}</button>`).join('')}</div>`,
    )}</div>`;
  }
  if (tool === 'spawn')
    opts += `<div class="opts">${opt(
      'Tipo',
      `<select data-o="spawnKind">${SPAWN_KINDS.map((k) => `<option value="${k}" ${k === spawnKind ? 'selected' : ''}>${ENEMIES[k].name}</option>`).join('')}</select>`,
    )}</div>`;
  if (tool === 'npc')
    opts += `<div class="opts">${opt(
      'Quem',
      `<select data-o="npcId">${(Object.keys(NPCS) as NpcId[]).map((k) => `<option value="${k}" ${k === npcId ? 'selected' : ''}>${NPCS[k].name}</option>`).join('')}</select>`,
    )}</div>`;
  if (tool === 'book')
    opts += `<div class="opts">${opt(
      'Magia',
      `<select data-o="spellId">${(Object.keys(SPELLS) as SpellId[]).map((k) => `<option value="${k}" ${k === spellId ? 'selected' : ''}>${SPELLS[k].name}</option>`).join('')}</select>`,
    )}</div>`;

  toolsEl.innerHTML = GROUPS.map(
    (g) => `
    <div class="group-title">${g.title}</div>
    <div class="tool-grid">${g.tools
      .map(
        (t) =>
          `<button class="tool ${tool === t.id ? 'on' : ''}" data-tool="${t.id}" title="${esc(t.hint)}"><span class="sw" style="background:${t.color}"></span><span class="lbl">${t.label}</span><kbd>${t.key}</kbd></button>`,
      )
      .join('')}</div>
    ${g.tools.some((t) => t.id === tool) ? opts : ''}`,
  ).join('');
  const def = TOOLS.find((t) => t.id === tool)!;
  hintEl.innerHTML = `<b>${def.label}:</b> ${esc(def.hint)} · Arraste com o botão direito (ou Espaço) para mover a vista; roda do mouse para zoom.`;
}

toolsEl.addEventListener('click', (ev) => {
  const el = ev.target as HTMLElement;
  const t = el.closest<HTMLElement>('[data-tool]');
  if (t) setTool(t.dataset.tool as ToolId);
  const b = el.closest<HTMLElement>('[data-brush]');
  if (b) {
    brush = Number(b.dataset.brush);
    bucket = false;
    renderTools();
  }
  if (el.closest('[data-bucket]')) {
    bucket = !bucket;
    renderTools();
  }
  const f = el.closest<HTMLElement>('[data-floor]');
  if (f) {
    floorValue = Number(f.dataset.floor);
    renderTools();
  }
});
toolsEl.addEventListener('change', (ev) => {
  const el = ev.target as HTMLSelectElement;
  if (el.dataset.o === 'spawnKind') spawnKind = el.value as SpawnKind;
  if (el.dataset.o === 'npcId') npcId = el.value as NpcId;
  if (el.dataset.o === 'spellId') spellId = el.value as SpellId;
});

function setTool(t: ToolId): void {
  tool = t;
  preview = null;
  renderTools();
  requestDraw();
}

// ---------------------------------------------------------------------------
// Edição: histórico, compilação, rascunho
// ---------------------------------------------------------------------------

const snapshot = () => JSON.stringify(data);

/** Registra o estado anterior a uma mudança (para desfazer). */
function pushUndo(before: string): void {
  if (before === snapshot()) return;
  undo.push(before);
  if (undo.length > 150) undo.shift();
  redo.length = 0;
}

let validateTimer = 0;
let draftTimer = 0;
let rebuild3dTimer = 0;
/** Depois de qualquer mudança: recompila, revalida, salva rascunho e atualiza a tela. */
function changed(full = true): void {
  compiled = compileMap(data);
  if (full) renderSide();
  updateDirty();
  clearTimeout(validateTimer);
  validateTimer = window.setTimeout(() => {
    issues = validateMap(data, known.map((k) => k.id));
    renderIssues();
    requestDraw();
  }, 200);
  clearTimeout(draftTimer);
  draftTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ id: data.id, json: snapshot(), base: savedJson }));
    } catch {
      /* sem armazenamento */
    }
  }, 600);
  if (view3d) {
    clearTimeout(rebuild3dTimer);
    rebuild3dTimer = window.setTimeout(() => preview3d.setMap(compiled), 350);
  }
  requestDraw();
}

function updateDirty(): void {
  $('dirty').classList.toggle('dirty', formatMapJson(data) !== savedJson);
}

function load(d: MapData, fromFile: string): void {
  data = normalize(d);
  savedJson = fromFile;
  undo.length = 0;
  redo.length = 0;
  sel = null;
  try {
    localStorage.setItem(LAST_KEY, data.id);
  } catch {
    /* ignore */
  }
  fitView();
  changed();
  if (view3d) preview3d.setMap(compiled);
  // Rascunho não salvo deste mapa?
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const dr = JSON.parse(raw) as { id: string; json: string };
      if (dr.id === data.id && dr.json !== snapshot() && formatMapJson(JSON.parse(dr.json) as MapData) !== fromFile) offerDraft(dr.json);
    }
  } catch {
    /* rascunho corrompido: ignora */
  }
}

function offerDraft(json: string): void {
  stage.querySelector('.banner')?.remove();
  const el = document.createElement('div');
  el.className = 'banner';
  el.innerHTML = `Há alterações não salvas deste mapa de uma sessão anterior. <button class="btn primary" data-b="yes">Restaurar</button><button class="btn" data-b="no">Descartar</button>`;
  el.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).dataset.b;
    if (!b) return;
    if (b === 'yes') {
      const before = snapshot();
      data = normalize(JSON.parse(json) as MapData);
      pushUndo(before);
      changed();
      toast('Rascunho restaurado.', 'good');
    } else localStorage.removeItem(DRAFT_KEY);
    el.remove();
  });
  stage.append(el);
}

/** Garante campos e tamanhos coerentes (arquivos antigos ou editados à mão). */
function normalize(d: MapData): MapData {
  const n: MapData = { ...blankMap(d.id, d.name, d.w, d.h), ...d, format: MAP_FORMAT };
  n.ground = Array.from({ length: n.h }, (_, y) => (n.ground[y] ?? '').padEnd(n.w, '.').slice(0, n.w));
  n.floors = Array.from({ length: n.h }, (_, y) => (n.floors[y] ?? '').padEnd(n.w, '0').slice(0, n.w));
  return n;
}

// ---------------------------------------------------------------------------
// Operações no mapa
// ---------------------------------------------------------------------------

const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < data.w && y < data.h;
const gAt = (x: number, y: number) => data.ground[y]![x]!;
const fAt = (x: number, y: number) => data.floors[y]![x]!;
function setCell(x: number, y: number, g: string | null, f: string | null): void {
  if (!inMap(x, y)) return;
  if (g !== null) data.ground[y] = data.ground[y]!.slice(0, x) + g + data.ground[y]!.slice(x + 1);
  if (f !== null) data.floors[y] = data.floors[y]!.slice(0, x) + f + data.floors[y]!.slice(x + 1);
}

function brushTiles(cx: number, cy: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const r = (brush - 1) / 2;
  for (let y = Math.floor(cy - r); y <= Math.floor(cy + r + 0.001); y++)
    for (let x = Math.floor(cx - r); x <= Math.floor(cx + r + 0.001); x++) {
      if (!inMap(x, y)) continue;
      if (brush >= 5 && Math.hypot(x - cx, y - cy) > r + 0.5) continue;
      out.push([x, y]);
    }
  return out;
}

/** Área contínua (4 vizinhos) com o mesmo chão (ferramentas de chão) ou o mesmo andar. */
function bucketTiles(x: number, y: number): Array<[number, number]> {
  if (!inMap(x, y)) return [];
  const byFloor = tool === 'up' || tool === 'down' || tool === 'setfloor';
  const key = (px: number, py: number) => (byFloor ? fAt(px, py) : gAt(px, py));
  const k0 = key(x, y);
  const seen = new Set<number>([y * data.w + x]);
  const out: Array<[number, number]> = [[x, y]];
  for (let i = 0; i < out.length; i++) {
    const [px, py] = out[i]!;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = px + dx;
      const ny = py + dy;
      if (!inMap(nx, ny) || seen.has(ny * data.w + nx) || key(nx, ny) !== k0) continue;
      seen.add(ny * data.w + nx);
      out.push([nx, ny]);
    }
  }
  return out;
}

let stroke = new Set<number>();
function paint(tiles: Array<[number, number]>): void {
  for (const [x, y] of tiles) {
    const key = y * data.w + x;
    const ch = TERRAIN[tool];
    if (ch !== undefined) {
      const wasWater = gAt(x, y) === '~' || fAt(x, y) === '_';
      if (ch === '~') setCell(x, y, '~', '_');
      else if (ch === '=') setCell(x, y, '=', null);
      else setCell(x, y, ch, wasWater ? String(floorValue) : null);
      continue;
    }
    if (gAt(x, y) === '~' || fAt(x, y) === '_') continue; // o andar do rio não muda
    const cur = parseFloor(fAt(x, y));
    if (tool === 'setfloor') setCell(x, y, null, String(floorValue));
    else if (!stroke.has(key)) {
      stroke.add(key);
      setCell(x, y, null, String(Math.max(0, Math.min(9, cur + (tool === 'up' ? 1 : -1)))));
    }
  }
}

/** Rampa a partir do pé (fx, fy) na direção do cursor; o comprimento acompanha o arraste. */
function rampFrom(fx: number, fy: number, cx: number, cy: number): RampDef {
  const ddx = cx - (fx + 0.5);
  const ddy = cy - (fy + 0.5);
  const horiz = Math.abs(ddx) >= Math.abs(ddy);
  const dx = horiz ? Math.sign(ddx) || 1 : 0;
  const dy = horiz ? 0 : Math.sign(ddy) || 1;
  const len = Math.max(2, Math.min(8, Math.round(Math.abs(horiz ? ddx : ddy))));
  return { x: fx, y: fy, dx, dy, len };
}
function rampOk(r: RampDef): boolean {
  const lv = new Int8Array(data.w * data.h);
  for (let y = 0; y < data.h; y++) for (let x = 0; x < data.w; x++) lv[y * data.w + x] = parseFloor(fAt(x, y));
  const rr = resolveRamp(r, lv, data.w, data.h);
  return !!rr && (rr.rise * 1.6) / rr.len <= 0.9;
}

/** Objeto mais próximo de um ponto (para selecionar). */
function pick(x: number, y: number): Sel {
  let best: Sel = null;
  let bestD = 0.9;
  const consider = (kind: SelKind, index: number, px: number, py: number) => {
    const d = Math.hypot(px - x, py - y);
    if (d < bestD) {
      bestD = d;
      best = { kind, index };
    }
  };
  data.spawns.forEach((s, i) => consider('spawn', i, s.x + 0.5, s.y + 0.5));
  data.npcs.forEach((n, i) => consider('npc', i, n.x, n.y));
  data.books.forEach((b, i) => consider('book', i, b.x, b.y));
  data.traps.forEach((t, i) => consider('trap', i, t.x, t.y));
  data.places.forEach((p, i) => consider('place', i, p.x, p.y));
  consider('start', 0, data.playerStart.x, data.playerStart.y);
  if (data.bossSpawn) consider('boss', 0, data.bossSpawn.x, data.bossSpawn.y);
  if (best) return best;
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  const ei = data.exits.findIndex((e) => tx >= e.x0 && tx <= e.x1 && ty >= e.y0 && ty <= e.y1);
  if (ei >= 0) return { kind: 'exit', index: ei };
  const ri = data.ramps.findIndex((r) => {
    for (let k = 0; k < r.len; k++) for (let o = -1; o <= 1; o++) if (r.x + k * r.dx - o * r.dy === tx && r.y + k * r.dy + o * r.dx === ty) return true;
    return false;
  });
  if (ri >= 0) return { kind: 'ramp', index: ri };
  if (data.arena && Math.hypot(x - data.arena.x, y - data.arena.y) < 1.5) return { kind: 'arena', index: 0 };
  if (Math.hypot(x - data.safe.x, y - data.safe.y) < 1.5) return { kind: 'safe', index: 0 };
  return null;
}

/** Posição (x, y) do objeto selecionado; mover = reescrever essa posição. */
function moveSel(s: Exclude<Sel, null>, x: number, y: number): void {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  const c = { x: tx + 0.5, y: ty + 0.5 };
  switch (s.kind) {
    case 'spawn':
      Object.assign(data.spawns[s.index]!, { x: tx, y: ty });
      break;
    case 'npc':
      Object.assign(data.npcs[s.index]!, c);
      break;
    case 'book':
      Object.assign(data.books[s.index]!, c);
      break;
    case 'trap':
      data.traps[s.index] = c;
      break;
    case 'place':
      Object.assign(data.places[s.index]!, { x: Math.round(x * 2) / 2, y: Math.round(y * 2) / 2 });
      break;
    case 'start':
      data.playerStart = c;
      break;
    case 'boss':
      data.bossSpawn = c;
      break;
    case 'safe':
      Object.assign(data.safe, c);
      break;
    case 'arena':
      if (data.arena) Object.assign(data.arena, c);
      break;
    case 'exit': {
      const e = data.exits[s.index]!;
      const w = e.x1 - e.x0;
      const h = e.y1 - e.y0;
      Object.assign(e, { x0: tx, y0: ty, x1: tx + w, y1: ty + h });
      break;
    }
    case 'ramp':
      Object.assign(data.ramps[s.index]!, { x: tx, y: ty });
      break;
  }
}

function deleteSel(): void {
  if (!sel) return;
  const before = snapshot();
  const i = sel.index;
  switch (sel.kind) {
    case 'spawn':
      data.spawns.splice(i, 1);
      break;
    case 'npc':
      data.npcs.splice(i, 1);
      break;
    case 'book':
      data.books.splice(i, 1);
      break;
    case 'trap':
      data.traps.splice(i, 1);
      break;
    case 'place':
      data.places.splice(i, 1);
      break;
    case 'exit':
      data.exits.splice(i, 1);
      break;
    case 'ramp':
      data.ramps.splice(i, 1);
      break;
    case 'boss':
      data.bossSpawn = null;
      break;
    case 'arena':
      data.arena = null;
      break;
    default:
      toast('O início do jogador e o lugar seguro não podem ser apagados (só movidos).', 'bad');
      return;
  }
  sel = null;
  pushUndo(before);
  changed();
}

function newBookId(): string {
  const ids = new Set(data.books.map((b) => b.id));
  let n = data.books.length + 1;
  while (ids.has(`${data.id}-livro-${n}`)) n++;
  return `${data.id}-livro-${n}`;
}

// ---------------------------------------------------------------------------
// Mouse e teclado
// ---------------------------------------------------------------------------

const toWorld = (sx: number, sy: number) => ({ x: (sx - view.ox) / view.z, y: (sy - view.oy) / view.z });
let drag: null | { kind: 'pan'; sx: number; sy: number; ox: number; oy: number } | { kind: 'edit'; before: string; start: { x: number; y: number }; moved: boolean } = null;
let spaceDown = false;

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  const r = canvas.getBoundingClientRect();
  const sx = e.clientX - r.left;
  const sy = e.clientY - r.top;
  if (e.button === 1 || e.button === 2 || spaceDown) {
    drag = { kind: 'pan', sx, sy, ox: view.ox, oy: view.oy };
    stage.classList.add('panning');
    return;
  }
  if (e.button !== 0) return;
  const p = toWorld(sx, sy);
  const tx = Math.floor(p.x);
  const ty = Math.floor(p.y);
  drag = { kind: 'edit', before: snapshot(), start: p, moved: false };
  stroke = new Set();
  if (PAINT_TOOLS.includes(tool)) {
    if (!inMap(tx, ty)) return;
    paint(bucket ? bucketTiles(tx, ty) : brushTiles(p.x, p.y));
    changed(false);
    return;
  }
  if (tool === 'select') {
    sel = pick(p.x, p.y);
    renderSide();
    requestDraw();
    return;
  }
  if (!inMap(tx, ty)) return;
  const c = { x: tx + 0.5, y: ty + 0.5 };
  switch (tool) {
    case 'spawn':
      data.spawns.push({ kind: spawnKind, x: tx, y: ty });
      sel = { kind: 'spawn', index: data.spawns.length - 1 };
      break;
    case 'npc':
      data.npcs.push({ id: npcId, ...c });
      sel = { kind: 'npc', index: data.npcs.length - 1 };
      break;
    case 'book':
      data.books.push({ id: newBookId(), spell: spellId, ...c });
      sel = { kind: 'book', index: data.books.length - 1 };
      break;
    case 'trap':
      data.traps.push(c);
      sel = { kind: 'trap', index: data.traps.length - 1 };
      break;
    case 'place':
      data.places.push({ name: 'Novo lugar', x: c.x, y: c.y });
      sel = { kind: 'place', index: data.places.length - 1 };
      break;
    case 'start':
      data.playerStart = c;
      sel = { kind: 'start', index: 0 };
      break;
    case 'boss':
      data.bossSpawn = c;
      sel = { kind: 'boss', index: 0 };
      break;
    case 'safe':
    case 'arena':
    case 'exit':
    case 'ramp':
      preview =
        tool === 'exit'
          ? { type: 'rect', x0: tx, y0: ty, x1: tx, y1: ty }
          : tool === 'ramp'
            ? { type: 'ramp', ramp: rampFrom(tx, ty, p.x, p.y), ok: false }
            : { type: 'circle', x: c.x, y: c.y, r: tool === 'safe' ? data.safe.r : (data.arena?.r ?? 8) };
      requestDraw();
      return;
  }
  changed();
});

canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();
  const sx = e.clientX - r.left;
  const sy = e.clientY - r.top;
  const p = toWorld(sx, sy);
  hover = p;
  if (drag?.kind === 'pan') {
    view.ox = drag.ox + (sx - drag.sx);
    view.oy = drag.oy + (sy - drag.sy);
  } else if (drag?.kind === 'edit') {
    drag.moved = true;
    const tx = Math.floor(p.x);
    const ty = Math.floor(p.y);
    if (PAINT_TOOLS.includes(tool) && !bucket) {
      paint(brushTiles(p.x, p.y));
      changed(false);
    } else if (tool === 'select' && sel) {
      moveSel(sel, p.x, p.y);
      changed(false);
    } else if (preview?.type === 'rect') {
      preview.x1 = Math.max(0, Math.min(data.w - 1, tx));
      preview.y1 = Math.max(0, Math.min(data.h - 1, ty));
    } else if (preview?.type === 'circle') {
      preview.r = Math.max(2, Math.min(16, Math.round(Math.hypot(p.x - preview.x, p.y - preview.y))));
    } else if (preview?.type === 'ramp') {
      preview.ramp = rampFrom(preview.ramp.x, preview.ramp.y, p.x, p.y);
      preview.ok = rampOk(preview.ramp);
    }
  }
  updateStatus();
  requestDraw();
});

const endDrag = () => {
  stage.classList.remove('panning');
  if (drag?.kind === 'edit') {
    const p = preview;
    if (p?.type === 'rect') {
      const e = {
        to: known.find((k) => k.id !== data.id)?.id ?? '',
        x0: Math.min(p.x0, p.x1),
        y0: Math.min(p.y0, p.y1),
        x1: Math.max(p.x0, p.x1),
        y1: Math.max(p.y0, p.y1),
        arrive: { x: 4, y: Math.floor(data.h / 2) + 0.5 },
        needsBoss: false,
      };
      data.exits.push(e);
      sel = { kind: 'exit', index: data.exits.length - 1 };
    } else if (p?.type === 'circle') {
      if (tool === 'safe') {
        data.safe = { ...data.safe, x: p.x, y: p.y, r: p.r };
        sel = { kind: 'safe', index: 0 };
      } else {
        data.arena = { x: p.x, y: p.y, r: p.r };
        if (!data.bossSpawn) data.bossSpawn = { x: p.x + 0.5, y: p.y };
        sel = { kind: 'arena', index: 0 };
      }
    } else if (p?.type === 'ramp') {
      if (!p.ok) toast('Rampa inválida: o pé precisa ficar num andar e o topo num andar acima (no máximo 1,6 m de subida a cada ~2 tiles).', 'bad');
      data.ramps.push(p.ramp);
      sel = { kind: 'ramp', index: data.ramps.length - 1 };
    }
    preview = null;
    pushUndo(drag.before);
    changed();
  }
  drag = null;
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('pointerleave', () => {
  hover = null;
  requestDraw();
});

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    const before = toWorld(sx, sy);
    view.z = Math.max(3, Math.min(64, view.z * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    view.ox = sx - before.x * view.z;
    view.oy = sy - before.y * view.z;
    updateStatus();
    requestDraw();
  },
  { passive: false },
);

window.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement;
  if (target.closest('input, select, textarea')) return;
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.code === 'KeyS') {
    e.preventDefault();
    void save();
    return;
  }
  if (ctrl && (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey))) {
    e.preventDefault();
    doRedo();
    return;
  }
  if (ctrl && e.code === 'KeyZ') {
    e.preventDefault();
    doUndo();
    return;
  }
  if (ctrl) return;
  if (e.code === 'Space') {
    spaceDown = true;
    e.preventDefault();
    return;
  }
  if (e.code === 'Delete' || e.code === 'Backspace') return deleteSel();
  if (e.code === 'Escape') {
    sel = null;
    preview = null;
    renderSide();
    requestDraw();
    return;
  }
  if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
    const sizes = [1, 2, 3, 5];
    brush = sizes[Math.max(0, Math.min(3, sizes.indexOf(brush) + (e.code === 'BracketRight' ? 1 : -1)))]!;
    renderTools();
    return;
  }
  if (e.code === 'KeyP') {
    bucket = !bucket;
    renderTools();
    return;
  }
  const digit = /^Digit(\d)$/.exec(e.code)?.[1];
  if (digit !== undefined && tool === 'setfloor') {
    floorValue = Number(digit);
    renderTools();
    return;
  }
  const t = TOOLS.find((x) => x.key === (digit ?? e.key.toUpperCase()));
  if (t) setTool(t.id);
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') spaceDown = false;
});

function doUndo(): void {
  const prev = undo.pop();
  if (!prev) return;
  redo.push(snapshot());
  data = JSON.parse(prev) as MapData;
  sel = null;
  changed();
}
function doRedo(): void {
  const next = redo.pop();
  if (!next) return;
  undo.push(snapshot());
  data = JSON.parse(next) as MapData;
  sel = null;
  changed();
}

// ---------------------------------------------------------------------------
// Painel lateral: mapa, seleção, validação, legenda
// ---------------------------------------------------------------------------

function field(label: string, input: string): string {
  return `<div class="field"><label>${label}</label>${input}</div>`;
}
const num = (k: string, v: number, step = 1, min?: number, max?: number) =>
  `<input type="number" data-f="${k}" value="${v}" step="${step}" ${min !== undefined ? `min="${min}"` : ''} ${max !== undefined ? `max="${max}"` : ''}/>`;
const txt = (k: string, v: string) => `<input type="text" data-f="${k}" value="${esc(v)}"/>`;

function selCard(): string {
  if (!sel) return `<div class="card"><h3>Seleção</h3><p class="muted">Use <b>Selecionar (V)</b> e clique num objeto para editar.</p></div>`;
  const i = sel.index;
  let body = '';
  let title = '';
  switch (sel.kind) {
    case 'spawn': {
      const s = data.spawns[i]!;
      title = 'Monstro';
      body =
        field('Tipo', `<select data-f="spawn.kind">${SPAWN_KINDS.map((k) => `<option value="${k}" ${k === s.kind ? 'selected' : ''}>${ENEMIES[k].name}</option>`).join('')}</select>`) +
        `<div class="field two"><label>Tile</label>${num('spawn.x', s.x)}${num('spawn.y', s.y)}</div>`;
      break;
    }
    case 'npc': {
      const n = data.npcs[i]!;
      title = 'NPC';
      body =
        field('Quem', `<select data-f="npc.id">${(Object.keys(NPCS) as NpcId[]).map((k) => `<option value="${k}" ${k === n.id ? 'selected' : ''}>${NPCS[k].name}</option>`).join('')}</select>`) +
        `<p class="muted">${esc(NPCS[n.id]?.title ?? '')}. Os diálogos ficam no código (por enquanto).</p>`;
      break;
    }
    case 'book': {
      const b = data.books[i]!;
      title = 'Livro antigo';
      body =
        field('Magia', `<select data-f="book.spell">${(Object.keys(SPELLS) as SpellId[]).map((k) => `<option value="${k}" ${k === b.spell ? 'selected' : ''}>${SPELLS[k].name}</option>`).join('')}</select>`) +
        field('Id', txt('book.id', b.id)) +
        `<p class="muted">O id marca o livro como lido no personagem; precisa ser único no jogo todo.</p>`;
      break;
    }
    case 'trap':
      title = 'Armadilha';
      body = `<p class="muted">Arme-a no caminho do jogador. Arraste para mover.</p>`;
      break;
    case 'place':
      title = 'Nome de lugar';
      body = field('Nome', txt('place.name', data.places[i]!.name));
      break;
    case 'exit': {
      const e = data.exits[i]!;
      const opts = known.filter((k) => k.id !== data.id);
      title = 'Saída';
      body =
        field(
          'Leva a',
          `<select data-f="exit.to">${opts.map((k) => `<option value="${k.id}" ${k.id === e.to ? 'selected' : ''}>${esc(k.name)}</option>`).join('')}${
            e.to && !opts.some((k) => k.id === e.to) ? `<option value="${esc(e.to)}" selected>${esc(e.to)} (não existe)</option>` : ''
          }</select>`,
        ) +
        `<div class="field two"><label>Chega em</label>${num('exit.ax', e.arrive.x, 0.5)}${num('exit.ay', e.arrive.y, 0.5)}</div>` +
        field('Trancada', `<label><input type="checkbox" data-f="exit.boss" ${e.needsBoss ? 'checked' : ''}/> só depois do chefe</label>`) +
        `<p class="muted">"Chega em" é a posição (x, y) no mapa de destino.</p>`;
      break;
    }
    case 'start':
      title = 'Início do jogador';
      body = `<p class="muted">Onde o jogador nasce e renasce. Deixe dentro do lugar seguro.</p>`;
      break;
    case 'boss':
      title = 'Chefe';
      body = `<p class="muted">O chefe da região. Ele nunca sai da arena.</p>`;
      break;
    case 'safe':
      title = 'Lugar seguro';
      body = field('Nome', txt('safe.name', data.safe.name)) + field('Raio', num('safe.r', data.safe.r, 0.5, 2, 16)) + `<p class="muted">Sem dano; inimigos não entram; medita-se aqui.</p>`;
      break;
    case 'arena':
      title = 'Arena do chefe';
      body = field('Raio', num('arena.r', data.arena?.r ?? 8, 0.5, 3, 16));
      break;
    case 'ramp': {
      const r = data.ramps[i]!;
      const lv = new Int8Array(data.w * data.h);
      for (let y = 0; y < data.h; y++) for (let x = 0; x < data.w; x++) lv[y * data.w + x] = parseFloor(fAt(x, y));
      const rr = resolveRamp(r, lv, data.w, data.h);
      const dir = r.dx > 0 ? 'e' : r.dx < 0 ? 'w' : r.dy > 0 ? 's' : 'n';
      title = 'Rampa';
      body =
        field(
          'Sobe para',
          `<select data-f="ramp.dir">${[
            ['n', 'Norte ↑'],
            ['s', 'Sul ↓'],
            ['e', 'Leste →'],
            ['w', 'Oeste ←'],
          ]
            .map(([k, l]) => `<option value="${k}" ${k === dir ? 'selected' : ''}>${l}</option>`)
            .join('')}</select>`,
        ) +
        field('Comprimento', num('ramp.len', r.len, 1, 2, 8)) +
        `<p class="${rr ? 'muted' : ''}" style="${rr ? '' : 'color:var(--bad)'}">${rr ? `Do andar ${rr.from} ao andar ${rr.from + rr.rise}.` : 'Não liga dois andares: o topo precisa ficar num andar acima do pé.'}</p>`;
      break;
    }
  }
  const canDelete = sel.kind !== 'start' && sel.kind !== 'safe';
  return `<div class="card"><h3>${title}${canDelete ? '<button class="btn" data-a="del" title="Delete">Apagar</button>' : ''}</h3>${body}</div>`;
}

function renderSide(): void {
  const focusKey = (document.activeElement as HTMLElement | null)?.dataset?.f;
  sideEl.innerHTML = `
    <div class="card">
      <h3>Mapa</h3>
      ${field('Nome', txt('map.name', data.name))}
      ${field('Id (arquivo)', txt('map.id', data.id))}
      ${field('Tier', num('map.tier', data.tier, 1, 1, 8))}
      ${field('Tema', `<select data-f="map.theme"><option value="vale" ${data.theme === 'vale' ? 'selected' : ''}>Vale (pinheiros)</option><option value="autumn" ${data.theme === 'autumn' ? 'selected' : ''}>Outono (acampamento)</option></select>`)}
      <div class="field two"><label>Tamanho</label>${num('map.w', data.w, 1, 16, 256)}${num('map.h', data.h, 1, 16, 256)}</div>
      <p class="muted">Arquivo: <b>src/maps/${esc(data.id)}.json</b></p>
    </div>
    ${selCard()}
    <div class="card"><h3>Validação <span class="muted" data-r="issue-count"></span></h3><div class="issues" data-r="issues"></div></div>
    <div class="card">
      <h3>Legenda</h3>
      <div class="legend">
        <span class="sw" style="background:${TILE_COLORS.cliff}"></span><span>Parede de rocha (automática entre andares)</span>
        <span class="sw" style="background:${TILE_COLORS.ramp}"></span><span>Rampa (setas apontam para cima)</span>
        <span class="sw" style="background:#e0533f;border-radius:50%"></span><span>Monstro (C Carniçal, E Espreitador, B Bruto, L Lançador)</span>
        <span class="sw" style="background:#f2d36b;border-radius:50%"></span><span>NPC</span>
        <span class="sw" style="background:#a98cff"></span><span>Livro antigo</span>
        <span class="sw" style="background:#7ed37a;border-radius:50%"></span><span>Início do jogador</span>
      </div>
    </div>
    <div class="card keys">
      <h3>Atalhos</h3>
      <kbd>Ctrl</kbd>+<kbd>S</kbd> salvar · <kbd>Ctrl</kbd>+<kbd>Z</kbd>/<kbd>Y</kbd> desfazer/refazer<br/>
      <kbd>[</kbd> <kbd>]</kbd> tamanho do pincel · <kbd>P</kbd> balde<br/>
      <kbd>Del</kbd> apaga a seleção · <kbd>Esc</kbd> solta<br/>
      Botão direito ou <kbd>Espaço</kbd> + arrastar: mover a vista
    </div>`;
  renderIssues();
  if (focusKey) sideEl.querySelector<HTMLElement>(`[data-f="${focusKey}"]`)?.focus();
}

function renderIssues(): void {
  const list = sideEl.querySelector<HTMLElement>('[data-r="issues"]');
  const count = sideEl.querySelector<HTMLElement>('[data-r="issue-count"]');
  if (!list || !count) return;
  const errs = issues.filter((i) => i.level === 'erro').length;
  count.textContent = issues.length ? `${errs} erro(s), ${issues.length - errs} aviso(s)` : '';
  list.innerHTML = issues.length
    ? issues.map((is, i) => `<div class="issue ${is.level}" data-issue="${i}">${esc(is.msg)}</div>`).join('')
    : `<div class="ok-line">✓ Tudo certo: tudo alcançável e as rampas ligam os andares.</div>`;
}

sideEl.addEventListener('click', (ev) => {
  const el = ev.target as HTMLElement;
  if (el.closest('[data-a="del"]')) return deleteSel();
  const is = el.closest<HTMLElement>('[data-issue]');
  if (is) {
    const it = issues[Number(is.dataset.issue)];
    if (it?.x !== undefined && it.y !== undefined) {
      const r = canvas.getBoundingClientRect();
      view.ox = r.width / 2 - it.x * view.z;
      view.oy = r.height / 2 - it.y * view.z;
      flash = { x: it.x, y: it.y, t: 0 };
      if (view3d) preview3d.focus(it.x, it.y);
      requestDraw();
    }
  }
});

sideEl.addEventListener('change', (ev) => {
  const el = ev.target as HTMLInputElement;
  const k = el.dataset.f;
  if (!k) return;
  const before = snapshot();
  const v = el.type === 'checkbox' ? el.checked : el.value;
  const n = Number(v);
  const i = sel?.index ?? 0;
  switch (k) {
    case 'map.name':
      data.name = String(v);
      break;
    case 'map.id': {
      const id = String(v)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-|-$/g, '');
      if (id) {
        data.id = id;
        savedJson = ''; // novo arquivo
      }
      break;
    }
    case 'map.tier':
      data.tier = Math.max(1, Math.min(8, Math.round(n) || 1));
      break;
    case 'map.theme':
      data.theme = v === 'autumn' ? 'autumn' : 'vale';
      break;
    case 'map.w':
    case 'map.h':
      resize(k === 'map.w' ? Math.round(n) : data.w, k === 'map.h' ? Math.round(n) : data.h);
      break;
    case 'spawn.kind':
      data.spawns[i]!.kind = v as SpawnKind;
      spawnKind = v as SpawnKind;
      break;
    case 'spawn.x':
      data.spawns[i]!.x = Math.round(n);
      break;
    case 'spawn.y':
      data.spawns[i]!.y = Math.round(n);
      break;
    case 'npc.id':
      data.npcs[i]!.id = v as NpcId;
      break;
    case 'book.spell':
      data.books[i]!.spell = v as SpellId;
      break;
    case 'book.id':
      data.books[i]!.id = String(v).trim() || newBookId();
      break;
    case 'place.name':
      data.places[i]!.name = String(v);
      break;
    case 'exit.to':
      data.exits[i]!.to = String(v);
      break;
    case 'exit.ax':
      data.exits[i]!.arrive.x = n;
      break;
    case 'exit.ay':
      data.exits[i]!.arrive.y = n;
      break;
    case 'exit.boss':
      data.exits[i]!.needsBoss = !!v;
      break;
    case 'safe.name':
      data.safe.name = String(v);
      break;
    case 'safe.r':
      data.safe.r = Math.max(2, Math.min(16, n));
      break;
    case 'arena.r':
      if (data.arena) data.arena.r = Math.max(3, Math.min(16, n));
      break;
    case 'ramp.len':
      data.ramps[i]!.len = Math.max(2, Math.min(8, Math.round(n)));
      break;
    case 'ramp.dir': {
      const d = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[String(v) as 'n' | 's' | 'e' | 'w'];
      Object.assign(data.ramps[i]!, { dx: d[0], dy: d[1] });
      break;
    }
  }
  pushUndo(before);
  changed();
});

/** Muda o tamanho do mapa (corta ou estende; o novo espaço é grama no térreo). */
function resize(w: number, h: number): void {
  w = Math.max(16, Math.min(256, w || data.w));
  h = Math.max(16, Math.min(256, h || data.h));
  data.ground = Array.from({ length: h }, (_, y) => (data.ground[y] ?? '').padEnd(w, '.').slice(0, w));
  data.floors = Array.from({ length: h }, (_, y) => (data.floors[y] ?? '').padEnd(w, '0').slice(0, w));
  data.w = w;
  data.h = h;
}

// ---------------------------------------------------------------------------
// Barra superior: abrir, novo, salvar, ligar andares, testar
// ---------------------------------------------------------------------------

async function refreshList(selectId?: string): Promise<void> {
  try {
    const res = await fetch('/__maps');
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) throw new Error('sem API');
    known = (await res.json()) as Array<{ id: string; name: string }>;
    apiOnline = true;
  } catch {
    apiOnline = false;
  }
  const ids = new Set(known.map((k) => k.id));
  mapsSel.innerHTML =
    known.map((k) => `<option value="${k.id}">${esc(k.name)} (${k.id})</option>`).join('') +
    (ids.has(data.id) ? '' : `<option value="${esc(data.id)}">${esc(data.name)} (novo)</option>`);
  mapsSel.value = selectId ?? data.id;
}

async function openMap(id: string): Promise<void> {
  try {
    const res = await fetch(`/__maps/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(await res.text());
    const text = await res.text();
    load(JSON.parse(text) as MapData, text);
    mapsSel.value = id;
  } catch (e) {
    toast(`Não consegui abrir "${id}": ${String(e)}`, 'bad');
  }
}

mapsSel.addEventListener('change', () => {
  if (formatMapJson(data) !== savedJson && !confirm('Há alterações não salvas neste mapa. Abrir outro mesmo assim? (o rascunho fica guardado)')) {
    mapsSel.value = data.id;
    return;
  }
  void openMap(mapsSel.value);
});

async function save(): Promise<void> {
  const json = formatMapJson(data);
  const errs = issues.filter((i) => i.level === 'erro').length;
  if (!apiOnline) {
    // Sem o servidor de desenvolvimento: baixa o arquivo para colocar em src/maps/.
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = `${data.id}.json`;
    a.click();
    toast(`Baixado ${data.id}.json — coloque em src/maps/.`, 'good');
    return;
  }
  try {
    const res = await fetch(`/__maps/${encodeURIComponent(data.id)}`, { method: 'PUT', body: json, headers: { 'Content-Type': 'application/json' } });
    const out = (await res.json()) as { ok?: boolean; file?: string; error?: string };
    if (!res.ok || !out.ok) throw new Error(out.error ?? res.statusText);
    savedJson = json;
    updateDirty();
    localStorage.removeItem(DRAFT_KEY);
    toast(`Salvo em ${out.file}${errs ? ` (com ${errs} erro(s) na validação)` : ''}`, errs ? '' : 'good');
    await refreshList(data.id);
  } catch (e) {
    toast(`Erro ao salvar: ${String(e)}`, 'bad');
  }
}

function newMapDialog(): void {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal">
    <h2>Novo mapa</h2>
    ${field('Nome', '<input type="text" data-n="name" value="Nova região"/>')}
    ${field('Id (arquivo)', '<input type="text" data-n="id" value="nova-regiao"/>')}
    <div class="field two"><label>Tamanho</label><input type="number" data-n="w" value="64" min="16" max="256"/><input type="number" data-n="h" value="48" min="16" max="256"/></div>
    <p class="muted">Começa plano (andar 0), com borda de floresta e um lugar seguro.</p>
    <div class="row"><button class="btn" data-b="cancel">Cancelar</button><button class="btn primary" data-b="ok">Criar</button></div>
  </div>`;
  const get = (k: string) => back.querySelector<HTMLInputElement>(`[data-n="${k}"]`)!.value;
  back.querySelector<HTMLInputElement>('[data-n="name"]')!.addEventListener('input', (e) => {
    back.querySelector<HTMLInputElement>('[data-n="id"]')!.value = (e.target as HTMLInputElement).value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-|-$/g, '');
  });
  back.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).dataset.b;
    if (b === 'cancel' || e.target === back) back.remove();
    if (b === 'ok') {
      const id = get('id');
      if (!/^[a-z0-9-]+$/.test(id)) return toast('Id inválido: use letras minúsculas, números e hífen.', 'bad');
      if (known.some((k) => k.id === id)) return toast('Já existe um mapa com esse id.', 'bad');
      load(blankMap(id, get('name') || id, Math.max(16, Math.min(256, Number(get('w')) || 64)), Math.max(16, Math.min(256, Number(get('h')) || 48))), '');
      void refreshList(id);
      back.remove();
    }
  });
  document.body.append(back);
  back.querySelector<HTMLInputElement>('[data-n="name"]')!.select();
}

function playtest(): void {
  try {
    localStorage.setItem(PLAYTEST_KEY, JSON.stringify(data));
  } catch {
    return toast('Sem espaço no navegador para o teste.', 'bad');
  }
  window.open('./index.html?playtest=1', 'vv-playtest');
}

root.querySelector('.top')!.addEventListener('click', (ev) => {
  const el = ev.target as HTMLElement;
  const a = el.closest<HTMLElement>('[data-a]')?.dataset.a;
  const m = el.closest<HTMLElement>('[data-m]')?.dataset.m;
  const d = el.closest<HTMLElement>('[data-d]')?.dataset.d;
  if (a === 'new') newMapDialog();
  if (a === 'save') void save();
  if (a === 'undo') doUndo();
  if (a === 'redo') doRedo();
  if (a === 'play') playtest();
  if (a === 'connect') {
    const before = snapshot();
    const n = autoConnect(data);
    pushUndo(before);
    changed();
    toast(n ? `${n} rampa(s) nova(s) ligando os andares.` : 'Nada a ligar: todo platô grande já tem acesso.', n ? 'good' : '');
  }
  if (m) {
    mode = m as 'natural' | 'floors';
    root.querySelectorAll('[data-m]').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.m === mode));
    requestDraw();
  }
  if (d) {
    view3d = d === '3d';
    root.querySelectorAll('[data-d]').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.d === d));
    canvas.style.display = view3d ? 'none' : 'block';
    hintEl.style.display = view3d ? 'none' : 'block';
    if (view3d) {
      preview3d.setMap(compiled);
      preview3d.show();
    } else preview3d.hide();
  }
});

// ---------------------------------------------------------------------------
// Desenho
// ---------------------------------------------------------------------------

let drawQueued = false;
function requestDraw(): void {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => {
    drawQueued = false;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const footprint =
      hover && !drag && PAINT_TOOLS.includes(tool) && !bucket
        ? brushTiles(hover.x, hover.y)
        : hover && !PAINT_TOOLS.includes(tool) && tool !== 'select' && inMap(Math.floor(hover.x), Math.floor(hover.y))
          ? ([[Math.floor(hover.x), Math.floor(hover.y)]] as Array<[number, number]>)
          : hover && drag && PAINT_TOOLS.includes(tool) && !bucket
            ? brushTiles(hover.x, hover.y)
            : [];
    draw(ctx, { data, map: compiled, view, mode, hover, footprint, sel, issues, preview, flash }, canvas.clientWidth, canvas.clientHeight);
    if (flash) {
      flash.t += 0.04;
      if (flash.t >= 1) flash = null;
      else requestDraw();
    }
  });
}

function resizeCanvas(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(stage.clientWidth * dpr);
  canvas.height = Math.round(stage.clientHeight * dpr);
  canvas.style.width = `${stage.clientWidth}px`;
  canvas.style.height = `${stage.clientHeight}px`;
  if (view3d) preview3d.resize();
  requestDraw();
}
window.addEventListener('resize', resizeCanvas);

function fitView(): void {
  const cw = stage.clientWidth || 800;
  const ch = stage.clientHeight || 600;
  view.z = Math.max(4, Math.min(28, Math.floor(Math.min((cw - 40) / data.w, (ch - 40) / data.h))));
  view.ox = Math.round((cw - data.w * view.z) / 2);
  view.oy = Math.round((ch - data.h * view.z) / 2);
}

function updateStatus(): void {
  let cell = '';
  if (hover) {
    const x = Math.floor(hover.x);
    const y = Math.floor(hover.y);
    if (inMap(x, y)) {
      const t = compiled.tiles[y * data.w + x] as Tile;
      const names: Record<number, string> = {
        [Tile.Grass]: 'grama',
        [Tile.Tree]: 'árvore',
        [Tile.Rock]: 'rocha',
        [Tile.Water]: 'rio',
        [Tile.Bridge]: 'ponte',
        [Tile.Sanctuary]: 'lugar seguro',
        [Tile.Path]: 'trilha',
        [Tile.Arena]: 'arena',
        [Tile.Cliff]: 'parede de rocha',
        [Tile.Ramp]: 'rampa',
      };
      const fl = compiled.floors[y * data.w + x]!;
      cell = `<span>Tile <b>${x}, ${y}</b></span><span>Andar <b>${fl < 0 ? 'rio' : fl}</b></span><span>Chão <b>${names[t] ?? '?'}</b></span>`;
    }
  }
  statusEl.innerHTML = `${cell}<span>Zoom <b>${Math.round((view.z / 14) * 100)}%</b></span><span>${data.w}×${data.h} tiles</span><span style="margin-left:auto">${
    apiOnline ? 'Salvando em <b>src/maps/</b>' : '<b style="color:var(--warn)">Sem servidor de desenvolvimento</b>: Salvar baixa o arquivo'
  }</span>`;
}

// ---------------------------------------------------------------------------
// Início
// ---------------------------------------------------------------------------

renderTools();
resizeCanvas();
void (async () => {
  await refreshList();
  let last = '';
  try {
    last = localStorage.getItem(LAST_KEY) ?? '';
  } catch {
    /* ignore */
  }
  const first = known.find((k) => k.id === last)?.id ?? known[0]?.id;
  if (first) await openMap(first);
  else {
    load(data, '');
    toast(apiOnline ? 'Nenhum mapa em src/maps ainda. Crie um em "Novo".' : 'Abra o editor com "npm run dev" para salvar direto no projeto.', '');
  }
  updateStatus();
})();
