import { Rng, type Vec2 } from '../math';
import type { NpcId } from '../psyche/dialogues';
import type { SpellId } from '../techniques';
import {
  BLOCKING,
  FLOOR_H,
  GORGE_DEPTH,
  Tile,
  WATER_LEVEL,
  type Circle,
  type Exit,
  type GameMap,
  type Ramp,
  type SpawnDef,
  type Theme,
} from './map';

/**
 * Formato de mapa editável (o que o editor salva em `src/maps/<id>.json`) e o compilador
 * que transforma esses dados no `GameMap` usado pela simulação e pelo cliente.
 *
 * O mapa guarda só o que um autor decide: o chão de cada tile, o andar de cada tile, as
 * rampas e os objetos. Paredes de rocha, alturas, bordas do desfiladeiro e as paredes
 * laterais das rampas são derivadas aqui, sempre do mesmo jeito.
 */
export const MAP_FORMAT = 1;

/** Rampa como o autor desenha: pé em (x, y), sobe na direção (dx, dy) por `len` tiles; 3 de largura. */
export interface RampDef {
  x: number;
  y: number;
  dx: number;
  dy: number;
  len: number;
}

export interface MapData {
  format: number;
  id: string;
  name: string;
  /** 1–8: inimigos mais fortes e mais recompensa */
  tier: number;
  theme: Theme;
  w: number;
  h: number;
  /** uma linha de texto por fileira de tiles; cada caractere é o chão (veja GROUND_CHARS) */
  ground: string[];
  /** uma linha por fileira; '0'–'9' = andar, '_' = abismo (rio no fundo do desfiladeiro) */
  floors: string[];
  ramps: RampDef[];
  /** lugar seguro: sem dano, meditação, renascer */
  safe: Circle & { name: string };
  /** arena do chefe (o chefe não sai dela) */
  arena: Circle | null;
  playerStart: Vec2;
  bossSpawn: Vec2 | null;
  spawns: SpawnDef[];
  npcs: Array<{ id: NpcId; x: number; y: number }>;
  books: Array<{ id: string; spell: SpellId; x: number; y: number }>;
  traps: Vec2[];
  exits: Exit[];
  places: Array<{ name: string; x: number; y: number }>;
}

/** Caractere de chão -> tile. */
export const GROUND_CHARS: Record<string, Tile> = {
  '.': Tile.Grass,
  ':': Tile.Path,
  T: Tile.Tree,
  R: Tile.Rock,
  '~': Tile.Water,
  '=': Tile.Bridge,
};

export function groundChar(t: Tile): string {
  switch (t) {
    case Tile.Path:
    case Tile.Ramp:
      return ':';
    case Tile.Tree:
      return 'T';
    case Tile.Rock:
      return 'R';
    case Tile.Water:
      return '~';
    case Tile.Bridge:
      return '=';
    default:
      return '.';
  }
}

export const floorChar = (l: number) => (l < 0 ? '_' : String(Math.min(9, l)));
export const parseFloor = (c: string | undefined) => (c === '_' ? WATER_LEVEL : c && c >= '0' && c <= '9' ? c.charCodeAt(0) - 48 : 0);

const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * Relevo em andares: a partir do andar de cada tile, do chão "de base" e das rampas,
 * calcula paredes (Cliff) e a altura de cada canto de tile.
 */
export class Terrain {
  readonly tiles: Uint8Array;
  readonly heights: Float32Array;

