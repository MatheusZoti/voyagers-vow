import { NPCS } from '../sim/psyche/dialogues';
import { Tile, type GameMap } from '../sim/world/map';
import { resolveRamp, type MapData, type MapIssue, type RampDef } from '../sim/world/terrain';

/** Vista do editor: `z` = pixels por tile; (ox, oy) = posição em pixels do canto (0, 0) do mapa. */
export interface View {
  z: number;
  ox: number;
  oy: number;
}

export type SelKind = 'spawn' | 'npc' | 'book' | 'trap' | 'place' | 'exit' | 'start' | 'boss' | 'safe' | 'arena' | 'ramp';
export type Sel = { kind: SelKind; index: number } | null;

export type Preview =
  | { type: 'ramp'; ramp: RampDef; ok: boolean }
  | { type: 'rect'; x0: number; y0: number; x1: number; y1: number }
  | { type: 'circle'; x: number; y: number; r: number };

export interface DrawState {
  data: MapData;
  map: GameMap;
  view: View;
  mode: 'natural' | 'floors';
  hover: { x: number; y: number } | null;
  /** tiles que o pincel atinge sob o cursor */
  footprint: Array<[number, number]>;
  sel: Sel;
  issues: MapIssue[];
  preview: Preview | null;
  flash: { x: number; y: number; t: number } | null;
}

export const TILE_COLORS: Record<string, string> = {
  grass: '#93a548',
  grassAutumn: '#ab9f4f',
  path: '#c2a26f',
  tree: '#3d6e63',
  treeAutumn: '#c9642f',
  rock: '#a89d88',
  water: '#5878c9',
  bridge: '#9b6d43',
  sanctuary: '#d8ceb0',
  arena: '#a39c8a',
  cliff: '#7a6248',
  ramp: '#c9ab78',
};
/** Uma cor por andar no modo "Andares". */
export const FLOOR_COLORS = ['#3f6e57', '#6f9248', '#a8a24a', '#c98c3e', '#c4653a', '#b0475a', '#8d4a8a', '#5a5aa8', '#3f7fa8', '#3fa89a'];
export const SPAWN_COLORS: Record<string, string> = { grunt: '#e0533f', stalker: '#b45ad6', brute: '#c98a3a', slinger: '#e08a3f' };
const SPAWN_LETTER: Record<string, string> = { grunt: 'C', stalker: 'E', brute: 'B', slinger: 'L' };

const shade = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

