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
} as const;
export type Tile = (typeof Tile)[keyof typeof Tile];

export const BLOCKING: ReadonlySet<Tile> = new Set([Tile.Tree, Tile.Rock, Tile.Water]);

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

  return {
    w,
    h,
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
  const free = (x: number, y: number) =>
    !isBlocked(m, x - r, y - r) && !isBlocked(m, x + r, y - r) && !isBlocked(m, x - r, y + r) && !isBlocked(m, x + r, y + r);
  if (free(p.x + dx, p.y)) p.x += dx;
  if (free(p.x, p.y + dy)) p.y += dy;
}
