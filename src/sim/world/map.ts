import { Rng, type Vec2 } from '../math';
import type { NpcId } from '../psyche/dialogues';
import type { SpellId } from '../techniques';

/**
 * Regiões do mundo. Cada uma é descrita por uma especificação (trilha, colinas, lugar seguro,
 * rio, arena, saídas, pontos de interesse) e passa pelo mesmo pipeline de relevo:
 * platôs com encostas íngremes, penhascos que bloqueiam, clareiras e rampas automáticas.
 * Coordenadas em metros; o chão é o plano (x, y). O cliente 3D mapeia y -> Z.
 */
export const Tile = {
  Grass: 0,
  Tree: 1,
  Rock: 2,
  Water: 3,
  Bridge: 4,
  Sanctuary: 5,
  Path: 6,
  Arena: 7,
  /** encosta íngreme de rocha: não dá para subir */
  Cliff: 8,
} as const;
export type Tile = (typeof Tile)[keyof typeof Tile];

export const BLOCKING: ReadonlySet<Tile> = new Set([Tile.Tree, Tile.Rock, Tile.Water, Tile.Cliff]);

/** Altura do tabuleiro da ponte sobre o desfiladeiro. */
export const BRIDGE_DECK = 0.55;
/** Fundo do desfiladeiro (leito do rio). */
export const GORGE_DEPTH = -2.6;

export const REGION_IDS = ['vale', 'varn'] as const;
export type RegionId = (typeof REGION_IDS)[number];
export type Theme = 'vale' | 'autumn';

export interface Circle {
  x: number;
  y: number;
  r: number;
}

export type SpawnKind = 'grunt' | 'stalker' | 'brute' | 'slinger';

export interface SpawnDef {
  kind: SpawnKind;
  x: number;
  y: number;
}

export interface Exit {
  to: RegionId;
  /** retângulo (em tiles) que leva à outra região */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** onde se chega na outra região */
  arrive: Vec2;
  /** só abre depois de vencer o chefe desta região */
  needsBoss: boolean;
}

export interface GameMap {
  id: RegionId;
  name: string;
  /** tier da região (1–8): inimigos mais fortes e mais recompensa */
  tier: number;
  theme: Theme;
  w: number;
  h: number;
  tiles: Uint8Array;
  /** lugar seguro: santuário ou acampamento (sem dano, meditação, renascer) */
  sanctuary: Circle;
  safeName: string;
  arena: Circle | null;
  bridge: { x0: number; x1: number; y0: number; y1: number } | null;
  playerStart: Vec2;
  bossSpawn: Vec2 | null;
  spawns: SpawnDef[];
  traps: Vec2[];
  npcs: Array<{ id: NpcId; x: number; y: number }>;
  /** livros antigos: cada um ensina uma magia fixa */
  books: Array<{ id: string; spell: SpellId; x: number; y: number }>;
  exits: Exit[];
  /** variação visual por tile (0–1), para o cliente */
  variation: Float32Array;
  /** altura (m) em cada canto de tile: (w+1) x (h+1) */
  heights: Float32Array;
  /** centro da trilha (y) para cada x; NaN onde não há trilha */
  pathY: Float32Array;
  /** nomes de lugares para o mapa */
  places: Array<{ name: string; x: number; y: number }>;
}

/** Altura de cada degrau do relevo (curvas de nível). */
export const TERRACE = 0.5;

