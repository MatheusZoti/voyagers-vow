import { Rng, type Vec2 } from '../math';
import type { NpcId } from '../psyche/dialogues';
import type { SpellId } from '../techniques';

/**
 * Regiões do mundo. Cada uma é descrita por uma especificação (trilha, colinas, lugar seguro,
 * rio, arena, saídas, pontos de interesse) e passa pelo mesmo pipeline de relevo, em andares
 * como no Tibia: cada andar é plano, separado do vizinho por uma parede de rocha, e só se
 * troca de andar por rampas largas (por onde monstros também passam).
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
  /** parede de rocha entre dois andares (ou borda do desfiladeiro): não dá para subir */
  Cliff: 8,
  /** rampa entre dois andares vizinhos */
  Ramp: 9,
} as const;
export type Tile = (typeof Tile)[keyof typeof Tile];

export const BLOCKING: ReadonlySet<Tile> = new Set([Tile.Tree, Tile.Rock, Tile.Water, Tile.Cliff]);

/** Altura de um andar (m). O térreo (andar 0) fica na altura 0. */
export const FLOOR_H = 1.6;
/** "Andar" do rio, no fundo do desfiladeiro. */
export const WATER_LEVEL = -1;
/** Altura do tabuleiro da ponte sobre o desfiladeiro. */
export const BRIDGE_DECK = 0.15;
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

/** Rampa reta de 3 tiles de largura: o pé fica em (x, y) no andar `from` e sobe na direção (dx, dy). */
export interface Ramp {
  x: number;
  y: number;
  dx: number;
  dy: number;
  /** comprimento em tiles (o andar de cima começa logo depois) */
  len: number;
  from: number;
  /** quantos andares sobe (1 ou 2) */
  rise: number;
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
  /** andar de cada tile (0 = térreo; WATER_LEVEL no rio) */
  floors: Int8Array;
  ramps: Ramp[];
  /** centro da trilha (y) para cada x; NaN onde não há trilha */
  pathY: Float32Array;
  /** nomes de lugares para o mapa */
  places: Array<{ name: string; x: number; y: number }>;
}

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

