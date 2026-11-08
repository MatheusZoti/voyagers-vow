import { Rng, type Vec2 } from '../math';
import type { NpcId } from '../psyche/dialogues';
import type { SpellId } from '../techniques';

/**
 * Mapa da fatia vertical: "Vale da Ponte" (tier 1, zona Santuário — sem PvP).
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

export interface Circle {
  x: number;
  y: number;
  r: number;
}

export interface SpawnDef {
  kind: 'grunt' | 'stalker' | 'brute';
  x: number;
  y: number;
}

export interface GameMap {
  w: number;
  h: number;
  tiles: Uint8Array;
  sanctuary: Circle;
  arena: Circle;
  bridge: { x0: number; x1: number; y0: number; y1: number };
  playerStart: Vec2;
  bossSpawn: Vec2;
  spawns: SpawnDef[];
  traps: Vec2[];
  npcs: Array<{ id: NpcId; x: number; y: number }>;
  /** livros antigos: cada um ensina uma magia fixa */
  books: Array<{ id: string; spell: SpellId; x: number; y: number }>;
  /** variação visual por tile (0–1), para o cliente */
  variation: Float32Array;
  /** altura (m) em cada canto de tile: (w+1) x (h+1), em terraços de TERRACE m */
  heights: Float32Array;
  /** centro da trilha (y) para cada x, até a ponte; NaN onde não há trilha */
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

/**
 * Altura do piso do tile (terraço plano), usada para apoiar personagens e objetos
 * no terreno em degraus. A água fica no leito.
 */
export function floorAt(m: GameMap, x: number, y: number): number {
  const ix = Math.max(0, Math.min(m.w - 1, Math.floor(x)));
  const iy = Math.max(0, Math.min(m.h - 1, Math.floor(y)));
  if (m.tiles[iy * m.w + ix] === Tile.Bridge) return BRIDGE_DECK;
  return heightAt(m, x, y);
}

/** Nível do terraço (inteiro) de um tile, para pintar camadas e desenhar curvas de nível. */
export function terraceLevel(m: GameMap, x: number, y: number): number {
  return Math.round(heightAt(m, x + 0.5, y + 0.5) / TERRACE);
}

export const MAP_W = 72;
export const MAP_H = 48;

export function tileAt(m: GameMap, x: number, y: number): Tile {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= m.w || iy >= m.h) return Tile.Tree;
  return m.tiles[iy * m.w + ix] as Tile;
}

export const isBlocked = (m: GameMap, x: number, y: number) => BLOCKING.has(tileAt(m, x, y));

export const inCircle = (c: Circle, p: Vec2, pad = 0) => Math.hypot(p.x - c.x, p.y - c.y) <= c.r + pad;

