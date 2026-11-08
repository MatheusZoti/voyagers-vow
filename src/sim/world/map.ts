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

/** Id de uma região (nome do arquivo em src/maps, sem extensão). */
export type RegionId = string;
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
  /** a primeira ponte (evento da história do Vale) */
  bridge: { x0: number; x1: number; y0: number; y1: number } | null;
  bridges: Array<{ x0: number; x1: number; y0: number; y1: number }>;
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