/** Andar do tile que contém o ponto (x, y). */
export function floorLevel(m: GameMap, x: number, y: number): number {
  const ix = Math.max(0, Math.min(m.w - 1, Math.floor(x)));
  const iy = Math.max(0, Math.min(m.h - 1, Math.floor(y)));
  return m.floors[iy * m.w + ix]!;
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
  // Andares (como no Tibia): cada tile pertence a um andar inteiro e plano.
  // Entre andares há uma parede de rocha de um tile (no lado de baixo) e só se
  // sobe ou desce por rampas explícitas, largas o bastante para monstros.
  // ---------------------------------------------------------------------
  const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  const N4 = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  const riverCenter = (y: number) => riverAt(y) + 1;
  const level = new Int8Array(w * h);
  const forced = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const t = get(x, y);
      if (t === Tile.Water || (t === Tile.Bridge && river && Math.abs(x + 0.5 - riverCenter(y)) <= 2)) {
        level[i] = WATER_LEVEL;
        forced[i] = 1;
        continue;
      }
      const cx = x + 0.5;
      const cy = y + 0.5;
      let hgt = 0.5 + 0.6 * Math.sin(cx * 0.11 + spec.seed * 0.001) * Math.cos(cy * 0.13 - 0.4) + 0.25 * Math.sin(cx * 0.31 - cy * 0.27);
      for (const k of spec.hills) hgt += k.h * Math.exp(-((cx - k.x) ** 2 + (cy - k.y) ** 2) / (2 * k.r * k.r));
      const py = pathY(cx);
      const dPath = Number.isNaN(py) ? Infinity : Math.abs(cy - py);
      hgt *= smooth((dPath - 1.8) / 3);
      if (river) hgt *= smooth((Math.abs(cx - riverCenter(cy)) - 3) / 4);
      hgt *= smooth((Math.hypot(cx - safe.x, cy - safe.y) - safe.r) / 3);
      if (arena) hgt *= smooth((Math.hypot(cx - arena.x, cy - arena.y) - arena.r) / 3);
      level[i] = Math.max(0, Math.floor(hgt / FLOOR_H + 0.16));
      // Trilha, lugar seguro, arena e margens do rio ficam sempre no térreo.
      if (
        dPath < 2.3 ||
        Math.hypot(cx - safe.x, cy - safe.y) < safe.r + 2 ||
        (arena && Math.hypot(cx - arena.x, cy - arena.y) < arena.r + 2) ||
        (river && Math.abs(cx - riverCenter(cy)) < 4.5)
      ) {
        level[i] = 0;
        forced[i] = 1;
      }
    }

  // Contornos limpos: tiles quase isolados adotam o andar dos vizinhos...
  for (let iter = 0; iter < 3; iter++)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (forced[i]) continue;
        const count = new Map<number, number>();
        for (const [dx, dy] of N4) {
          if (!inside(x + dx, y + dy)) continue;
          const l = level[(y + dy) * w + x + dx]!;
          if (l >= 0) count.set(l, (count.get(l) ?? 0) + 1);
        }
        if ((count.get(level[i]!) ?? 0) >= 2) continue;
        let best = level[i]!;
        let bestN = -1;
        for (const [l, n] of count) if (n > bestN || (n === bestN && l < best)) [best, bestN] = [l, n];
        level[i] = best;
      }
  // Platôs largos: nada de faixas estreitas (anéis de 1 tile viram labirinto).
  const maxLevel = Math.max(0, ...level);
  const open = (inR: (i: number) => boolean) => {
    let cur = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) cur[i] = +inR(i);
    const pass = (src: Uint8Array, erode: boolean) => {
      const out = new Uint8Array(w * h);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          let v = erode ? 1 : 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              const n = inside(nx, ny) ? src[ny * w + nx]! : +erode;
              if (erode) v &= n;
              else v |= n;
            }
          out[y * w + x] = v;
        }
      return out;
    };
    const base0 = cur;
    cur = pass(pass(cur, true), true);
    cur = pass(pass(cur, false), false);
    for (let i = 0; i < w * h; i++) cur[i] = cur[i]! & base0[i]!;
    return cur;
  };
  for (let round = 0; round < 2; round++) {
    for (let L = maxLevel; L >= 1; L--) {
      const kept = open((i) => level[i]! >= L);
      for (let i = 0; i < w * h; i++) if (level[i]! >= L && !kept[i] && !forced[i]) level[i] = L - 1;
    }
    // Degrau estreito entre um andar de cima e um de baixo: desce (a parede fica mais alta).
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const lv = level[y * w + x]!;
        if (lv < 1 || forced[y * w + x]) continue;
        let up = false;
        let down = false;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            if (!inside(x + dx, y + dy)) continue;
            const n = level[(y + dy) * w + x + dx]!;
            if (n < 0) continue;
            if (n > lv && Math.abs(dx) <= 1 && Math.abs(dy) <= 1) up = true;
            if (n < lv) down = true;
          }
        if (up && down) level[y * w + x] = lv - 1;
      }
    // Valas de 1 tile (mais baixas que os dois vizinhos opostos) sobem ao nível deles.
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (forced[i] || level[i]! < 0) continue;
        const ab = Math.min(level[i - 1]!, level[i + 1]!);
        const cd = Math.min(level[i - w]!, level[i + w]!);
        const fill = Math.max(ab, cd);
        if (fill > level[i]!) level[i] = fill;
      }
  }
  // ...e manchas pequenas demais para serem um andar somem no andar ao redor.
  for (let iter = 0; iter < 2; iter++) {
    const seen = new Uint8Array(w * h);
    for (let s = 0; s < w * h; s++) {
      if (seen[s] || level[s]! < 0) continue;
      const lv = level[s]!;
      const comp = [s];
      seen[s] = 1;
      const around = new Map<number, number>();
      for (let k = 0; k < comp.length; k++) {
        const j = comp[k]!;
        for (const [dx, dy] of N4) {
          const nx = (j % w) + dx;
          const ny = ((j / w) | 0) + dy;
          if (!inside(nx, ny)) continue;
          const n = ny * w + nx;
          if (level[n] === lv) {
            if (!seen[n]) {
              seen[n] = 1;
              comp.push(n);
            }
          } else if (level[n]! >= 0) around.set(level[n]!, (around.get(level[n]!) ?? 0) + 1);
        }
      }
      if (comp.length >= 14 || around.size === 0) continue;
      let to = lv;
      let bestN = -1;
      for (const [l, n] of around) if (n > bestN) [to, bestN] = [l, n];
      for (const j of comp) if (!forced[j]) level[j] = to;
    }
  }

  // Pontos de interesse ficam no meio de um pedaço plano do seu andar (nunca na parede).
  const pois = [...spawns.map((q) => ({ x: q.x + 0.5, y: q.y + 0.5 })), ...npcs, ...books, ...traps];
  /** Tiles perto de um ponto de interesse: rampas (e suas paredes laterais) não passam ali. */
  const nearPoi = new Uint8Array(w * h);
  /** Andar já reservado por um ponto de interesse anterior (-2 = livre). */
  const claimed = new Int8Array(w * h).fill(-2);
  for (const q of pois) {
    const disk: number[] = [];
    for (let y = Math.floor(q.y) - 2; y <= Math.floor(q.y) + 2; y++)
      for (let x = Math.floor(q.x) - 2; x <= Math.floor(q.x) + 2; x++)
        if (inside(x, y) && level[y * w + x]! >= 0 && Math.hypot(x + 0.5 - q.x, y + 0.5 - q.y) <= 2.3) disk.push(y * w + x);
    // Clareiras vizinhas ficam no mesmo andar (senão uma parede cairia entre elas).
    let lv = level[Math.floor(q.y) * w + Math.floor(q.x)]!;
    for (const i of disk) if (claimed[i]! > -2) lv = claimed[i]!;
    for (const i of disk) level[i] = claimed[i] = lv;
    for (let y = Math.floor(q.y) - 2; y <= Math.floor(q.y) + 2; y++)
      for (let x = Math.floor(q.x) - 2; x <= Math.floor(q.x) + 2; x++) {
        if (!inside(x, y) || level[y * w + x]! < 0) continue;
        if (Math.hypot(x + 0.5 - q.x, y + 0.5 - q.y) <= 1.2) nearPoi[y * w + x] = 1;
      }
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (Math.hypot(x + 0.5 - safe.x, y + 0.5 - safe.y) < safe.r + 0.5 || (arena && Math.hypot(x + 0.5 - arena.x, y + 0.5 - arena.y) < arena.r + 0.5))
        nearPoi[y * w + x] = 1;

  // Tiles "de base" (antes das paredes); as rampas são escritas aqui.
  const base = tiles.slice();
  const ramps: Ramp[] = [];
  const W1 = w + 1;
  const heights = new Float32Array(W1 * (h + 1));
  const levelH = (l: number) => (l < 0 ? GORGE_DEPTH : l * FLOOR_H);
  /** Recalcula paredes e alturas a partir dos andares e das rampas. */
  const finalize = () => {
    tiles.set(base);
    const eff = new Int8Array(level);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const lv = level[i]!;
        if (lv < 0) continue;
        let wall = false;
        let rim = false;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if ((!dx && !dy) || !inside(x + dx, y + dy)) continue;
            const n = level[(y + dy) * w + x + dx]!;
            if (n < 0) rim = true;
            else if (n > lv) wall = true;
          }
        if (rim) eff[i] = WATER_LEVEL; // a borda do desfiladeiro desce até o rio
        const t = base[i] as Tile;
        if ((wall || rim) && t !== Tile.Bridge && t !== Tile.Ramp) tiles[i] = Tile.Cliff;
      }
    // Cada canto fica na altura do andar mais alto que o toca: andares planos, parede no tile de baixo.
    for (let cy = 0; cy <= h; cy++)
      for (let cx = 0; cx <= w; cx++) {
        let hi = -Infinity;
        for (const [tx, ty] of [
          [cx - 1, cy - 1],
          [cx, cy - 1],
          [cx - 1, cy],
          [cx, cy],
        ] as const)
          if (inside(tx, ty)) hi = Math.max(hi, levelH(eff[ty * w + tx]!));
        heights[cy * W1 + cx] = hi;
      }
    // Rampas: altura linear do pé (andar de baixo) ao topo (andar de cima).
    for (const r of ramps) {
      const px = -r.dy;
      const py = r.dx;
      const lo = levelH(r.from);
      for (let k = 0; k < r.len; k++)
        for (let o = -1; o <= 1; o++) {
          const x = r.x + k * r.dx + o * px;
          const y = r.y + k * r.dy + o * py;
          for (const [cx, cy] of [
            [x, y],
            [x + 1, y],
            [x, y + 1],
            [x + 1, y + 1],
          ] as const) {
            const t = r.dx > 0 ? cx - r.x : r.dx < 0 ? r.x + 1 - cx : r.dy > 0 ? cy - r.y : r.y + 1 - cy;
            heights[cy * W1 + cx] = lo + (t / r.len) * r.rise * FLOOR_H;
          }
        }
    }
    // Qualquer tile caminhável que não ficou plano (ladeando uma rampa) vira parede.
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const t = tiles[y * w + x] as Tile;
        if (BLOCKING.has(t) || t === Tile.Ramp || t === Tile.Bridge) continue;
        const a = heights[y * W1 + x]!;
        if (heights[y * W1 + x + 1] !== a || heights[(y + 1) * W1 + x] !== a || heights[(y + 1) * W1 + x + 1] !== a) tiles[y * w + x] = Tile.Cliff;
      }
  };
  finalize();

  // Conectividade: cada área caminhável isolada ganha uma rampa até o que já se alcança.
  const walkable = (x: number, y: number) => inside(x, y) && !BLOCKING.has(get(x, y));
  const startIdx = Math.floor(safe.y) * w + Math.floor(safe.x);
  /** Distância a pé (em passos) do lugar seguro até cada tile; -1 = inalcançável. */
  const computeReach = () => {
    const reachD = new Int32Array(w * h).fill(-1);
    const q = [startIdx];
    reachD[startIdx] = 0;
    for (let k = 0; k < q.length; k++) {
      const i = q[k]!;
      for (const [dx, dy] of N4) {
        const nx = (i % w) + dx;
        const ny = ((i / w) | 0) + dy;
        if (!walkable(nx, ny) || reachD[ny * w + nx]! >= 0) continue;
        reachD[ny * w + nx] = reachD[i]! + 1;
        q.push(ny * w + nx);
      }
    }
    return reachD;
  };
  for (let iter = 0; iter < 40; iter++) {
    const reachD = computeReach();
    // Componentes ainda isolados.
    const comp = new Int32Array(w * h).fill(-1);
    const sizes: Array<[number, number]> = [];
    for (let i = 0; i < w * h; i++) {
      if (reachD[i]! >= 0 || comp[i] !== -1 || !walkable(i % w, (i / w) | 0)) continue;
      const st = [i];
      comp[i] = i;
      for (let k = 0; k < st.length; k++) {
        const j = st[k]!;
        for (const [dx, dy] of N4) {
          const nx = (j % w) + dx;
          const ny = ((j / w) | 0) + dy;
          if (!walkable(nx, ny) || reachD[ny * w + nx]! >= 0 || comp[ny * w + nx] !== -1) continue;
          comp[ny * w + nx] = i;
          st.push(ny * w + nx);
        }
      }
      if (st.length > 7) sizes.push([i, st.length]);
    }
    if (!sizes.length) break;
    // Zonas: mesmo andar, contando árvores e rochas como chão (elas podem ser derrubadas).
    const zone = new Int32Array(w * h).fill(-1);
    for (let i = 0; i < w * h; i++) {
      const t0 = tiles[i] as Tile;
      if (zone[i] !== -1 || t0 === Tile.Cliff || t0 === Tile.Water || level[i]! < 0) continue;
      const st = [i];
      zone[i] = i;
      for (let k = 0; k < st.length; k++) {
        const j = st[k]!;
        for (const [dx, dy] of N4) {
          const nx = (j % w) + dx;
          const ny = ((j / w) | 0) + dy;
          if (!inside(nx, ny)) continue;
          const n = ny * w + nx;
          const t = tiles[n] as Tile;
          if (zone[n] !== -1 || t === Tile.Cliff || t === Tile.Water || level[n] !== level[j]) continue;
          zone[n] = i;
          st.push(n);
        }
      }
    }
    sizes.sort((a, b) => b[1] - a[1]);
    let placed = false;
    for (const [target] of sizes) {
      const isTarget = (i: number) => comp[i] === target;
      const isReach = (i: number) => reachD[i]! >= 0;
      const inTargetZone = (i: number) => zone[i] === zone[target];
      // Isolado só por árvores ou rochas no mesmo andar? Abre uma passagem entre elas.
      {
        const cost = new Int32Array(w * h).fill(1e9);
        const prev = new Int32Array(w * h).fill(-1);
        const dq: number[] = [];
        for (let i = 0; i < w * h; i++)
          if (isReach(i)) {
            cost[i] = 0;
            dq.push(i);
          }
        let goal = -1;
        while (dq.length) {
          const i = dq.shift()!;
          if (isTarget(i)) {
            goal = i;
            break;
          }
          for (const [dx, dy] of N4) {
            const nx = (i % w) + dx;
            const ny = ((i / w) | 0) + dy;
            if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
            const j = ny * w + nx;
            const t = get(nx, ny);
            const step = walkable(nx, ny) ? 0 : (t === Tile.Tree || t === Tile.Rock) && level[j] === level[i] ? 1 : -1;
            if (step < 0 || cost[i]! + step >= cost[j]!) continue;
            cost[j] = cost[i]! + step;
            prev[j] = i;
            if (step === 0) dq.unshift(j);
            else dq.push(j);
          }
        }
        if (goal >= 0 && cost[goal]! <= 12) {
          for (let i = goal; i !== -1; i = prev[i]!) if (BLOCKING.has(base[i] as Tile)) base[i] = Tile.Grass;
          finalize();
          placed = true;
          break;
        }
      }
      const cands: Array<{ r: Ramp; score: number }> = [];
      // Procura a partir do topo: um tile caminhável com o andar de baixo logo atrás.
      for (let ty0 = 1; ty0 < h - 1; ty0++)
        for (let tx0 = 1; tx0 < w - 1; tx0++) {
          const ti = ty0 * w + tx0;
          if (level[ti]! < 1 || get(tx0, ty0) === Tile.Cliff) continue;
          for (const [dx, dy] of N4) {
            const rise = level[ti]! - level[(ty0 - dy) * w + tx0 - dx]!;
            if (rise !== 1 && rise !== 2) continue;
            // cut = quantos tiles da rampa ficam escavados no andar de cima (0 = rampa saliente).
            const shapes = (rise === 1 ? [3, 2] : [5, 4]).flatMap((l) => [
              [l, 0],
              [l, l - 1],
            ]);
            for (const [len, cut] of shapes as Array<[number, number]>) {
              const x = tx0 - (len - cut) * dx;
              const y = ty0 - (len - cut) * dy;
              if (!inside(x, y)) continue;
              const px = -dy;
              const py = dx;
              const at = (k: number, o: number) => [x + k * dx + o * px, y + k * dy + o * py] as const;
              const from = level[y * w + x]!;
              if (from < 0) continue;
              let ok = true;
              for (let k = -1; k <= len + 1 && ok; k++)
                for (let o = -2; o <= 2 && ok; o++) {
                  const [tx, ty] = at(k, o);
                  if (tx < 1 || ty < 1 || tx >= w - 1 || ty >= h - 1) {
                    ok = false;
                    break;
                  }
                  const i = ty * w + tx;
                  const t = get(tx, ty);
                  if (t === Tile.Ramp || base[i] === Tile.Bridge || nearPoi[i]) ok = false;
                  if (Math.abs(o) === 2) continue;
                  const lv = level[i]!;
                  if (k >= len) ok &&= lv === from + rise && t !== Tile.Cliff && t !== Tile.Water;
                  else if (k === -1) ok &&= lv === from && (o !== 0 || walkable(tx, ty));
                  else if (k < len - cut - 1) ok &&= lv === from && t !== Tile.Cliff && t !== Tile.Water;
                  else if (k === len - cut - 1) ok &&= lv === from && t !== Tile.Water;
                  else ok &&= lv === from + rise && t !== Tile.Cliff && t !== Tile.Water;
                }
              if (!ok) continue;
              const [fx, fy] = at(-1, 0);
              const foot = fy * w + fx;
              // O topo (3 x 2 tiles, árvores serão derrubadas) precisa encostar na outra área.
              let topReach = -1;
              let topTarget = false;
              for (let k = len; k <= len + 1; k++)
                for (let o = -1; o <= 1; o++) {
                  const [tx, ty] = at(k, o);
                  const i = ty * w + tx;
                  if (isReach(i) && (topReach < 0 || reachD[i]! < topReach)) topReach = reachD[i]!;
                  if (inTargetZone(i)) topTarget = true;
                }
              let score: number;
              if (isReach(foot) && topTarget) score = reachD[foot]!;
              else if (topReach >= 0 && inTargetZone(foot)) score = topReach;
              else continue;
              score += (len === 3 || len === 5 ? 0 : 6) + (rise - 1) * 4 + (cut ? 3 : 0);
              cands.push({ r: { x, y, dx, dy, len, from, rise }, score });
            }
          }
        }
      cands.sort((a, b) => a.score - b.score);
      for (const { r } of cands.slice(0, 30)) {
        const saved = base.slice();
        ramps.push(r);
        for (let k = 0; k <= r.len + 1; k++)
          for (let o = -1; o <= 1; o++) {
            const x = r.x + k * r.dx - o * r.dy;
            const y = r.y + k * r.dy + o * r.dx;
            const i = y * w + x;
            if (k < r.len) base[i] = Tile.Ramp;
            else if (BLOCKING.has(base[i] as Tile)) base[i] = Tile.Grass;
          }
        finalize();
        // A rampa (com suas paredes laterais) não pode cortar nenhum caminho que já existia.
        const after = computeReach();
        // (no máximo um cantinho sem saída de poucos tiles, e nunca um ponto de interesse)
        let ok = after[startIdx]! >= 0;
        let lost = 0;
        for (let i = 0; i < w * h && ok; i++)
          if (reachD[i]! >= 0 && after[i]! < 0 && !BLOCKING.has(tiles[i] as Tile)) {
            lost++;
            if (lost > 8 || claimed[i]! > -2) ok = false;
          }
        let gained = 0;
        for (let i = 0; i < w * h; i++) if (after[i]! >= 0 && reachD[i]! < 0) gained++;
        ok &&= gained > 0;
        if (ok) {
          placed = true;
          break;
        }
        ramps.pop();
        base.set(saved);
        finalize();
      }
      if (placed) break;
    }
    if (!placed) break;
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
    floors: level,
    ramps,
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