  constructor(
    readonly w: number,
    readonly h: number,
    /** andar de cada tile (WATER_LEVEL = fundo do desfiladeiro) */
    readonly level: Int8Array,
    /** chão antes das paredes (rampas já escritas como Tile.Ramp) */
    readonly base: Uint8Array,
    readonly ramps: Ramp[] = [],
  ) {
    this.tiles = new Uint8Array(w * h);
    this.heights = new Float32Array((w + 1) * (h + 1));
    this.finalize();
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  walkable(x: number, y: number): boolean {
    return this.inside(x, y) && !BLOCKING.has(this.tiles[y * this.w + x] as Tile);
  }

  /** Recalcula paredes e alturas a partir dos andares e das rampas. */
  finalize(): void {
    const { w, h, level, base, tiles, heights, ramps } = this;
    const inside = (x: number, y: number) => this.inside(x, y);
    const W1 = w + 1;
    const levelH = (l: number) => (l < 0 ? GORGE_DEPTH : l * FLOOR_H);
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
          if (!inside(x, y)) continue;
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
  }

  /** Grava uma rampa no chão de base (3 de largura) e derruba árvores logo acima dela. */
  stampRamp(r: Ramp): void {
    const { w, base } = this;
    this.ramps.push(r);
    for (let k = 0; k <= r.len + 1; k++)
      for (let o = -1; o <= 1; o++) {
        const x = r.x + k * r.dx - o * r.dy;
        const y = r.y + k * r.dy + o * r.dx;
        if (!this.inside(x, y)) continue;
        const i = y * w + x;
        if (k < r.len) base[i] = Tile.Ramp;
        else if (BLOCKING.has(base[i] as Tile) && base[i] !== Tile.Water) base[i] = Tile.Grass;
      }
  }
}

/**
 * Liga com rampas (e clareiras entre árvores) toda área caminhável grande que esteja
 * isolada do ponto `start`. `nearPoi` marca tiles onde rampas não podem passar; `poi`
 * marca tiles que nunca podem perder o acesso.
 */
export function connectFloors(t: Terrain, start: Vec2, nearPoi: Uint8Array, poi: Uint8Array): void {
  const { w, h, level, base, tiles, ramps } = t;
  const inside = (x: number, y: number) => t.inside(x, y);
  const get = (x: number, y: number) => tiles[y * w + x] as Tile;
  const walkable = (x: number, y: number) => t.walkable(x, y);
  const finalize = () => t.finalize();
  const startIdx = Math.floor(start.y) * w + Math.floor(start.x);
  // Conectividade: cada área caminhável isolada ganha uma rampa até o que já se alcança.
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
            if (lost > 8 || poi[i]) ok = false;
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
}

// ---------------------------------------------------------------------------
// MapData <-> Terrain
// ---------------------------------------------------------------------------

/** Pontos de interesse do mapa (onde algo precisa estar em chão caminhável e alcançável). */
export function mapPois(d: MapData): Array<{ x: number; y: number; what: string }> {
  return [
    { ...d.playerStart, what: 'Início do jogador' },
    ...(d.bossSpawn ? [{ ...d.bossSpawn, what: 'Chefe' }] : []),
    ...d.spawns.map((s) => ({ x: s.x + 0.5, y: s.y + 0.5, what: `Monstro (${s.kind})` })),
    ...d.npcs.map((n) => ({ x: n.x, y: n.y, what: `NPC ${n.id}` })),
    ...d.books.map((b) => ({ x: b.x, y: b.y, what: `Livro ${b.id}` })),
    ...d.traps.map((t) => ({ x: t.x, y: t.y, what: 'Armadilha' })),
  ];
}

/** A rampa desenhada, com os andares de baixo e de cima lidos do mapa (null se não liga dois andares). */
export function resolveRamp(r: RampDef, level: Int8Array, w: number, h: number): Ramp | null {
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? level[y * w + x]! : -9);
  const from = at(r.x, r.y);
  const top = at(r.x + r.len * r.dx, r.y + r.len * r.dy);
  if (from < 0 || top < 0 || top <= from) return null;
  return { ...r, from, rise: top - from };
}

export function terrainFromData(d: MapData): Terrain {
  const { w, h } = d;
  const level = new Int8Array(w * h);
  const base = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const gr = d.ground[y] ?? '';
    const fr = d.floors[y] ?? '';
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      base[i] = GROUND_CHARS[gr[x] ?? '.'] ?? Tile.Grass;
      level[i] = parseFloor(fr[x]);
      // Água fica sempre no fundo; abismo sem água nem ponte vira rio.
      if (base[i] === Tile.Water) level[i] = WATER_LEVEL;
      else if (level[i]! < 0 && base[i] !== Tile.Bridge) base[i] = Tile.Water;
    }
  }
  // Lugar seguro e arena pintam o chão (pedra clara), menos onde há água ou ponte.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (base[i] === Tile.Water || base[i] === Tile.Bridge) continue;
      if (Math.hypot(x + 0.5 - d.safe.x, y + 0.5 - d.safe.y) <= d.safe.r) base[i] = Tile.Sanctuary;
      else if (d.arena && Math.hypot(x + 0.5 - d.arena.x, y + 0.5 - d.arena.y) <= d.arena.r) base[i] = Tile.Arena;
    }
  const t = new Terrain(w, h, level, base);
  for (const r of d.ramps) {
    const rr = resolveRamp(r, level, w, h);
    if (rr) t.stampRamp(rr);
  }
  t.finalize();
  return t;
}