export function draw(ctx: CanvasRenderingContext2D, s: DrawState, cw: number, ch: number): void {
  const { data, map, view } = s;
  const { z, ox, oy } = view;
  const { w, h } = map;
  ctx.clearRect(0, 0, cw, ch);
  const X = (x: number) => ox + x * z;
  const Y = (y: number) => oy + y * z;
  const x0 = Math.max(0, Math.floor(-ox / z));
  const y0 = Math.max(0, Math.floor(-oy / z));
  const x1 = Math.min(w, Math.ceil((cw - ox) / z));
  const y1 = Math.min(h, Math.ceil((ch - oy) / z));
  const autumn = data.theme === 'autumn';

  // Sombra do mapa.
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(X(0) + 6, Y(0) + 8, w * z, h * z);

  // Tiles.
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = y * w + x;
      const t = map.tiles[i] as Tile;
      const fl = map.floors[i]!;
      const v = map.variation[i]! - 0.5;
      let c: string;
      if (s.mode === 'floors') {
        c = t === Tile.Water ? '#2c4f96' : fl < 0 ? '#2c4f96' : FLOOR_COLORS[Math.min(9, fl)]!;
        if (t === Tile.Cliff) c = shade(c, -0.45);
        else if (t === Tile.Ramp) c = shade(c, 0.25);
        else if (t === Tile.Tree || t === Tile.Rock) c = shade(c, -0.2);
      } else {
        switch (t) {
          case Tile.Path:
            c = TILE_COLORS.path!;
            break;
          case Tile.Water:
            c = TILE_COLORS.water!;
            break;
          case Tile.Bridge:
            c = TILE_COLORS.bridge!;
            break;
          case Tile.Sanctuary:
            c = TILE_COLORS.sanctuary!;
            break;
          case Tile.Arena:
            c = TILE_COLORS.arena!;
            break;
          case Tile.Cliff:
            c = TILE_COLORS.cliff!;
            break;
          case Tile.Ramp:
            c = TILE_COLORS.ramp!;
            break;
          case Tile.Rock:
            c = autumn ? TILE_COLORS.grassAutumn! : TILE_COLORS.grass!;
            break;
          default:
            c = autumn ? TILE_COLORS.grassAutumn! : TILE_COLORS.grass!;
        }
        // Andares mais altos ficam mais claros (como no mapa do jogo).
        if (t !== Tile.Water && fl > 0) c = shade(c.startsWith('#') ? c : '#888888', fl * 0.09);
        else c = shade(c, v * 0.06);
      }
      ctx.fillStyle = c;
      ctx.fillRect(X(x), Y(y), z + 0.5, z + 0.5);
      if (s.mode === 'natural') {
        if (t === Tile.Tree) {
          ctx.fillStyle = autumn && v > 0.15 ? TILE_COLORS.treeAutumn! : shade(TILE_COLORS.tree!, fl * 0.07 + v * 0.15);
          ctx.beginPath();
          ctx.arc(X(x + 0.5 + v * 0.2), Y(y + 0.5 - v * 0.2), z * 0.46, 0, Math.PI * 2);
          ctx.fill();
        } else if (t === Tile.Rock) {
          ctx.fillStyle = shade(TILE_COLORS.rock!, fl * 0.07);
          ctx.beginPath();
          ctx.moveTo(X(x + 0.18), Y(y + 0.7));
          ctx.lineTo(X(x + 0.35), Y(y + 0.22));
          ctx.lineTo(X(x + 0.72), Y(y + 0.2));
          ctx.lineTo(X(x + 0.85), Y(y + 0.68));
          ctx.closePath();
          ctx.fill();
        } else if (t === Tile.Cliff && z >= 10) {
          ctx.strokeStyle = 'rgba(40,28,16,0.35)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(X(x + 0.15), Y(y + 0.85));
          ctx.lineTo(X(x + 0.85), Y(y + 0.15));
          ctx.stroke();
        } else if (t === Tile.Bridge && z >= 8) {
          ctx.strokeStyle = 'rgba(50,30,15,0.45)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(X(x + 0.5), Y(y));
          ctx.lineTo(X(x + 0.5), Y(y + 1));
          ctx.stroke();
        }
      }
    }

  // Divisas entre andares (linha escura no limite de cada andar).
  ctx.strokeStyle = 'rgba(25,18,10,0.85)';
  ctx.lineWidth = Math.max(1.5, z * 0.12);
  ctx.beginPath();
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const a = map.floors[y * w + x]!;
      if (x + 1 < w && map.floors[y * w + x + 1] !== a) {
        ctx.moveTo(X(x + 1), Y(y));
        ctx.lineTo(X(x + 1), Y(y + 1));
      }
      if (y + 1 < h && map.floors[(y + 1) * w + x] !== a) {
        ctx.moveTo(X(x), Y(y + 1));
        ctx.lineTo(X(x + 1), Y(y + 1));
      }
    }
  ctx.stroke();

  // Grade fina quando há zoom.
  if (z >= 14) {
    ctx.strokeStyle = 'rgba(0,0,0,0.13)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = x0; x <= x1; x++) {
      ctx.moveTo(Math.round(X(x)) + 0.5, Y(y0));
      ctx.lineTo(Math.round(X(x)) + 0.5, Y(y1));
    }
    for (let y = y0; y <= y1; y++) {
      ctx.moveTo(X(x0), Math.round(Y(y)) + 0.5);
      ctx.lineTo(X(x1), Math.round(Y(y)) + 0.5);
    }
    ctx.stroke();
  }

  // Número do andar em cada tile (modo Andares, com zoom).
  if (s.mode === 'floors' && z >= 16) {
    ctx.font = `600 ${Math.round(z * 0.42)}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const fl = map.floors[y * w + x]!;
        if (fl >= 0 && map.tiles[y * w + x] !== Tile.Cliff) ctx.fillText(String(fl), X(x + 0.5), Y(y + 0.52));
      }
  }

  // Rampas: seta apontando para cima (do pé ao topo).
  const levelArr = map.floors;
  data.ramps.forEach((r, i) => drawRamp(ctx, s, r, !!resolveRamp(r, levelArr, w, h), s.sel?.kind === 'ramp' && s.sel.index === i));

  // Lugar seguro e arena.
  const circle = (cx: number, cy: number, r: number, color: string, label: string, selected: boolean) => {
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = selected ? 3 : 2;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(X(cx), Y(cy), r * z, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    tag(ctx, label, X(cx), Y(cy - r) - 8, color);
  };
  circle(data.safe.x, data.safe.y, data.safe.r, '#bfe9ff', data.safe.name || 'Lugar seguro', s.sel?.kind === 'safe');
  if (data.arena) circle(data.arena.x, data.arena.y, data.arena.r, '#ff9a7a', 'Arena', s.sel?.kind === 'arena');

  // Saídas.
  data.exits.forEach((e, i) => {
    const sel = s.sel?.kind === 'exit' && s.sel.index === i;
    ctx.fillStyle = 'rgba(111,208,255,0.22)';
    ctx.strokeStyle = sel ? '#ffffff' : '#6fd0ff';
    ctx.lineWidth = sel ? 3 : 2;
    ctx.fillRect(X(e.x0), Y(e.y0), (e.x1 - e.x0 + 1) * z, (e.y1 - e.y0 + 1) * z);
    ctx.strokeRect(X(e.x0), Y(e.y0), (e.x1 - e.x0 + 1) * z, (e.y1 - e.y0 + 1) * z);
    tag(ctx, `→ ${e.to || '?'}${e.needsBoss ? ' 🔒' : ''}`, X((e.x0 + e.x1 + 1) / 2), Y(e.y0) - 8, '#6fd0ff');
  });

  // Objetos.
  const R = Math.max(5, z * 0.38);
  const dot = (x: number, y: number, color: string, letter: string, selected: boolean, shape: 'circle' | 'square' | 'diamond' = 'circle') => {
    const sx = X(x);
    const sy = Y(y);
    ctx.fillStyle = color;
    ctx.strokeStyle = selected ? '#ffffff' : 'rgba(0,0,0,0.6)';
    ctx.lineWidth = selected ? 3 : 1.5;
    ctx.beginPath();
    if (shape === 'circle') ctx.arc(sx, sy, R, 0, Math.PI * 2);
    else if (shape === 'square') ctx.rect(sx - R * 0.85, sy - R * 0.85, R * 1.7, R * 1.7);
    else {
      ctx.moveTo(sx, sy - R * 1.15);
      ctx.lineTo(sx + R * 1.15, sy);
      ctx.lineTo(sx, sy + R * 1.15);
      ctx.lineTo(sx - R * 1.15, sy);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
    if (R >= 7) {
      ctx.fillStyle = '#10121a';
      ctx.font = `700 ${Math.round(R * 1.05)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, sx, sy + 0.5);
    }
  };
  const isSel = (k: SelKind, i: number) => s.sel?.kind === k && s.sel.index === i;
  data.traps.forEach((t, i) => dot(t.x, t.y, '#f0a040', '×', isSel('trap', i), 'diamond'));
  data.spawns.forEach((sp, i) => dot(sp.x + 0.5, sp.y + 0.5, SPAWN_COLORS[sp.kind] ?? '#e0533f', SPAWN_LETTER[sp.kind] ?? '?', isSel('spawn', i)));
  data.books.forEach((b, i) => dot(b.x, b.y, '#a98cff', 'L', isSel('book', i), 'square'));
  data.npcs.forEach((n, i) => {
    dot(n.x, n.y, '#f2d36b', (NPCS[n.id]?.name ?? n.id).charAt(0), isSel('npc', i));
    if (z >= 12) tag(ctx, NPCS[n.id]?.name ?? n.id, X(n.x), Y(n.y) - R - 9, '#f2d36b');
  });
  if (data.bossSpawn) dot(data.bossSpawn.x, data.bossSpawn.y, '#ff4d6d', '☠', s.sel?.kind === 'boss', 'diamond');
  dot(data.playerStart.x, data.playerStart.y, '#7ed37a', '▶', s.sel?.kind === 'start');
  data.places.forEach((p, i) => {
    const sel = isSel('place', i);
    ctx.font = `700 ${Math.max(11, Math.min(18, z * 0.7))}px Cinzel, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(10,10,14,0.75)';
    ctx.strokeText(p.name, X(p.x), Y(p.y));
    ctx.fillStyle = sel ? '#ffffff' : '#fbf3dc';
    ctx.fillText(p.name, X(p.x), Y(p.y));
    if (sel) {
      const tw = ctx.measureText(p.name).width;
      ctx.strokeStyle = '#6fd0ff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(X(p.x) - tw / 2 - 4, Y(p.y) - 11, tw + 8, 22);
    }
  });

  // Problemas da validação.
  for (const is of s.issues) {
    if (is.x === undefined || is.y === undefined) continue;
    const sx = X(is.x) + R * 0.9;
    const sy = Y(is.y) - R * 0.9;
    ctx.fillStyle = is.level === 'erro' ? '#ff6a5a' : '#ffbf5a';
    ctx.beginPath();
    ctx.arc(sx, sy, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#10121a';
    ctx.font = '700 9px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', sx, sy + 0.5);
  }

  // Pré-visualização da ferramenta.
  const p = s.preview;
  if (p?.type === 'ramp') drawRamp(ctx, s, p.ramp, p.ok, true, true);
  else if (p?.type === 'rect') {
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = '#6fd0ff';
    ctx.lineWidth = 2;
    const ax = Math.min(p.x0, p.x1);
    const ay = Math.min(p.y0, p.y1);
    ctx.strokeRect(X(ax), Y(ay), (Math.abs(p.x1 - p.x0) + 1) * z, (Math.abs(p.y1 - p.y0) + 1) * z);
    ctx.setLineDash([]);
  } else if (p?.type === 'circle') {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(X(p.x), Y(p.y), p.r * z, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Pincel sob o cursor.
  if (s.footprint.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1;
    for (const [fx, fy] of s.footprint) {
      ctx.fillRect(X(fx), Y(fy), z, z);
    }
    if (s.footprint.length === 1) ctx.strokeRect(X(s.footprint[0]![0]) + 0.5, Y(s.footprint[0]![1]) + 0.5, z - 1, z - 1);
  }

  // Destaque ao pular para um problema.
  if (s.flash) {
    const a = Math.max(0, 1 - s.flash.t);
    ctx.strokeStyle = `rgba(255,255,255,${a})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(X(s.flash.x), Y(s.flash.y), z * (1 + s.flash.t * 2), 0, Math.PI * 2);
    ctx.stroke();
  }

  // Moldura do mapa.
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(X(0) - 0.5, Y(0) - 0.5, w * z + 1, h * z + 1);
}

