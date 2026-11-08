import { AFFINITY_COLORS } from '../../sim/flow/affinity';
import type { Simulation } from '../../sim/sim';
import { SPELLS } from '../../sim/techniques';
import { TERRACE, terraceLevel, Tile, type GameMap } from '../../sim/world/map';

/**
 * Mapa topográfico no estilo "curvas de nível": fundo escuro, cada terraço um tom,
 * linhas claras onde o nível muda, pinheiros em traço. A base é desenhada uma vez por escala;
 * os marcadores (você, inimigos, NPCs, livros) por cima, a cada quadro.
 */
const baseCache = new Map<number, HTMLCanvasElement>();

export function drawBase(map: GameMap, scale: number): HTMLCanvasElement {
  const cached = baseCache.get(scale);
  if (cached) return cached;
  const cv = document.createElement('canvas');
  cv.width = Math.round(map.w * scale);
  cv.height = Math.round(map.h * scale);
  const g = cv.getContext('2d')!;
  g.fillStyle = '#121418';
  g.fillRect(0, 0, cv.width, cv.height);

  const lvl = (x: number, y: number) => (x < 0 || y < 0 || x >= map.w || y >= map.h ? 99 : terraceLevel(map, x, y));
  const tile = (x: number, y: number) => map.tiles[y * map.w + x] as Tile;

  // Terraços: quanto mais alto, mais claro.
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) {
      const t = tile(x, y);
      const l = lvl(x, y);
      let c = `hsl(222, 9%, ${Math.min(30, 11 + Math.max(0, l) * 1.6)}%)`;
      if (t === Tile.Water) c = '#18324a';
      else if (t === Tile.Path || t === Tile.Bridge) c = `hsl(32, 14%, ${17 + Math.max(0, l) * 1.4}%)`;
      else if (t === Tile.Sanctuary) c = 'hsl(45, 18%, 26%)';
      else if (t === Tile.Arena) c = 'hsl(210, 12%, 22%)';
      g.fillStyle = c;
      g.fillRect(x * scale, y * scale, scale + 0.5, scale + 0.5);
    }

  // Curvas de nível por marching squares nos cantos do relevo: linhas suaves, não em degraus de tile.
  g.strokeStyle = 'rgba(235, 238, 245, 0.55)';
  g.lineWidth = Math.max(1, scale / 8);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const W1 = map.w + 1;
  const H = (x: number, y: number) => map.heights[y * W1 + x]!;
  g.beginPath();
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) {
      const c = [H(x, y), H(x + 1, y), H(x + 1, y + 1), H(x, y + 1)];
      const lo = Math.min(...c);
      const hi = Math.max(...c);
      if (hi - lo < 0.01 || lo < 0) continue;
      // Um limiar entre cada par de terraços: (k + 0.5) * TERRACE.
      for (let k = Math.floor(lo / TERRACE); (k + 0.5) * TERRACE < hi; k++) {
        const t = (k + 0.5) * TERRACE;
        if (t < lo) continue;
        const pts: Array<[number, number]> = [];
        const edges: Array<[number, number, number, number, number, number]> = [
          [x, y, c[0]!, x + 1, y, c[1]!],
          [x + 1, y, c[1]!, x + 1, y + 1, c[2]!],
          [x + 1, y + 1, c[2]!, x, y + 1, c[3]!],
          [x, y + 1, c[3]!, x, y, c[0]!],
        ];
        for (const [x0, y0, h0, x1, y1, h1] of edges) {
          if ((h0 < t) !== (h1 < t)) {
            const f = (t - h0) / (h1 - h0);
            pts.push([(x0 + (x1 - x0) * f) * scale, (y0 + (y1 - y0) * f) * scale]);
          }
        }
        for (let i = 0; i + 1 < pts.length; i += 2) {
          g.moveTo(pts[i]![0], pts[i]![1]);
          g.lineTo(pts[i + 1]![0], pts[i + 1]![1]);
        }
      }
    }
  g.stroke();

  // Margem do rio.
  g.strokeStyle = 'rgba(120, 190, 240, 0.55)';
  g.beginPath();
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) {
      const w = tile(x, y) === Tile.Water;
      if (x + 1 < map.w && w !== (tile(x + 1, y) === Tile.Water)) {
        g.moveTo((x + 1) * scale, y * scale);
        g.lineTo((x + 1) * scale, (y + 1) * scale);
      }
    }
  g.stroke();

  // Pinheiros e rochas em traço claro (esparsos, para não poluir).
  g.strokeStyle = 'rgba(230, 236, 245, 0.75)';
  g.fillStyle = 'rgba(230, 236, 245, 0.75)';
  g.lineWidth = Math.max(0.8, scale / 10);
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) {
      const t = tile(x, y);
      const v = map.variation[y * map.w + x]!;
      const cx = (x + 0.5) * scale;
      const cy = (y + 0.5) * scale;
      if (t === Tile.Tree && v < (scale > 6 ? 0.45 : 0.22)) {
        const s = scale * (0.35 + v * 0.4);
        g.beginPath();
        g.moveTo(cx, cy - s);
        g.lineTo(cx - s * 0.55, cy + s * 0.6);
        g.lineTo(cx + s * 0.55, cy + s * 0.6);
        g.closePath();
        g.stroke();
      } else if (t === Tile.Rock && v < 0.5) {
        g.beginPath();
        g.arc(cx, cy, scale * 0.18, 0, Math.PI * 2);
        g.fill();
      }
    }

  // Santuário e arena: círculos tracejados.
  g.setLineDash([scale * 0.5, scale * 0.4]);
  g.lineWidth = Math.max(1, scale / 7);
  g.strokeStyle = 'rgba(127, 227, 255, 0.7)';
  g.beginPath();
  g.arc(map.sanctuary.x * scale, map.sanctuary.y * scale, map.sanctuary.r * scale, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = 'rgba(255, 140, 110, 0.7)';
  g.beginPath();
  g.arc(map.arena.x * scale, map.arena.y * scale, map.arena.r * scale, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);

  baseCache.set(scale, cv);
  return cv;
}