/** Escreve chão, andares e rampas de um Terrain de volta no formato editável. */
export function writeTerrain(d: MapData, t: Terrain): void {
  d.ground = [];
  d.floors = [];
  for (let y = 0; y < t.h; y++) {
    let g = '';
    let f = '';
    for (let x = 0; x < t.w; x++) {
      g += groundChar(t.base[y * t.w + x] as Tile);
      f += floorChar(t.level[y * t.w + x]!);
    }
    d.ground.push(g);
    d.floors.push(f);
  }
  d.ramps = t.ramps.map(({ x, y, dx, dy, len }) => ({ x, y, dx, dy, len }));
}

/** Máscaras de proteção: onde rampas não passam e quais tiles nunca podem perder acesso. */
export function protection(d: MapData): { nearPoi: Uint8Array; poi: Uint8Array } {
  const { w, h } = d;
  const nearPoi = new Uint8Array(w * h);
  const poi = new Uint8Array(w * h);
  for (const q of mapPois(d)) {
    for (let y = Math.floor(q.y) - 2; y <= Math.floor(q.y) + 2; y++)
      for (let x = Math.floor(q.x) - 2; x <= Math.floor(q.x) + 2; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const dd = Math.hypot(x + 0.5 - q.x, y + 0.5 - q.y);
        if (dd <= 1.2) nearPoi[y * w + x] = 1;
        if (dd <= 0.75) poi[y * w + x] = 1;
      }
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (
        Math.hypot(x + 0.5 - d.safe.x, y + 0.5 - d.safe.y) < d.safe.r + 0.5 ||
        (d.arena && Math.hypot(x + 0.5 - d.arena.x, y + 0.5 - d.arena.y) < d.arena.r + 0.5)
      )
        nearPoi[y * w + x] = 1;
  return { nearPoi, poi };
}

/** Liga automaticamente os andares do mapa com rampas (e clareiras). Devolve quantas rampas novas. */
export function autoConnect(d: MapData): number {
  const t = terrainFromData(d);
  const before = t.ramps.length;
  const { nearPoi, poi } = protection(d);
  connectFloors(t, d.safe, nearPoi, poi);
  // O chão de base volta sem santuário/arena (o compilador repinta a partir dos círculos).
  writeTerrain(d, t);
  return t.ramps.length - before;
}

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Pontes: cada grupo de tiles de ponte vira um retângulo (o cliente desenha a ponte suspensa). */
function findBridges(tiles: Uint8Array, w: number, h: number): Array<{ x0: number; x1: number; y0: number; y1: number }> {
  const seen = new Uint8Array(w * h);
  const out: Array<{ x0: number; x1: number; y0: number; y1: number }> = [];
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || tiles[s] !== Tile.Bridge) continue;
    const st = [s];
    seen[s] = 1;
    const b = { x0: s % w, x1: s % w, y0: (s / w) | 0, y1: (s / w) | 0 };
    for (let k = 0; k < st.length; k++) {
      const i = st[k]!;
      const x = i % w;
      const y = (i / w) | 0;
      b.x0 = Math.min(b.x0, x);
      b.x1 = Math.max(b.x1, x);
      b.y0 = Math.min(b.y0, y);
      b.y1 = Math.max(b.y1, y);
      for (const [dx, dy] of N4) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (seen[j] || tiles[j] !== Tile.Bridge) continue;
        seen[j] = 1;
        st.push(j);
      }
    }
    out.push(b);
  }
  return out;
}