function tag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string): void {
  ctx.font = '600 11px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = 'rgba(12,13,18,0.82)';
  ctx.fillRect(x - tw / 2 - 5, y - 8, tw + 10, 16);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y + 0.5);
}

function drawRamp(ctx: CanvasRenderingContext2D, s: DrawState, r: RampDef, ok: boolean, selected: boolean, preview = false): void {
  const { z, ox, oy } = s.view;
  const px = -r.dy;
  const py = r.dx;
  // Retângulo da rampa (3 de largura, `len` de comprimento).
  const xs: number[] = [];
  const ys: number[] = [];
  for (let k = 0; k < r.len; k++)
    for (let o = -1; o <= 1; o++) {
      xs.push(r.x + k * r.dx + o * px);
      ys.push(r.y + k * r.dy + o * py);
    }
  const ax = Math.min(...xs);
  const ay = Math.min(...ys);
  const bw = Math.max(...xs) - ax + 1;
  const bh = Math.max(...ys) - ay + 1;
  if (preview) {
    ctx.fillStyle = ok ? 'rgba(126,211,122,0.35)' : 'rgba(255,106,90,0.35)';
    ctx.fillRect(ox + ax * z, oy + ay * z, bw * z, bh * z);
  }
  ctx.strokeStyle = !ok ? '#ff6a5a' : selected ? '#ffffff' : 'rgba(60,40,20,0.9)';
  ctx.lineWidth = selected ? 2.5 : 1.5;
  ctx.strokeRect(ox + ax * z + 0.5, oy + ay * z + 0.5, bw * z - 1, bh * z - 1);
  // Setas (chevrons) apontando para o topo.
  ctx.strokeStyle = ok ? 'rgba(60,36,16,0.85)' : '#ff6a5a';
  ctx.lineWidth = Math.max(1.5, z * 0.1);
  const cx = r.x + 0.5;
  const cy = r.y + 0.5;
  for (let k = 0; k < r.len; k++) {
    const mx = ox + (cx + r.dx * k) * z;
    const my = oy + (cy + r.dy * k) * z;
    const a = z * 0.3;
    ctx.beginPath();
    ctx.moveTo(mx - r.dx * a * 0.6 + px * a, my - r.dy * a * 0.6 + py * a);
    ctx.lineTo(mx + r.dx * a * 0.6, my + r.dy * a * 0.6);
    ctx.lineTo(mx - r.dx * a * 0.6 - px * a, my - r.dy * a * 0.6 - py * a);
    ctx.stroke();
  }
}
