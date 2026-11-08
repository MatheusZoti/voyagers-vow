import { AFFINITY_COLORS } from '../../sim/flow/affinity';
import { NPCS } from '../../sim/psyche/dialogues';
import type { Simulation } from '../../sim/sim';
import { SPELLS } from '../../sim/techniques';
import { heightAt, Tile, type GameMap } from '../../sim/world/map';

/**
 * Mapa da região, pintado com a mesma paleta do mundo 3D: grama morna, encostas de
 * arenito, rio azul no desfiladeiro, sombreamento de relevo com luz de noroeste e
 * curvas de nível discretas. A névoa cobre o que ainda não foi explorado.
 */
const baseCache = new Map<number, HTMLCanvasElement>();

const hex = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const GRASS = hex('#a3ad55');
const GRASS_DARK = hex('#7f923f');
const ROCK = hex('#bba580');
const PATH = hex('#c4a874');
const SANCT = hex('#ded4b6');
const ARENA = hex('#aaa290');
const WATER = hex('#6f88c9');

export function drawBase(map: GameMap, scale: number): HTMLCanvasElement {
  const cached = baseCache.get(scale);
  if (cached) return cached;
  const W = Math.round(map.w * scale);
  const H = Math.round(map.h * scale);
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(W, H);
  const onPath = (x: number, y: number) => {
    const ix = Math.floor(x);
    const a0 = map.pathY[ix];
    const a1 = map.pathY[Math.min(map.w, ix + 1)];
    if (a0 === undefined || a1 === undefined || Number.isNaN(a0) || Number.isNaN(a1)) return false;
    return Math.abs(y - (a0 + (a1 - a0) * (x - ix))) < 1.25 + Math.sin(x * 1.7) * 0.25;
  };
  for (let py = 0; py < H; py++)
    for (let px = 0; px < W; px++) {
      const x = (px + 0.5) / scale;
      const y = (py + 0.5) / scale;
      const t = map.tiles[Math.min(map.h - 1, Math.floor(y)) * map.w + Math.min(map.w - 1, Math.floor(x))] as Tile;
      const hgt = heightAt(map, x, y);
      const gx = heightAt(map, Math.min(map.w, x + 0.4), y) - heightAt(map, Math.max(0, x - 0.4), y);
      const gy = heightAt(map, x, Math.min(map.h, y + 0.4)) - heightAt(map, x, Math.max(0, y - 0.4));
      const slope = Math.hypot(gx, gy);
      // Luz de noroeste: encostas viradas para lá clareiam, as opostas escurecem.
      const shade = Math.max(0.5, Math.min(1.25, 1 - (gx * 0.55 + gy * 0.45) * 0.9));
      let c: [number, number, number];
      if (t === Tile.Water) {
        const depth = Math.min(1, Math.max(0, -hgt / 2.6));
        c = [WATER[0] * (1 - depth * 0.25), WATER[1] * (1 - depth * 0.2), WATER[2] * (1 - depth * 0.1)];
      } else if (slope > 0.75 || t === Tile.Cliff) c = ROCK;
      else if (onPath(x, y) || t === Tile.Bridge) c = PATH;
      else if (t === Tile.Sanctuary) c = SANCT;
      else if (t === Tile.Arena) c = ARENA;
      else {
        const k = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.cos(y * 0.17) * 2) * Math.cos(y * 0.23 - x * 0.05);
        const base = t === Tile.Tree ? GRASS_DARK : GRASS;
        c = [base[0] * (0.92 + k * 0.12), base[1] * (0.92 + k * 0.1), base[2] * (0.9 + k * 0.08)];
      }
      const lift = 1 + Math.max(0, hgt) * 0.025;
      const i = (py * W + px) * 4;
      img.data[i] = Math.min(255, c[0] * shade * lift);
      img.data[i + 1] = Math.min(255, c[1] * shade * lift);
      img.data[i + 2] = Math.min(255, c[2] * shade * lift);
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);

  // Curvas de nível discretas (marrom translúcido), a cada 0,8 m.
  g.strokeStyle = 'rgba(70, 52, 30, 0.22)';
  g.lineWidth = Math.max(1, scale / 10);
  g.beginPath();
  const W1 = map.w + 1;
  const Hc = (x: number, y: number) => map.heights[y * W1 + x]!;
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) {
      const cs = [Hc(x, y), Hc(x + 1, y), Hc(x + 1, y + 1), Hc(x, y + 1)];
      const lo = Math.min(...cs);
      const hi = Math.max(...cs);
      if (hi - lo < 0.01 || lo < -0.3) continue;
      for (let k = Math.ceil(lo / 0.8); k * 0.8 < hi; k++) {
        const th = k * 0.8;
        const pts: Array<[number, number]> = [];
        const edges: Array<[number, number, number, number, number, number]> = [
          [x, y, cs[0]!, x + 1, y, cs[1]!],
          [x + 1, y, cs[1]!, x + 1, y + 1, cs[2]!],
          [x + 1, y + 1, cs[2]!, x, y + 1, cs[3]!],
          [x, y + 1, cs[3]!, x, y, cs[0]!],
        ];
        for (const [x0, y0, h0, x1, y1, h1] of edges)
          if (h0 < th !== h1 < th) {
            const f = (th - h0) / (h1 - h0);
            pts.push([(x0 + (x1 - x0) * f) * scale, (y0 + (y1 - y0) * f) * scale]);
          }
        for (let i = 0; i + 1 < pts.length; i += 2) {
          g.moveTo(pts[i]![0], pts[i]![1]);
          g.lineTo(pts[i + 1]![0], pts[i + 1]![1]);
        }
      }
    }
  g.stroke();

  // Copas de árvore com sombra e brilho; pedregulhos.
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) {
      const t = map.tiles[y * map.w + x] as Tile;
      const v = map.variation[y * map.w + x]!;
      const cx = (x + 0.5 + (v - 0.5) * 0.4) * scale;
      const cy = (y + 0.5 + (v - 0.5) * 0.3) * scale;
      if (t === Tile.Tree) {
        const r = scale * (0.42 + v * 0.18);
        g.fillStyle = 'rgba(40, 34, 20, 0.35)';
        g.beginPath();
        g.arc(cx + r * 0.35, cy + r * 0.35, r, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = v < 0.12 ? '#d9732f' : v < 0.3 ? '#8a9d3e' : '#3f6e62';
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(255, 255, 230, 0.18)';
        g.beginPath();
        g.arc(cx - r * 0.3, cy - r * 0.3, r * 0.45, 0, Math.PI * 2);
        g.fill();
      } else if (t === Tile.Rock) {
        g.fillStyle = '#9f8f72';
        g.beginPath();
        g.arc(cx, cy, scale * 0.3, 0, Math.PI * 2);
        g.fill();
      }
    }

  // Santuário e arena: anéis tracejados.
  g.setLineDash([scale * 0.5, scale * 0.35]);
  g.lineWidth = Math.max(1.5, scale / 7);
  g.strokeStyle = 'rgba(70, 150, 190, 0.85)';
  g.beginPath();
  g.arc(map.sanctuary.x * scale, map.sanctuary.y * scale, map.sanctuary.r * scale, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = 'rgba(170, 70, 50, 0.8)';
  g.beginPath();
  g.arc(map.arena.x * scale, map.arena.y * scale, map.arena.r * scale, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);

  baseCache.set(scale, cv);
  return cv;
}

/** Névoa sobre o que ainda não foi explorado (bordas suaves). */
export function drawFog(g: CanvasRenderingContext2D, sim: Simulation, scale: number): void {
  const { w, h } = sim.map;
  // Uma borda de 1 tile não explorado em volta, para o desfoque não clarear as margens.
  const fog = document.createElement('canvas');
  fog.width = w + 2;
  fog.height = h + 2;
  const fg = fog.getContext('2d')!;
  const img = fg.createImageData(w + 2, h + 2);
  for (let y = 0; y < h + 2; y++)
    for (let x = 0; x < w + 2; x++) {
      const i = (y * (w + 2) + x) * 4;
      const inside = x > 0 && y > 0 && x <= w && y <= h;
      img.data[i] = 24;
      img.data[i + 1] = 21;
      img.data[i + 2] = 17;
      img.data[i + 3] = inside && sim.explored[(y - 1) * w + (x - 1)] ? 0 : 238;
    }
  fg.putImageData(img, 0, 0);
  g.save();
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  // Desfoque: a borda da névoa vira nuvem, não degraus de tile.
  g.filter = `blur(${Math.round(scale * 0.7)}px)`;
  g.drawImage(fog, -scale, -scale, (w + 2) * scale, (h + 2) * scale);
  g.restore();
}

/** Marcadores: só o que você já viu (inimigos, só os que estão à vista agora). */
export function drawMarkers(g: CanvasRenderingContext2D, sim: Simulation, scale: number): void {
  const p = sim.player;
  const S = (v: number) => v * scale;
  const dot = (x: number, y: number, r: number, fill: string, stroke = 'rgba(20,16,10,0.85)') => {
    g.beginPath();
    g.arc(S(x), S(y), r, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
    g.strokeStyle = stroke;
    g.lineWidth = 1.5;
    g.stroke();
  };
  const label = (text: string, x: number, y: number, font: string, color: string) => {
    g.font = font;
    g.textAlign = 'center';
    g.lineWidth = 3.5;
    g.strokeStyle = 'rgba(30, 24, 14, 0.75)';
    g.strokeText(text, S(x), S(y));
    g.fillStyle = color;
    g.fillText(text, S(x), S(y));
  };

  for (const pl of sim.map.places) if (sim.isExplored(pl.x, pl.y + 1.5)) label(pl.name, pl.x, pl.y, '700 15px Cinzel, serif', '#fbf3dc');

  for (const b of sim.map.books) {
    if (sim.c.booksRead.includes(b.id) || !sim.isExplored(b.x, b.y)) continue;
    g.fillStyle = AFFINITY_COLORS[SPELLS[b.spell].affinity];
    g.strokeStyle = 'rgba(20,16,10,0.85)';
    g.lineWidth = 1.5;
    g.fillRect(S(b.x) - 4, S(b.y) - 4, 8, 8);
    g.strokeRect(S(b.x) - 4, S(b.y) - 4, 8, 8);
  }
  for (const d of sim.drops) if (sim.isExplored(d.pos.x, d.pos.y)) dot(d.pos.x, d.pos.y, 5, AFFINITY_COLORS[SPELLS[d.spell].affinity], '#fff');
  if (sim.echo) dot(sim.echo.pos.x, sim.echo.pos.y, 5.5, '#a8e6ff', '#fff');

  for (const e of sim.enemies) {
    if (e.state === 'dead' || (e.def.shadowed && !e.revealed) || !sim.isVisible(e.pos)) continue;
    if (e.def.boss) {
      g.save();
      g.translate(S(e.pos.x), S(e.pos.y));
      g.rotate(Math.PI / 4);
      g.fillStyle = '#d8402f';
      g.strokeStyle = '#fff0e6';
      g.lineWidth = 2;
      g.fillRect(-6, -6, 12, 12);
      g.strokeRect(-6, -6, 12, 12);
      g.restore();
      continue;
    }
    dot(e.pos.x, e.pos.y, e.def.elite ? 5 : 3.5, e.aggro ? '#d8402f' : '#e98a6e');
  }

  for (const n of sim.map.npcs) {
    if (!sim.isExplored(n.x, n.y)) continue;
    const fresh = !!sim.dialogueFor(n.id);
    dot(n.x, n.y, 5, fresh ? '#ffd84a' : '#efe4c4');
    label(NPCS[n.id].name.split(' ').slice(-1)[0]!, n.x, n.y + 1.6, '600 11px Inter, sans-serif', '#f7efd8');
    if (fresh) label('!', n.x, n.y - 0.7, '800 14px Inter, sans-serif', '#ffd84a');
  }

  // Você: seta na direção do olhar, com o raio de visão.
  g.beginPath();
  g.arc(S(p.pos.x), S(p.pos.y), S(sim.visionRadius()), 0, Math.PI * 2);
  g.strokeStyle = 'rgba(255, 240, 200, 0.35)';
  g.lineWidth = 1.5;
  g.setLineDash([4, 5]);
  g.stroke();
  g.setLineDash([]);
  g.save();
  g.translate(S(p.pos.x), S(p.pos.y));
  g.rotate(Math.atan2(p.facing.y, p.facing.x));
  g.beginPath();
  g.moveTo(11, 0);
  g.lineTo(-8, 7);
  g.lineTo(-4, 0);
  g.lineTo(-8, -7);
  g.closePath();
  g.fillStyle = '#ffe9a0';
  g.strokeStyle = '#2a1d08';
  g.lineWidth = 2;
  g.fill();
  g.stroke();
  g.restore();
}