/** Transforma o mapa editável no mapa do jogo. */
export function compileMap(d: MapData): GameMap {
  const t = terrainFromData(d);
  const { w, h } = d;
  const rng = new Rng(hashId(d.id));
  const variation = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) variation[i] = rng.next();
  const bridges = findBridges(t.tiles, w, h);
  return {
    id: d.id,
    name: d.name,
    tier: d.tier,
    theme: d.theme,
    w,
    h,
    tiles: t.tiles,
    heights: t.heights,
    floors: t.level,
    ramps: t.ramps,
    variation,
    sanctuary: { x: d.safe.x, y: d.safe.y, r: d.safe.r },
    safeName: d.safe.name,
    arena: d.arena ? { ...d.arena } : null,
    bridge: bridges[0] ?? null,
    bridges,
    playerStart: { ...d.playerStart },
    bossSpawn: d.bossSpawn ? { ...d.bossSpawn } : null,
    spawns: d.spawns.map((s) => ({ ...s })),
    traps: d.traps.map((p) => ({ ...p })),
    npcs: d.npcs.map((n) => ({ ...n })),
    books: d.books.map((b) => ({ ...b })),
    exits: d.exits.map((e) => ({ ...e, arrive: { ...e.arrive } })),
    places: d.places.map((p) => ({ ...p })),
  };
}

/** Mapa novo, plano, com borda de floresta e um santuário. */
export function blankMap(id: string, name: string, w: number, h: number): MapData {
  const ground: string[] = [];
  const floors: string[] = [];
  for (let y = 0; y < h; y++) {
    let g = '';
    for (let x = 0; x < w; x++) g += Math.min(x, y, w - 1 - x, h - 1 - y) < 2 ? 'T' : '.';
    ground.push(g);
    floors.push('0'.repeat(w));
  }
  const safe = { x: 9, y: Math.floor(h / 2), r: 4, name: 'Santuário' };
  return {
    format: MAP_FORMAT,
    id,
    name,
    tier: 1,
    theme: 'vale',
    w,
    h,
    ground,
    floors,
    ramps: [],
    safe,
    arena: null,
    playerStart: { x: safe.x + 0.5, y: safe.y + 0.5 },
    bossSpawn: null,
    spawns: [],
    npcs: [],
    books: [],
    traps: [],
    exits: [],
    places: [{ name, x: w / 2, y: 4 }],
  };
}

// ---------------------------------------------------------------------------
// Validação (o painel do editor e os testes usam a mesma coisa)
// ---------------------------------------------------------------------------

export interface MapIssue {
  level: 'erro' | 'aviso';
  msg: string;
  x?: number;
  y?: number;
}

