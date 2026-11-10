import type { Vec2 } from '../math';
import { FLOOR_H, Tile, type GameMap } from './map';

/**
 * Visão por andar, copiada do "high ground" do Dota: quem está embaixo não enxerga o andar de
 * cima (nem o que se passa lá); quem está em cima enxerga os andares de baixo normalmente.
 * A parede de rocha de um andar mais alto também corta a linha de visão de quem está abaixo.
 * Rampas deixam ver aos poucos: subindo, o andar de cima vai aparecendo.
 */
const TOL = 0.5;

/** "Altura em andares" de um tile (fracionária nas rampas). */
export function tileLevel(m: GameMap, x: number, y: number): number {
  const i = y * m.w + x;
  const t = m.tiles[i];
  if (t === Tile.Bridge) return 0;
  if (t === Tile.Ramp || t === Tile.Cliff) {
    const W = m.w + 1;
    const a = m.heights[y * W + x]!;
    const b = m.heights[y * W + x + 1]!;
    const c = m.heights[(y + 1) * W + x]!;
    const d = m.heights[(y + 1) * W + x + 1]!;
    return (t === Tile.Cliff ? Math.max(a, b, c, d) : (a + b + c + d) / 4) / FLOOR_H;
  }
  return m.floors[i]!;
}

/** Preenche `out` (1 = à vista) para um observador em `pos` com o raio dado. */
export function computeVision(m: GameMap, pos: Vec2, radius: number, out: Uint8Array): void {
  out.fill(0);
  const ox = Math.floor(pos.x);
  const oy = Math.floor(pos.y);
  if (ox < 0 || oy < 0 || ox >= m.w || oy >= m.h) return;
  const obs = tileLevel(m, ox, oy);
  const lvl = new Float32Array(m.w * m.h).fill(NaN);
  const level = (x: number, y: number) => {
    const i = y * m.w + x;
    if (Number.isNaN(lvl[i]!)) lvl[i] = tileLevel(m, x, y);
    return lvl[i]!;
  };
  for (let ty = Math.max(0, Math.floor(pos.y - radius)); ty <= Math.min(m.h - 1, pos.y + radius); ty++)
    for (let tx = Math.max(0, Math.floor(pos.x - radius)); tx <= Math.min(m.w - 1, pos.x + radius); tx++) {
      const cx = tx + 0.5;
      const cy = ty + 0.5;
      // Tile inteiro que o círculo toca (o teste fino por entidade é feito em Simulation.isVisible).
      if (Math.hypot(Math.max(tx - pos.x, 0, pos.x - tx - 1), Math.max(ty - pos.y, 0, pos.y - ty - 1)) > radius) continue;
      const isCliff = m.tiles[ty * m.w + tx] === Tile.Cliff;
      // Não se enxerga o andar de cima (a face da parede de rocha, sim).
      if (!isCliff && level(tx, ty) > obs + TOL) continue;
      // Linha de visão: nenhum tile no caminho pode estar num andar acima do observador.
      const dx = cx - pos.x;
      const dy = cy - pos.y;
      const steps = Math.ceil(Math.hypot(dx, dy) * 4);
      let blocked = false;
      for (let s = 1; s < steps && !blocked; s++) {
        const sx = pos.x + (dx * s) / steps;
        const sy = pos.y + (dy * s) / steps;
        const px = Math.floor(sx);
        const py = Math.floor(sy);
        if ((px === ox && py === oy) || (px === tx && py === ty)) continue;
        if (level(px, py) <= obs + TOL) continue;
        // Raspar a quina de uma parede de rocha (como quem anda colado nela) não corta a visão.
        if (m.tiles[py * m.w + px] === Tile.Cliff) {
          const fx = sx - px;
          const fy = sy - py;
          if (fx < 0.25 || fx > 0.75 || fy < 0.25 || fy > 0.75) continue;
        }
        blocked = true;
      }
      if (!blocked) out[ty * m.w + tx] = 1;
    }
  out[oy * m.w + ox] = 1;
}
