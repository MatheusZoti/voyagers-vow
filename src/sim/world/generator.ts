import { Rng, type Vec2 } from '../math';
import type { NpcId } from '../psyche/dialogues';
import type { SpellId } from '../techniques';
import { BLOCKING, FLOOR_H, Tile, WATER_LEVEL, type Circle, type Exit, type SpawnDef, type Theme } from './map';
import { connectFloors, MAP_FORMAT, Terrain, writeTerrain, type MapData } from './terrain';

// ---------------------------------------------------------------------------
// Especificação de uma região
// ---------------------------------------------------------------------------

interface RegionSpec {
  id: GeneratedId;
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

const SPECS = { vale: valeSpec, varn: varnSpec };
/** Regiões que o gerador procedural sabe montar (ponto de partida; o jogo usa os arquivos em src/maps). */
export type GeneratedId = keyof typeof SPECS;
export const GENERATED_IDS = Object.keys(SPECS) as GeneratedId[];

/**
 * Gera uma região a partir da especificação: trilha, colinas viram andares, rio num
 * desfiladeiro, bosques, clareiras nos pontos de interesse e rampas ligando os andares.
 */
export function generateRegionData(id: GeneratedId): MapData {
  const spec = SPECS[id]();
  const rng = new Rng(spec.seed);
  const { w, h } = spec;
  const tiles = new Uint8Array(w * h);
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
      rng.next(); // (mantém a sequência aleatória dos bosques)
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

  const t = new Terrain(w, h, level, tiles.slice());
  const poi = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) poi[i] = claimed[i]! > -2 ? 1 : 0;
  connectFloors(t, safe, nearPoi, poi);

  const d: MapData = {
    format: MAP_FORMAT,
    id: spec.id,
    name: spec.name,
    tier: spec.tier,
    theme: spec.theme,
    w,
    h,
    ground: [],
    floors: [],
    ramps: [],
    safe: { x: safe.x, y: safe.y, r: safe.r, name: spec.safeName },
    arena: arena ? { x: arena.x, y: arena.y, r: arena.r } : null,
    playerStart: { x: safe.x + 0.5, y: safe.y + 0.5 },
    bossSpawn: arena ? { x: arena.x + 2, y: arena.y } : null,
    spawns,
    npcs,
    books,
    traps,
    exits,
    places: spec.places,
  };
  writeTerrain(d, t);
  return d;
}