/** Marcadores dinâmicos. `big` = mapa grande (com nomes e o chefe sempre visível). */
export function drawMarkers(g: CanvasRenderingContext2D, sim: Simulation, scale: number, big: boolean): void {
  const p = sim.player;
  const S = (v: number) => v * scale;
  const dot = (x: number, y: number, r: number, fill: string, stroke?: string) => {
    g.beginPath();
    g.arc(S(x), S(y), r, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
    if (stroke) {
      g.strokeStyle = stroke;
      g.lineWidth = 1.5;
      g.stroke();
    }
  };

  // Livros ainda não lidos.
  for (const b of sim.map.books) {
    if (sim.c.booksRead.includes(b.id)) continue;
    const c = AFFINITY_COLORS[SPELLS[b.spell].affinity];
    g.fillStyle = c;
    const s = big ? 6 : 3.5;
    g.fillRect(S(b.x) - s / 2, S(b.y) - s / 2, s, s);
  }
  // Grimórios no chão.
  for (const d of sim.drops) dot(d.pos.x, d.pos.y, big ? 4.5 : 3, AFFINITY_COLORS[SPELLS[d.spell].affinity], '#fff');
  // Eco.
  if (sim.echo) dot(sim.echo.pos.x, sim.echo.pos.y, big ? 5 : 3, '#a8e6ff', '#fff');

  // Inimigos (os em Sombra só quando revelados).
  for (const e of sim.enemies) {
    if (e.state === 'dead' || (e.def.shadowed && !e.revealed)) continue;
    if (e.def.boss) {
      if (!big && Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y) > 30) continue;
      const s = big ? 9 : 5;
      g.save();
      g.translate(S(e.pos.x), S(e.pos.y));
      g.rotate(Math.PI / 4);
      g.fillStyle = '#ff5a4a';
      g.strokeStyle = '#ffd0c8';
      g.lineWidth = 1.5;
      g.fillRect(-s / 2, -s / 2, s, s);
      g.strokeRect(-s / 2, -s / 2, s, s);
      g.restore();
      continue;
    }
    const r = (e.def.elite ? 3.2 : 2.2) * (big ? 1.5 : 1);
    dot(e.pos.x, e.pos.y, r, e.aggro ? '#ff5a4a' : 'rgba(255, 120, 100, 0.55)');
  }

  // NPCs.
  for (const n of sim.map.npcs) {
    const fresh = !!sim.dialogueFor(n.id);
    dot(n.x, n.y, big ? 4.5 : 2.8, fresh ? '#ffd84a' : '#d9cfb4');
    if (fresh) {
      g.fillStyle = '#ffd84a';
      g.font = `700 ${big ? 13 : 9}px Inter, sans-serif`;
      g.textAlign = 'center';
      g.fillText('!', S(n.x), S(n.y) - (big ? 7 : 4));
    }
  }

  // Você: seta na direção do olhar.
  g.save();
  g.translate(S(p.pos.x), S(p.pos.y));
  g.rotate(Math.atan2(p.facing.y, p.facing.x));
  const a = big ? 10 : 6;
  g.beginPath();
  g.moveTo(a, 0);
  g.lineTo(-a * 0.7, a * 0.6);
  g.lineTo(-a * 0.35, 0);
  g.lineTo(-a * 0.7, -a * 0.6);
  g.closePath();
  g.fillStyle = '#ffe9a0';
  g.strokeStyle = '#1a1206';
  g.lineWidth = 1.5;
  g.fill();
  g.stroke();
  g.restore();

  if (big) {
    g.textAlign = 'center';
    for (const pl of sim.map.places) {
      g.font = '700 14px Cinzel, serif';
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(10, 12, 16, 0.85)';
      g.strokeText(pl.name, S(pl.x), S(pl.y));
      g.fillStyle = '#f1ead8';
      g.fillText(pl.name, S(pl.x), S(pl.y));
    }
    g.font = '600 11px Inter, sans-serif';
    for (const n of sim.map.npcs) {
      const name = n.id === 'oren' ? 'Oren' : n.id === 'kael' ? 'Kael' : n.id === 'traveler' ? 'Viajante' : n.id === 'pilgrim' ? 'Ilsa' : n.id === 'herald' ? 'Arauto' : 'Mira';
      g.lineWidth = 3;
      g.strokeText(name, S(n.x), S(n.y) + 16);
      g.fillStyle = '#d9cfb4';
      g.fillText(name, S(n.x), S(n.y) + 16);
    }
  }
}

/** Minimapa no canto da tela: a região inteira, sempre à vista. */
export class Minimap {
  readonly el: HTMLDivElement;
  private cv: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private acc = 0;
  private readonly scale = 3;
  onOpen: () => void = () => {};

  constructor(private sim: Simulation) {
    this.el = document.createElement('div');
    this.el.className = 'minimap';
    this.el.title = 'Mapa (N)';
    this.cv = document.createElement('canvas');
    this.cv.width = sim.map.w * this.scale;
    this.cv.height = sim.map.h * this.scale;
    this.g = this.cv.getContext('2d')!;
    const label = document.createElement('div');
    label.className = 'mm-label';
    label.innerHTML = '<span>Vale da Ponte</span><kbd>N</kbd>';
    this.el.append(this.cv, label);
    this.el.addEventListener('click', () => this.onOpen());
    this.draw();
  }

  update(dt: number): void {
    this.acc += dt;
    if (this.acc < 0.1) return;
    this.acc = 0;
    this.draw();
  }

  private draw(): void {
    this.g.drawImage(drawBase(this.sim.map, this.scale), 0, 0);
    drawMarkers(this.g, this.sim, this.scale, false);
  }
}