/** Altura do chão em qualquer ponto (interpolação bilinear dos cantos). */
export function heightAt(m: GameMap, x: number, y: number): number {
  const fx = Math.max(0, Math.min(m.w - 0.001, x));
  const fy = Math.max(0, Math.min(m.h - 0.001, y));
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fx - ix;
  const ty = fy - iy;
  const W = m.w + 1;
  const a = m.heights[iy * W + ix]!;
  const b = m.heights[iy * W + ix + 1]!;
  const c = m.heights[(iy + 1) * W + ix]!;
  const d = m.heights[(iy + 1) * W + ix + 1]!;
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

/** Altura do piso onde personagens e objetos se apoiam (a ponte tem altura própria). */
export function floorAt(m: GameMap, x: number, y: number): number {
  const ix = Math.max(0, Math.min(m.w - 1, Math.floor(x)));
  const iy = Math.max(0, Math.min(m.h - 1, Math.floor(y)));
  if (m.tiles[iy * m.w + ix] === Tile.Bridge) return BRIDGE_DECK;
  return heightAt(m, x, y);
}

/** Nível do terraço (inteiro) de um tile. */
export function terraceLevel(m: GameMap, x: number, y: number): number {
  return Math.round(heightAt(m, x + 0.5, y + 0.5) / TERRACE);
}

export function tileAt(m: GameMap, x: number, y: number): Tile {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= m.w || iy >= m.h) return Tile.Tree;
  return m.tiles[iy * m.w + ix] as Tile;
}

export const isBlocked = (m: GameMap, x: number, y: number) => BLOCKING.has(tileAt(m, x, y));

export const inCircle = (c: Circle, p: Vec2, pad = 0) => Math.hypot(p.x - c.x, p.y - c.y) <= c.r + pad;

export function exitAt(m: GameMap, p: Vec2): Exit | null {
  return m.exits.find((e) => p.x >= e.x0 && p.x <= e.x1 + 1 && p.y >= e.y0 && p.y <= e.y1 + 1) ?? null;
}

// ---------------------------------------------------------------------------
// Especificação de uma região
// ---------------------------------------------------------------------------

interface RegionSpec {
  id: RegionId;
  name: string;
  tier: number;
  theme: Theme;
  w: number;
  h: number;
  seed: number;
  safe: Circle;
  safeName: string;
  safeHeight: number;
  arena: (Circle & { height: number }) | null;
  /** rio norte-sul num desfiladeiro, com ponte nas linhas indicadas */
  river: { x: number; bridgeY0: number; bridgeY1: number } | null;
  /** centro da trilha para cada x (NaN = sem trilha) */
  path: (x: number) => number;
  hills: Array<{ x: number; y: number; h: number; r: number }>;
  groves: number;
  spawns: SpawnDef[];
  npcs: Array<{ id: NpcId; x: number; y: number }>;
  books: Array<{ id: string; spell: SpellId; x: number; y: number }>;
  traps: Vec2[];
  exits: Exit[];
  places: Array<{ name: string; x: number; y: number }>;
}

const VALE_W = 72;
const VALE_H = 48;
const VARN_W = 66;
const VARN_H = 46;
const valePath = (x: number) => (x < 9 ? NaN : x < 44 ? 24 + Math.sin(x * 0.18) * 3 : 24.5);
const varnPath = (x: number) => 23 + 5 * Math.sin(x * 0.11);