export function validateMap(d: MapData, knownRegions: string[] = []): MapIssue[] {
  const out: MapIssue[] = [];
  if (!/^[a-z0-9-]+$/.test(d.id)) out.push({ level: 'erro', msg: 'O id do mapa só pode ter letras minúsculas, números e hífen.' });
  if (d.ground.length !== d.h || d.floors.length !== d.h) out.push({ level: 'erro', msg: 'Tamanho do mapa não bate com as linhas salvas.' });
  const m = compileMap(d);
  const { w, h } = m;
  const tl = new Int8Array(w * h);
  for (let i = 0; i < w * h; i++) tl[i] = parseFloor(d.floors[(i / w) | 0]?.[i % w]);
  for (const r of d.ramps) {
    const rr = resolveRamp(r, tl, w, h);
    if (!rr) out.push({ level: 'erro', msg: 'Rampa não liga um andar a outro mais alto (o topo precisa ficar num andar acima do pé).', x: r.x, y: r.y });
    else if ((rr.rise * FLOOR_H) / rr.len > 0.9)
      out.push({ level: 'erro', msg: `Rampa íngreme demais: sobe ${rr.rise} andar(es) em ${rr.len} tiles (use ${Math.ceil((rr.rise * FLOOR_H) / 0.9)}+).`, x: r.x, y: r.y });
  }
  // Alcance a pé a partir do início do jogador.
  const reach = new Uint8Array(w * h);
  const sx = Math.floor(m.playerStart.x);
  const sy = Math.floor(m.playerStart.y);
  const walk = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && !BLOCKING.has(m.tiles[y * w + x] as Tile);
  if (walk(sx, sy)) {
    const q = [sy * w + sx];
    reach[q[0]!] = 1;
    for (let k = 0; k < q.length; k++) {
      const i = q[k]!;
      for (const [dx, dy] of N4) {
        const nx = (i % w) + dx;
        const ny = ((i / w) | 0) + dy;
        if (!walk(nx, ny) || reach[ny * w + nx]) continue;
        reach[ny * w + nx] = 1;
        q.push(ny * w + nx);
      }
    }
  }
  if (Math.hypot(m.playerStart.x - d.safe.x, m.playerStart.y - d.safe.y) > d.safe.r)
    out.push({ level: 'aviso', msg: 'O início do jogador fica fora do lugar seguro.', ...m.playerStart });
  for (const p of mapPois(d)) {
    const x = Math.floor(p.x);
    const y = Math.floor(p.y);
    if (!walk(x, y)) out.push({ level: 'erro', msg: `${p.what} está em cima de algo que bloqueia (árvore, rocha, água ou parede).`, x: p.x, y: p.y });
    else if (!reach[y * w + x]) out.push({ level: 'erro', msg: `${p.what} não é alcançável a pé a partir do início.`, x: p.x, y: p.y });
  }
  for (const e of d.exits) {
    const cx = Math.floor((e.x0 + e.x1) / 2);
    const cy = Math.floor((e.y0 + e.y1) / 2);
    if (!walk(cx, cy) || !reach[cy * w + cx]) out.push({ level: 'erro', msg: `Saída para "${e.to}" não é alcançável.`, x: cx + 0.5, y: cy + 0.5 });
    if (knownRegions.length && !knownRegions.includes(e.to)) out.push({ level: 'aviso', msg: `Saída leva a "${e.to}", que ainda não existe.`, x: cx + 0.5, y: cy + 0.5 });
  }
  // Áreas caminháveis grandes sem acesso.
  const seen = new Uint8Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || reach[s] || !walk(s % w, (s / w) | 0)) continue;
    const st = [s];
    seen[s] = 1;
    for (let k = 0; k < st.length; k++) {
      const i = st[k]!;
      for (const [dx, dy] of N4) {
        const nx = (i % w) + dx;
        const ny = ((i / w) | 0) + dy;
        if (!walk(nx, ny) || seen[ny * w + nx] || reach[ny * w + nx]) continue;
        seen[ny * w + nx] = 1;
        st.push(ny * w + nx);
      }
    }
    if (st.length > 20) out.push({ level: 'aviso', msg: `Área de ${st.length} tiles sem acesso (falta rampa ou passagem).`, x: (s % w) + 0.5, y: ((s / w) | 0) + 0.5 });
  }
  const ids = new Set<string>();
  for (const b of d.books) {
    if (ids.has(b.id)) out.push({ level: 'erro', msg: `Dois livros com o mesmo id "${b.id}".`, x: b.x, y: b.y });
    ids.add(b.id);
  }
  return out;
}

const KEY_ORDER: Array<keyof MapData> = [
  'format',
  'id',
  'name',
  'tier',
  'theme',
  'w',
  'h',
  'safe',
  'arena',
  'playerStart',
  'bossSpawn',
  'exits',
  'places',
  'npcs',
  'books',
  'spawns',
  'traps',
  'ramps',
  'ground',
  'floors',
];

/** JSON legível e com diffs limpos: uma linha por fileira do mapa e por objeto. */
export function formatMapJson(d: MapData): string {
  const lines = ['{'];
  KEY_ORDER.forEach((k, i) => {
    const v = d[k];
    const comma = i < KEY_ORDER.length - 1 ? ',' : '';
    if (Array.isArray(v) && v.length) lines.push(`  ${JSON.stringify(k)}: [\n${v.map((x) => '    ' + JSON.stringify(x)).join(',\n')}\n  ]${comma}`);
    else lines.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v ?? null)}${comma}`);
  });
  lines.push('}');
  return lines.join('\n') + '\n';
}