export function buildMap(seed = 1337): GameMap {
  const rng = new Rng(seed);
  const w = MAP_W;
  const h = MAP_H;
  const tiles = new Uint8Array(w * h);
  const variation = new Float32Array(w * h);
  const set = (x: number, y: number, t: Tile) => {
    if (x >= 0 && y >= 0 && x < w && y < h) tiles[y * w + x] = t;
  };
  const get = (x: number, y: number) => tiles[y * w + x] as Tile;

  const sanctuary: Circle = { x: 9, y: 24, r: 5 };
  const arena: Circle = { x: 60, y: 24, r: 9 };
  const riverX = 47;
  const bridge = { x0: riverX - 2, x1: riverX + 3, y0: 22, y1: 26 };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      variation[y * w + x] = rng.next();
      // Borda de floresta, com recorte orgânico.
      const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
      if (edge < 2 || (edge < 4 && rng.chance(0.45 - edge * 0.1))) set(x, y, Tile.Tree);
    }
  }

  // Rio serpenteando de norte a sul.
  for (let y = 0; y < h; y++) {
    const cx = riverX + Math.round(Math.sin(y * 0.22) * 1.5);
    for (let dx = -1; dx <= 2; dx++) set(cx + dx, y, Tile.Water);
  }
  // Ponte.
  for (let y = bridge.y0; y <= bridge.y1; y++) for (let x = bridge.x0; x <= bridge.x1; x++) set(x, y, Tile.Bridge);

  // Bosques e rochas espalhados no campo (evitando caminho, santuário e arena).
  const pathY = (x: number) => 24 + Math.sin(x * 0.18) * 3;
  const reserved = (x: number, y: number) =>
    Math.hypot(x - sanctuary.x, y - sanctuary.y) < sanctuary.r + 3 ||
    Math.hypot(x - arena.x, y - arena.y) < arena.r + 1.5 ||
    Math.abs(y - pathY(x)) < 2.5 ||
    (x > bridge.x0 - 3 && x < bridge.x1 + 3 && y > bridge.y0 - 2 && y < bridge.y1 + 2);

  for (let i = 0; i < 26; i++) {
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

  // Trilha de terra do santuário até a ponte.
  for (let x = sanctuary.x; x < bridge.x0; x++) {
    const py = Math.round(pathY(x));
    for (let dy = -1; dy <= 1; dy++) if (get(x, py + dy) !== Tile.Water) set(x, py + dy, Tile.Path);
  }

  // Santuário e arena do chefe.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (Math.hypot(x + 0.5 - sanctuary.x, y + 0.5 - sanctuary.y) <= sanctuary.r) set(x, y, Tile.Sanctuary);
      if (Math.hypot(x + 0.5 - arena.x, y + 0.5 - arena.y) <= arena.r) set(x, y, Tile.Arena);
    }
  // Trecho entre a ponte e a arena.
  for (let x = bridge.x1 + 1; x < arena.x - arena.r + 1; x++) for (let y = bridge.y0; y <= bridge.y1; y++) set(x, y, Tile.Path);

  const spawns: SpawnDef[] = [
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
  ];
  const npcs: Array<{ id: NpcId; x: number; y: number }> = [
    { id: 'oren', x: 7.5, y: 22.2 },
    { id: 'kael', x: 12.2, y: 27.2 },
    { id: 'traveler', x: 15.5, y: 27.5 },
    { id: 'pilgrim', x: 30.5, y: 29.5 },
    { id: 'herald', x: 43.2, y: 20.2 },
    { id: 'huntress', x: 21.5, y: 11.5 },
  ];
  const books: Array<{ id: string; spell: SpellId; x: number; y: number }> = [
    { id: 'tomeNorth', spell: 'chains', x: 17.5, y: 8.5 },
    { id: 'tomeSouth', spell: 'flowLance', x: 36.5, y: 38.5 },
  ];

  // Garante que spawns, NPCs e livros estejam em clareiras.
  for (const s of [...spawns, ...npcs.map((n) => ({ x: Math.floor(n.x), y: Math.floor(n.y) })), ...books.map((b) => ({ x: Math.floor(b.x), y: Math.floor(b.y) }))]) {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) if (BLOCKING.has(get(s.x + dx, s.y + dy))) set(s.x + dx, s.y + dy, Tile.Grass);
  }

  const traps: Vec2[] = [
    { x: 16.5, y: 24 },
    { x: 24.5, y: 26.5 },
    { x: 33.5, y: 22 },
    { x: 41.5, y: 25 },
    { x: 43.5, y: 23 },
  ];

  // ---------------------------------------------------------------------
  // Relevo: platôs de grama com encostas íngremes de rocha (como no Albion),
  // paredes do vale nas bordas e o rio num desfiladeiro.
  // ---------------------------------------------------------------------
  const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  /** Degraus macios: topo plano por 70% do degrau, depois sobe rápido (vira penhasco). */
  const STEP = 1.6;
  const plateau = (v: number) => {
    const k = Math.floor(v / STEP);
    const f = v / STEP - k;
    return (k + smooth((f - 0.68) / 0.32)) * STEP;
  };
  const hills = [
    { x: 27, y: 9, h: 3.4, r: 5 },
    { x: 37, y: 39, h: 3, r: 5 },
    { x: 18, y: 38, h: 2.4, r: 4.5 },
    { x: 31, y: 31, h: 1.8, r: 3.2 },
    { x: 64, y: 9, h: 4, r: 6 },
    { x: 64, y: 40, h: 3.6, r: 6 },
    { x: 34, y: 16, h: 1.7, r: 3 },
  ];
  const W1 = w + 1;
  const heights = new Float32Array(W1 * (h + 1));
  const riverCenter = (cy: number) => riverX + Math.round(Math.sin(cy * 0.22) * 1.5) + 0.5;
  for (let cy = 0; cy <= h; cy++)
    for (let cx = 0; cx <= w; cx++) {
      const edge = Math.min(cx, cy, w - cx, h - cy);
      let hgt = Math.max(0, 6 - edge * 0.8);
      hgt += 0.5 + 0.6 * Math.sin(cx * 0.11 + 1.3) * Math.cos(cy * 0.13 - 0.4) + 0.25 * Math.sin(cx * 0.31 - cy * 0.27);
      for (const k of hills) hgt += k.h * Math.exp(-((cx - k.x) ** 2 + (cy - k.y) ** 2) / (2 * k.r * k.r));
      hgt = plateau(hgt);
      // Trilha e ponte aplainadas; beira do rio baixa; santuário e arena em platôs.
      const dPath = cx < bridge.x0 ? Math.abs(cy - pathY(cx)) : Math.abs(cy - (bridge.y0 + bridge.y1 + 1) / 2);
      hgt *= smooth((dPath - 1.8) / 3);
      const riverD = Math.abs(cx - riverCenter(cy));
      hgt *= smooth((riverD - 3) / 4);
      const ds = Math.hypot(cx - sanctuary.x, cy - sanctuary.y);
      const sm = 1 - smooth((ds - sanctuary.r) / 2.5);
      hgt = hgt * (1 - sm) + 0.4 * sm;
      const da = Math.hypot(cx - arena.x, cy - arena.y);
      const am = 1 - smooth((da - arena.r) / 3);
      hgt = hgt * (1 - am) + 0.6 * am;
      // Desfiladeiro: o rio corre no fundo, entre paredes de rocha.
      if (riverD < 3.2) hgt = hgt + (GORGE_DEPTH - hgt) * (1 - smooth((riverD - 1.6) / 1.6));
      heights[cy * W1 + cx] = hgt;
    }

  // Encostas íngremes viram penhasco (bloqueiam), exceto onde o caminho tem que passar.
  const clear = (x: number, y: number) =>
    Math.hypot(x + 0.5 - sanctuary.x, y + 0.5 - sanctuary.y) < sanctuary.r + 1.5 ||
    Math.hypot(x + 0.5 - arena.x, y + 0.5 - arena.y) < arena.r + 1 ||
    Math.abs(y + 0.5 - pathY(x + 0.5)) < 2 ||
    (x >= bridge.x0 - 2 && x <= bridge.x1 + 2 && y >= bridge.y0 - 1 && y <= bridge.y1 + 1) ||
    [...spawns, ...npcs, ...books].some((q) => Math.hypot(x + 0.5 - q.x, y + 0.5 - q.y) < 2.2);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const t = get(x, y);
      if (t === Tile.Water || t === Tile.Bridge || clear(x, y)) continue;
      const c = [heights[y * W1 + x]!, heights[y * W1 + x + 1]!, heights[(y + 1) * W1 + x]!, heights[(y + 1) * W1 + x + 1]!];
      if (Math.max(...c) - Math.min(...c) > 0.95) set(x, y, Tile.Cliff);
    }

  const places = [
    { name: 'Santuário', x: sanctuary.x, y: sanctuary.y - sanctuary.r - 1.5 },
    { name: 'Vale da Ponte', x: 28, y: 22 },
    { name: 'Colina Norte', x: 27, y: 6 },
    { name: 'Rio Lento', x: riverX + 1, y: 6 },
    { name: 'A Ponte', x: (bridge.x0 + bridge.x1) / 2 + 0.5, y: bridge.y1 + 2.5 },
    { name: 'Arena do Guardião', x: arena.x, y: arena.y - arena.r - 1.5 },
  ];

  const pathYs = new Float32Array(w + 1).fill(NaN);
  for (let x = Math.floor(sanctuary.x); x <= w; x++)
    pathYs[x] = x < bridge.x0 ? pathY(x) : x <= arena.x - arena.r + 1 ? (bridge.y0 + bridge.y1 + 1) / 2 : NaN;

  return {
    w,
    h,
    heights,
    pathY: pathYs,
    places,
    tiles,
    sanctuary,
    arena,
    bridge,
    playerStart: { x: sanctuary.x + 0.5, y: sanctuary.y + 0.5 },
    bossSpawn: { x: arena.x + 2, y: arena.y },
    spawns,
    traps,
    npcs,
    books,
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