function valeSpec(): RegionSpec {
  const arena = { x: 60, y: 24, r: 9, height: 0.6 };
  return {
    id: 'vale',
    name: 'Vale da Ponte',
    tier: 1,
    theme: 'vale',
    w: VALE_W,
    h: VALE_H,
    seed: 1337,
    safe: { x: 9, y: 24, r: 5 },
    safeName: 'Santuário',
    safeHeight: 0.4,
    arena,
    river: { x: 47, bridgeY0: 22, bridgeY1: 26 },
    path: valePath,
    hills: [
      { x: 27, y: 9, h: 3.4, r: 5 },
      { x: 37, y: 39, h: 3, r: 5 },
      { x: 18, y: 38, h: 2.4, r: 4.5 },
      { x: 31, y: 31, h: 1.8, r: 3.2 },
      { x: 64, y: 9, h: 4, r: 6 },
      { x: 64, y: 40, h: 3.6, r: 6 },
      { x: 34, y: 16, h: 1.7, r: 3 },
    ],
    groves: 26,
    spawns: [
      { kind: 'grunt', x: 20, y: 19 },
      { kind: 'grunt', x: 21, y: 21 },
      { kind: 'grunt', x: 19, y: 30 },
      { kind: 'grunt', x: 27, y: 14 },
      { kind: 'grunt', x: 28, y: 16 },
      { kind: 'grunt', x: 26, y: 33 },
      { kind: 'grunt', x: 28, y: 34 },
      { kind: 'stalker', x: 31, y: 24 },
      { kind: 'stalker', x: 36, y: 28 },
      { kind: 'stalker', x: 24, y: 9 },
      { kind: 'grunt', x: 35, y: 19 },
      { kind: 'grunt', x: 37, y: 18 },
      { kind: 'grunt', x: 38, y: 31 },
      { kind: 'brute', x: 40, y: 24 },
      { kind: 'brute', x: 33, y: 38 },
    ],
    npcs: [
      { id: 'oren', x: 7.5, y: 22.2 },
      { id: 'kael', x: 12.2, y: 27.2 },
      { id: 'traveler', x: 15.5, y: 27.5 },
      { id: 'pilgrim', x: 30.5, y: 29.5 },
      { id: 'herald', x: 43.2, y: 20.2 },
      { id: 'huntress', x: 21.5, y: 11.5 },
    ],
    books: [
      { id: 'tomeNorth', spell: 'chains', x: 17.5, y: 8.5 },
      { id: 'tomeSouth', spell: 'flowLance', x: 36.5, y: 38.5 },
    ],
    traps: [
      { x: 16.5, y: 24 },
      { x: 24.5, y: 26.5 },
      { x: 33.5, y: 22 },
      { x: 41.5, y: 25 },
      { x: 43.5, y: 23 },
    ],
    exits: [
      {
        to: 'varn',
        x0: VALE_W - 2,
        y0: 22,
        x1: VALE_W - 1,
        y1: 26,
        arrive: { x: 4, y: varnPath(4) },
        needsBoss: true,
      },
    ],
    places: [
      { name: 'Santuário', x: 9, y: 17.5 },
      { name: 'Vale da Ponte', x: 28, y: 22 },
      { name: 'Colina Norte', x: 27, y: 6 },
      { name: 'Rio Lento', x: 48, y: 6 },
      { name: 'A Ponte', x: 47.5, y: 29.5 },
      { name: 'Arena do Guardião', x: 60, y: 13.5 },
      { name: 'Passagem de Varn', x: VALE_W - 5, y: 20.5 },
    ],
  };
}

function varnSpec(): RegionSpec {
  const camp = { x: 9, y: varnPath(9), r: 4 };
  const along = (x: number, dy: number) => ({ x, y: Math.round(varnPath(x) + dy) });
  return {
    id: 'varn',
    name: 'Planalto de Varn',
    tier: 2,
    theme: 'autumn',
    w: VARN_W,
    h: VARN_H,
    seed: 7331,
    safe: camp,
    safeName: 'Acampamento de Varn',
    safeHeight: 0.4,
    arena: null,
    river: null,
    path: varnPath,
    hills: [
      { x: 22, y: 8, h: 4.2, r: 6 },
      { x: 41, y: 37, h: 4, r: 6 },
      { x: 51, y: 9, h: 3.6, r: 5 },
      { x: 30, y: 33, h: 2.4, r: 4 },
      { x: 57, y: 33, h: 3.2, r: 5 },
      { x: 12, y: 38, h: 2.8, r: 5 },
      { x: 36, y: 13, h: 2, r: 3.5 },
    ],
    groves: 32,
    spawns: [
      { kind: 'grunt', ...along(19, -2) },
      { kind: 'grunt', ...along(20, 1) },
      { kind: 'slinger', ...along(24, -6) },
      { kind: 'slinger', ...along(27, 5) },
      { kind: 'grunt', ...along(31, -1) },
      { kind: 'grunt', ...along(32, 2) },
      { kind: 'brute', ...along(37, 0) },
      { kind: 'slinger', ...along(38, -6) },
      { kind: 'stalker', ...along(34, 7) },
      { kind: 'grunt', ...along(45, -2) },
      { kind: 'grunt', ...along(46, 1) },
      { kind: 'slinger', ...along(48, 6) },
      { kind: 'slinger', ...along(50, -5) },
      { kind: 'stalker', ...along(53, -7) },
      { kind: 'brute', ...along(58, 0) },
      { kind: 'slinger', ...along(60, 5) },
    ],
    npcs: [{ id: 'lys', x: camp.x - 1.5, y: camp.y - 2 }],
    books: [{ id: 'tomeVarn', spell: 'repel', x: 44, y: Math.round(varnPath(44) + 9) + 0.5 }],
    traps: [
      { x: 22.5, y: varnPath(22) + 0.5 },
      { x: 35.5, y: varnPath(35) - 0.5 },
      { x: 52.5, y: varnPath(52) + 0.5 },
    ],
    exits: [
      {
        to: 'vale',
        x0: 0,
        y0: Math.round(varnPath(0)) - 2,
        x1: 1,
        y1: Math.round(varnPath(0)) + 2,
        arrive: { x: VALE_W - 4, y: 24.5 },
        needsBoss: false,
      },
    ],
    places: [
      { name: 'Acampamento', x: camp.x, y: camp.y - camp.r - 1.5 },
      { name: 'Planalto de Varn', x: 33, y: varnPath(33) - 3 },
      { name: 'Colinas Rubras', x: 22, y: 3 },
      { name: 'Encosta dos Espinhos', x: 49, y: varnPath(49) + 9 },
      { name: 'Passagem do Vale', x: 5, y: varnPath(0) - 4 },
    ],
  };
}

const SPECS: Record<RegionId, () => RegionSpec> = { vale: valeSpec, varn: varnSpec };

export const REGION_NAMES: Record<RegionId, string> = { vale: 'Vale da Ponte', varn: 'Planalto de Varn' };

/** Compatibilidade: o mapa da primeira região. */
export function buildMap(): GameMap {
  return buildRegion('vale');
}

export function buildRegion(id: RegionId): GameMap {
  const spec = SPECS[id]();
  const rng = new Rng(spec.seed);
  const { w, h } = spec;
  const tiles = new Uint8Array(w * h);
  const variation = new Float32Array(w * h);
  const set = (x: number, y: number, t: Tile) => {
    if (x >= 0 && y >= 0 && x < w && y < h) tiles[y * w + x] = t;
  };
  const get = (x: number, y: number) => tiles[y * w + x] as Tile;
  const safe = spec.safe;
  const arena = spec.arena;
  const pathY = spec.path;
  const river = spec.river;
  const riverAt = (y: number) => (river ? river.x + Math.round(Math.sin(y * 0.22) * 1.5) : NaN);
  // A ponte vai de borda a borda do desfiladeiro (o rio ocupa cx-1 .. cx+2).
  const bridge = river ? { x0: river.x - 3, x1: river.x + 3, y0: river.bridgeY0, y1: river.bridgeY1 } : null;

  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      variation[y * w + x] = rng.next();
      // Borda de floresta, com recorte orgânico.
      const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
      if (edge < 2 || (edge < 4 && rng.chance(0.45 - edge * 0.1))) set(x, y, Tile.Tree);
    }

  if (river && bridge) {
    for (let y = 0; y < h; y++) for (let dx = -1; dx <= 2; dx++) set(riverAt(y) + dx, y, Tile.Water);
    for (let y = bridge.y0; y <= bridge.y1; y++) for (let x = bridge.x0; x <= bridge.x1; x++) set(x, y, Tile.Bridge);
  }

  // Bosques e rochas espalhados (evitando trilha, lugar seguro, arena e ponte).
  const reserved = (x: number, y: number) =>
    Math.hypot(x - safe.x, y - safe.y) < safe.r + 3 ||
    (arena !== null && Math.hypot(x - arena.x, y - arena.y) < arena.r + 1.5) ||
    Math.abs(y - pathY(x)) < 2.5 ||
    (bridge !== null && x > bridge.x0 - 3 && x < bridge.x1 + 3 && y > bridge.y0 - 2 && y < bridge.y1 + 2);
  for (let i = 0; i < spec.groves; i++) {
    const cx = rng.int(6, w - 8);
    const cy = rng.int(5, h - 6);
    const r = rng.range(1, 2.6);
    const kind = rng.chance(0.75) ? Tile.Tree : Tile.Rock;
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if (Math.hypot(x - cx, y - cy) > r || reserved(x, y)) continue;
        if (get(x, y) === Tile.Grass && rng.chance(0.7)) set(x, y, kind);
      }
  }

  // Trilha de terra (até a borda nas saídas).
  for (let x = 0; x < w; x++) {
    const py = pathY(x + 0.5);
    if (Number.isNaN(py)) continue;
    for (let dy = -1; dy <= 1; dy++) {
      const t = get(x, Math.round(py) + dy);
      if (t !== Tile.Water && t !== Tile.Bridge) set(x, Math.round(py) + dy, Tile.Path);
    }
  }

  // Lugar seguro e arena.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (Math.hypot(x + 0.5 - safe.x, y + 0.5 - safe.y) <= safe.r) set(x, y, Tile.Sanctuary);
      if (arena && Math.hypot(x + 0.5 - arena.x, y + 0.5 - arena.y) <= arena.r) set(x, y, Tile.Arena);
    }

  const { spawns, npcs, books, traps, exits } = spec;

  // Garante que spawns, NPCs, livros e saídas estejam em clareiras.
  const clearings = [
    ...spawns,
    ...npcs.map((n) => ({ x: Math.floor(n.x), y: Math.floor(n.y) })),
    ...books.map((b) => ({ x: Math.floor(b.x), y: Math.floor(b.y) })),
  ];
  for (const s of clearings)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) if (BLOCKING.has(get(s.x + dx, s.y + dy))) set(s.x + dx, s.y + dy, Tile.Grass);
  for (const e of exits) for (let y = e.y0; y <= e.y1; y++) for (let x = e.x0; x <= e.x1; x++) set(x, y, Tile.Path);

  // ---------------------------------------------------------------------
  // Relevo: platôs com encostas íngremes, paredes nas bordas, desfiladeiro.
  // ---------------------------------------------------------------------
  const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  const STEP = 1.6;
  const plateau = (v: number) => {
    const k = Math.floor(v / STEP);
    const f = v / STEP - k;
    return (k + smooth((f - 0.68) / 0.32)) * STEP;
  };
  const W1 = w + 1;
  const heights = new Float32Array(W1 * (h + 1));
  const riverCenter = (cy: number) => riverAt(cy) + 1;
  for (let cy = 0; cy <= h; cy++)
    for (let cx = 0; cx <= w; cx++) {
      const edge = Math.min(cx, cy, w - cx, h - cy);
      let hgt = Math.max(0, 6 - edge * 0.8);
      hgt += 0.5 + 0.6 * Math.sin(cx * 0.11 + spec.seed * 0.001) * Math.cos(cy * 0.13 - 0.4) + 0.25 * Math.sin(cx * 0.31 - cy * 0.27);
      for (const k of spec.hills) hgt += k.h * Math.exp(-((cx - k.x) ** 2 + (cy - k.y) ** 2) / (2 * k.r * k.r));
      hgt = plateau(hgt);
      const py = pathY(cx);
      const dPath = Number.isNaN(py) ? Infinity : Math.abs(cy - py);
      hgt *= smooth((dPath - 1.8) / 3);
      if (river) hgt *= smooth((Math.abs(cx - riverCenter(cy)) - 3) / 4);
      const sm = 1 - smooth((Math.hypot(cx - safe.x, cy - safe.y) - safe.r) / 2.5);
      hgt = hgt * (1 - sm) + spec.safeHeight * sm;
      if (arena) {
        const am = 1 - smooth((Math.hypot(cx - arena.x, cy - arena.y) - arena.r) / 3);
        hgt = hgt * (1 - am) + arena.height * am;
      }
      if (river) {
        const riverD = Math.abs(cx - riverCenter(cy));
        if (riverD < 3.2) hgt = hgt + (GORGE_DEPTH - hgt) * (1 - smooth((riverD - 1.6) / 1.6));
      }
      heights[cy * W1 + cx] = hgt;
    }

  // Pontos de interesse ficam em pequenas clareiras planas.
  const pois = [...spawns.map((q) => ({ x: q.x + 0.5, y: q.y + 0.5 })), ...npcs, ...books, ...traps];
  for (const q of pois) {
    const qx = Math.round(q.x);
    const qy = Math.round(q.y);
    const target = heights[qy * W1 + qx]!;
    for (let cy = qy - 3; cy <= qy + 3; cy++)
      for (let cx = qx - 3; cx <= qx + 3; cx++) {
        if (cx < 0 || cy < 0 || cx > w || cy > h) continue;
        const k = 1 - smooth((Math.hypot(cx - q.x, cy - q.y) - 1.4) / 1.4);
        const i = cy * W1 + cx;
        if (heights[i]! > -0.3) heights[i] = heights[i]! + (target - heights[i]!) * k;
      }
  }

  // Encostas íngremes e a borda do desfiladeiro viram penhasco (bloqueiam).
  const corners = (x: number, y: number) => [heights[y * W1 + x]!, heights[y * W1 + x + 1]!, heights[(y + 1) * W1 + x]!, heights[(y + 1) * W1 + x + 1]!];
  const markCliffs = () => {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const t = get(x, y);
        if (t === Tile.Water || t === Tile.Bridge || t === Tile.Cliff) continue;
        const c = corners(x, y);
        if (Math.max(...c) - Math.min(...c) > 0.9 || Math.min(...c) < -0.3) set(x, y, Tile.Cliff);
      }
  };
  markCliffs();

  // Rampas: cada região caminhável isolada ganha acesso pelo caminho com menos penhasco.
  const N4 = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;
  const walkable = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && !BLOCKING.has(get(x, y));
  const startIdx = Math.floor(safe.y) * w + Math.floor(safe.x);
  for (let iter = 0; iter < 16; iter++) {
    const reach = new Uint8Array(w * h);
    const stack = [startIdx];
    reach[startIdx] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      for (const [dx, dy] of N4) {
        const nx = (i % w) + dx;
        const ny = ((i / w) | 0) + dy;
        if (!walkable(nx, ny) || reach[ny * w + nx]) continue;
        reach[ny * w + nx] = 1;
        stack.push(ny * w + nx);
      }
    }
    const comp = new Int32Array(w * h).fill(-1);
    let bestComp = -1;
    let bestSize = 7;
    for (let i = 0; i < w * h; i++) {
      if (reach[i] || comp[i] !== -1 || !walkable(i % w, (i / w) | 0)) continue;
      const st = [i];
      comp[i] = i;
      let size = 0;
      while (st.length) {
        const j = st.pop()!;
        size++;
        for (const [dx, dy] of N4) {
          const nx = (j % w) + dx;
          const ny = ((j / w) | 0) + dy;
          if (!walkable(nx, ny) || reach[ny * w + nx] || comp[ny * w + nx] !== -1) continue;
          comp[ny * w + nx] = i;
          st.push(ny * w + nx);
        }
      }
      if (size > bestSize) {
        bestSize = size;
        bestComp = i;
      }
    }
    if (bestComp < 0) break;
    const cost = new Int32Array(w * h).fill(1e9);
    const prev = new Int32Array(w * h).fill(-1);
    const dq: number[] = [];
    for (let i = 0; i < w * h; i++)
      if (reach[i]) {
        cost[i] = 0;
        dq.push(i);
      }
    let goal = -1;
    while (dq.length) {
      const i = dq.shift()!;
      if (comp[i] === bestComp) {
        goal = i;
        break;
      }
      for (const [dx, dy] of N4) {
        const nx = (i % w) + dx;
        const ny = ((i / w) | 0) + dy;
        if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
        const t = get(nx, ny);
        const step = walkable(nx, ny) ? 0 : t === Tile.Cliff ? 1 : -1;
        if (step < 0) continue;
        const j = ny * w + nx;
        if (cost[i]! + step >= cost[j]!) continue;
        cost[j] = cost[i]! + step;
        prev[j] = i;
        if (step === 0) dq.unshift(j);
        else dq.push(j);
      }
    }
    if (goal < 0) break;
    const path: number[] = [];
    for (let i = goal; i !== -1; i = prev[i]!) path.unshift(i);
    let first = 0;
    for (let k = 0; k < path.length; k++) if (reach[path[k]!]) first = k;
    const ramp = path.slice(first);
    const centerH = (i: number) => corners(i % w, (i / w) | 0).reduce((a, b) => a + b, 0) / 4;
    const h0 = centerH(ramp[0]!);
    const h1 = centerH(ramp[ramp.length - 1]!);
    ramp.forEach((i, k) => {
      const x = i % w;
      const y = (i / w) | 0;
      if (get(x, y) === Tile.Cliff) set(x, y, Tile.Grass);
      const v = h0 + ((h1 - h0) * k) / Math.max(1, ramp.length - 1);
      for (const [cx, cy] of [
        [x, y],
        [x + 1, y],
        [x, y + 1],
        [x + 1, y + 1],
      ] as const)
        heights[cy * W1 + cx] = v;
    });
    markCliffs();
  }

  const pathYs = new Float32Array(w + 1);
  for (let x = 0; x <= w; x++) pathYs[x] = pathY(x);

  return {
    id: spec.id,
    name: spec.name,
    tier: spec.tier,
    theme: spec.theme,
    w,
    h,
    heights,
    pathY: pathYs,
    places: spec.places,
    tiles,
    sanctuary: { x: safe.x, y: safe.y, r: safe.r },
    safeName: spec.safeName,
    arena: arena ? { x: arena.x, y: arena.y, r: arena.r } : null,
    bridge,
    playerStart: { x: safe.x + 0.5, y: safe.y + 0.5 },
    bossSpawn: arena ? { x: arena.x + 2, y: arena.y } : null,
    spawns,
    traps,
    npcs,
    books,
    exits,
    variation,
  };
}

/** Move um círculo pelo mapa resolvendo colisão por eixo (desliza nas paredes). */
export function moveWithCollision(m: GameMap, p: Vec2, dx: number, dy: number, r: number): void {
  const overlap = (x: number, y: number) =>
    +isBlocked(m, x - r, y - r) + +isBlocked(m, x + r, y - r) + +isBlocked(m, x - r, y + r) + +isBlocked(m, x + r, y + r);
  // Livre, ou menos sobreposto do que agora (nunca fica preso numa quina após um empurrão).
  const ok = (x: number, y: number, cur: number) => {
    const o = overlap(x, y);
    return o === 0 || (cur > 0 && o <= cur && !isBlocked(m, x, y));
  };
  if (ok(p.x + dx, p.y, overlap(p.x, p.y))) p.x += dx;
  if (ok(p.x, p.y + dy, overlap(p.x, p.y))) p.y += dy;
}
