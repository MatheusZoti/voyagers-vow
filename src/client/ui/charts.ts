import type { Character } from '../../sim/character';
import { MODS, modCost, PACTS, type EffectiveInfo, type EloSlot, type ModId } from '../../sim/elos';
import { AFFINITY_COLORS, AFFINITY_NAMES, AFFINITY_RING, hexDistance, type Affinity } from '../../sim/flow/affinity';
import { displayLevel, type MasteryRecord } from '../../sim/mastery';
import { clamp } from '../../sim/math';
import { EMOTION_COLORS, EMOTION_NAMES, type EmotionId, type EmotionMap } from '../../sim/psyche/emotions';
import { STRESS_BAND_NAMES, stressBand, type StressBand } from '../../sim/psyche/psyche';
import { TRAIT_POLES, traitPhrase, VALUE_IDS, VALUE_NAMES, valuePhrase, type TraitId, type Traits, type Values } from '../../sim/psyche/traits';
import { SPELLS, type MasteryId, type SpellId, type TechniqueDef } from '../../sim/techniques';
import { escapeHtml } from '../util';
import { icon } from './icons';

const f = (n: number) => n.toFixed(1);
const polar = (cx: number, cy: number, r: number, a: number): [number, number] => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];

/** Caminho fechado e suave por pontos (Catmull-Rom -> Bézier). */
function smoothClosed(pts: Array<[number, number]>, tension = 0.5): string {
  const n = pts.length;
  let d = `M${f(pts[0]![0])},${f(pts[0]![1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]!;
    const p1 = pts[i]!;
    const p2 = pts[(i + 1) % n]!;
    const p3 = pts[(i + 2) % n]!;
    const c1 = [p1[0] + ((p2[0] - p0[0]) / 6) * tension * 2, p1[1] + ((p2[1] - p0[1]) / 6) * tension * 2];
    const c2 = [p2[0] - ((p3[0] - p1[0]) / 6) * tension * 2, p2[1] - ((p3[1] - p1[1]) / 6) * tension * 2];
    d += ` C${f(c1[0]!)},${f(c1[1]!)} ${f(c2[0]!)},${f(c2[1]!)} ${f(p2[0])},${f(p2[1])}`;
  }
  return d + 'Z';
}

/** Caminho aberto e suave (para a trilha dos traços). */
function smoothOpen(pts: Array<[number, number]>): string {
  let d = `M${f(pts[0]![0])},${f(pts[0]![1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}

let uid = 0;
const nextId = (p: string) => `${p}${++uid}`;

// ---------------------------------------------------------------------------
// Radar do hexágono de afinidades (referência: radar com blob orgânico)
// ---------------------------------------------------------------------------

/** Pentágono de afinidades; `weights` (0–1) desenha a forma colorida. */
export function affinityRadar(c: Character, weights: Record<Affinity, number>): string {
  const S = 380;
  const H = 300;
  const cx = S / 2;
  const cy = H / 2 + 4;
  const R = 92;
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / AFFINITY_RING.length;
  const grad = nextId('rg');
  const glow = nextId('gl');
  const hex = (r: number) =>
    AFFINITY_RING.map((_, i) => polar(cx, cy, r, ang(i)))
      .map((p, i) => `${i ? 'L' : 'M'}${f(p[0])},${f(p[1])}`)
      .join(' ') + 'Z';
  const pts = AFFINITY_RING.map((a, i) => {
    const v = clamp(0.14 + weights[a] * 0.86, 0.14, 1);
    return polar(cx, cy, R * v, ang(i));
  });
  const labels = AFFINITY_RING.map((a, i) => {
    const [x, y] = polar(cx, cy, R + 22, ang(i));
    const anchor = Math.abs(x - cx) < 4 ? 'middle' : x > cx ? 'start' : 'end';
    const d = hexDistance(c.affinity, a);
    const own = d === 0;
    const sub = own ? 'sua · Elo 1+' : `${d === 1 ? 'vizinha' : 'distante'} · Elo ${d + 1}+`;
    return `<g class="rl ${own ? 'own' : ''}">
      <text x="${f(x)}" y="${f(y - 2)}" text-anchor="${anchor}" class="rl-name" ${own ? `fill="${AFFINITY_COLORS[a]}"` : ''}>${AFFINITY_NAMES[a]}</text>
      <text x="${f(x)}" y="${f(y + 11)}" text-anchor="${anchor}" class="rl-sub">${sub}</text>
    </g>`;
  }).join('');
  const dots = pts.map((p, i) => {
    const a = AFFINITY_RING[i]!;
    return `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="${a === c.affinity ? 4 : 2.2}" fill="${a === c.affinity ? AFFINITY_COLORS[a] : '#c9d2e3'}"/>`;
  }).join('');
  const axes = AFFINITY_RING.map((_, i) => {
    const [x, y] = polar(cx, cy, R, ang(i));
    return `<line x1="${cx}" y1="${cy}" x2="${f(x)}" y2="${f(y)}"/>`;
  }).join('');
  return `<svg class="radar" viewBox="0 0 ${S} ${H}" role="img" aria-label="Hexágono de afinidades">
    <defs>
      <linearGradient id="${grad}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6fae"/><stop offset=".5" stop-color="#b48cff"/><stop offset="1" stop-color="#6fd0ff"/></linearGradient>
      <filter id="${glow}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>
    </defs>
    <circle cx="${cx}" cy="${cy}" r="${R + 8}" class="r-ring"/>
    <circle cx="${cx}" cy="${cy}" r="${R * 0.5}" class="r-ring dashed"/>
    <path d="${hex(R)}" class="r-grid"/><path d="${hex(R * 0.66)}" class="r-grid"/><path d="${hex(R * 0.33)}" class="r-grid"/>
    <g class="r-axes">${axes}</g>
    <path d="${smoothClosed(pts)}" stroke="url(#${grad})" stroke-width="7" fill="none" opacity=".55" filter="url(#${glow})"/>
    <path d="${smoothClosed(pts)}" stroke="url(#${grad})" stroke-width="2" fill="url(#${grad})" fill-opacity=".08"/>
    ${dots}
    <circle cx="${cx}" cy="${cy}" r="13" fill="#141620" stroke="${AFFINITY_COLORS[c.affinity]}" stroke-width="1.5"/>
    <circle cx="${cx}" cy="${cy}" r="4" fill="${AFFINITY_COLORS[c.affinity]}"/>
    ${labels}
  </svg>`;
}

// ---------------------------------------------------------------------------
// Roda de emoções (referência: roda em pétalas) com o estresse no centro
// ---------------------------------------------------------------------------

/** Positivas à direita, negativas à esquerda. */
const WHEEL_ORDER: EmotionId[] = ['joy', 'euphoria', 'pride', 'calm', 'fear', 'grief', 'shame', 'fury'];

const BAND_COLOR: Record<StressBand, string> = { inspired: '#7fe3ff', stable: '#7ed37a', shaken: '#ffae3a', crisis: '#ff3a2a' };

function sector(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, r1, a0);
  const [x1, y1] = polar(cx, cy, r1, a1);
  const [x2, y2] = polar(cx, cy, r0, a1);
  const [x3, y3] = polar(cx, cy, r0, a0);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${f(x0)},${f(y0)} A${r1},${r1} 0 ${large} 1 ${f(x1)},${f(y1)} L${f(x2)},${f(y2)} A${r0},${r0} 0 ${large} 0 ${f(x3)},${f(y3)}Z`;
}

export function emotionWheel(emotions: EmotionMap, stress: number, opts: { size?: number; labels?: boolean } = {}): string {
  const S = opts.size ?? 280;
  const cx = S / 2;
  const cy = S / 2;
  const R = S / 2 - 6;
  const r0 = R * 0.34;
  const step = (Math.PI * 2) / 8;
  const gap = opts.labels === false ? 0.05 : 0.035;
  const round = opts.labels === false ? 2 : 6;
  const petals = WHEEL_ORDER.map((id, i) => {
    const a0 = -Math.PI / 2 - step / 2 + i * step + gap;
    const a1 = a0 + step - gap * 2;
    const k = emotions[id]?.intensity ?? 0;
    const inner = k > 0.02 ? sector(cx, cy, r0 + round / 2, r0 + round / 2 + (R - r0 - round) * Math.max(0.12, k), a0 + 0.02, a1 - 0.02) : '';
    const shell = sector(cx, cy, r0 + round / 2, R - round / 2, a0, a1);
    const mid = (a0 + a1) / 2;
    const [lx, ly] = polar(cx, cy, (r0 + R) / 2 + 4, mid);
    const color = EMOTION_COLORS[id];
    const word = k > 0.66 ? 'intensa' : k > 0.33 ? 'moderada' : k > 0.02 ? 'leve' : '';
    return `<g class="petal ${k > 0.02 ? 'on' : ''}"><title>${EMOTION_NAMES[id]}${word ? ` — ${word}` : ''}</title>
      <path d="${shell}" class="p-shell" stroke-width="${round}"/>
      ${inner ? `<path d="${inner}" fill="${color}" stroke="${color}" stroke-width="${round}" stroke-linejoin="round" class="p-fill" style="--k:${k.toFixed(2)}"/>` : ''}
      ${
        opts.labels === false
          ? ''
          : `<text x="${f(lx)}" y="${f(ly)}" text-anchor="middle" class="p-label ${k > 0.45 ? 'dark' : ''}">${EMOTION_NAMES[id]}</text>${word ? `<text x="${f(lx)}" y="${f(ly + 12)}" text-anchor="middle" class="p-word ${k > 0.45 ? 'dark' : ''}">${word}</text>` : ''}`
      }
    </g>`;
  }).join('');
  const band = stressBand(stress);
  const rr = r0 - (opts.labels === false ? 5 : 10);
  const circ = 2 * Math.PI * rr;
  const center =
    opts.labels === false
      ? ''
      : `<text x="${cx}" y="${cy - 2}" text-anchor="middle" class="w-band" fill="${BAND_COLOR[band]}">${STRESS_BAND_NAMES[band]}</text><text x="${cx}" y="${cy + 13}" text-anchor="middle" class="w-sub">estresse</text>`;
  return `<svg class="wheel" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" role="img" aria-label="Emoções">
    ${petals}
    <circle cx="${cx}" cy="${cy}" r="${rr}" class="w-track" stroke-width="${opts.labels === false ? 3 : 5}"/>
    <circle cx="${cx}" cy="${cy}" r="${rr}" fill="none" stroke="${BAND_COLOR[band]}" stroke-width="${opts.labels === false ? 3 : 5}" stroke-linecap="round"
      stroke-dasharray="${f((circ * stress) / 100)} ${f(circ)}" transform="rotate(-90 ${cx} ${cy})"/>
    ${center}
  </svg>`;
}

// ---------------------------------------------------------------------------
// Traços como sliders bipolares com trilha luminosa (referência: polos + trilha)
// ---------------------------------------------------------------------------

export function traitSliders(traits: Traits, ids: TraitId[], color: string): string {
  const W = 380;
  const rowH = 40;
  const H = ids.length * rowH + 8;
  const x0 = 106;
  const x1 = 274;
  const glow = nextId('tg');
  const pts: Array<[number, number]> = ids.map((id, i) => [x0 + (traits[id] / 100) * (x1 - x0), 22 + i * rowH]);
  const pill = (x: number, y: number, text: string, anchor: 'start' | 'end') => {
    const w = text.length * 6.6 + 16;
    const rx = anchor === 'end' ? x - w + 8 : x - 8;
    return `<rect x="${f(rx)}" y="${y - 10}" width="${f(w)}" height="19" rx="9.5" class="pole-pill"/>`;
  };
  const rows = ids.map((id, i) => {
    const y = 22 + i * rowH;
    const v = traits[id];
    const [lo, hi] = TRAIT_POLES[id];
    const phrase = traitPhrase(id, v);
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => `<line x1="${f(x0 + t * (x1 - x0))}" x2="${f(x0 + t * (x1 - x0))}" y1="${y - 3}" y2="${y + 3}" class="tick"/>`).join('');
    return `<g class="trow"><title>${escapeHtml(phrase ? phrase.charAt(0).toUpperCase() + phrase.slice(1) : 'Equilibrado')}</title>
      ${v <= 38 ? pill(x0 - 14, y, lo, 'end') : ''}${v >= 62 ? pill(x1 + 14, y, hi, 'start') : ''}
      <text x="${x0 - 14}" y="${y + 3.5}" text-anchor="end" class="pole ${v <= 38 ? 'hot' : ''}">${lo}</text>
      <text x="${x1 + 14}" y="${y + 3.5}" text-anchor="start" class="pole ${v >= 62 ? 'hot' : ''}">${hi}</text>
      <line x1="${x0}" x2="${x1}" y1="${y}" y2="${y}" class="track"/>${ticks}
      <rect x="${x0 - 10}" y="${y - 16}" width="${x1 - x0 + 20}" height="32" fill="transparent"/>
    </g>`;
  }).join('');
  const dots = pts
    .map(([x, y], i) => {
      const extreme = Math.abs(traits[ids[i]!] - 50) >= 30;
      return `<circle cx="${f(x)}" cy="${y}" r="${extreme ? 7 : 5.5}" class="tdot ${extreme ? 'hot' : ''}" ${extreme ? `style="--c:${color}"` : ''}/>`;
    })
    .join('');
  return `<svg class="traits" viewBox="0 0 ${W} ${H}" role="img">
    <!-- Área do filtro em unidades do SVG: em % ela segue a caixa da linha, que é estreita quando
         os traços estão alinhados, e o brilho saía cortado num retângulo. -->
    <defs><filter id="${glow}" filterUnits="userSpaceOnUse" x="-40" y="-40" width="${W + 80}" height="${H + 80}"><feGaussianBlur stdDeviation="7"/></filter></defs>
    <path d="${smoothOpen(pts)}" stroke="${color}" stroke-width="16" fill="none" opacity=".55" filter="url(#${glow})" stroke-linecap="round"/>
    <path d="${smoothOpen(pts)}" stroke="${color}" stroke-width="1.2" fill="none" opacity=".5"/>
    ${rows}${dots}
  </svg>`;
}

// ---------------------------------------------------------------------------
// Valores como equalizador (referência: equalizador com pílulas)
// ---------------------------------------------------------------------------

/**
 * Valores em pílulas de equalizador, em HTML: as colunas ocupam a largura do card,
 * as pílulas esticam na altura disponível e o texto mantém tamanho fixo e legível
 * (o SVG antigo encolhia inteiro, texto junto, em telas menores).
 */
export function valuesEqualizer(values: Values): string {
  const cols = VALUE_IDS.map((id) => {
    const v = Math.max(-50, Math.min(50, values[id])) / 50; // −1 … 1
    const strong = Math.abs(values[id]) >= 25;
    const phrase = valuePhrase(id, values[id]);
    const tip = phrase ? phrase.charAt(0).toUpperCase() + phrase.slice(1) : `Neutro quanto a ${VALUE_NAMES[id]}`;
    // O ponto anda 40% da pílula para cada lado do centro.
    const dot = 50 - v * 40;
    const fillTop = Math.min(dot, 50);
    const fillH = Math.abs(dot - 50);
    return `<div class="vcol ${strong ? 'strong' : ''} ${v < 0 ? 'neg' : ''}" title="${escapeHtml(tip)}${strong ? (v > 0 ? ' · valor forte' : ' · rejeita') : ''}">
      <div class="vpill">
        <i class="vmark" style="top:10%"></i><i class="vmark" style="top:30%"></i><i class="vmark mid" style="top:50%"></i><i class="vmark" style="top:70%"></i><i class="vmark" style="top:90%"></i>
        ${Math.abs(v) > 0.02 ? `<i class="vfill" style="top:${f(fillTop)}%;height:${f(fillH)}%"></i>` : ''}
        <i class="vdot" style="top:${f(dot)}%"></i>
      </div>
      <div class="vlbl"><span>${VALUE_NAMES[id]}</span></div>
    </div>`;
  }).join('');
  return `<div class="vals" role="img" aria-label="Valores">
    <div class="vals-axis" aria-hidden="true"><span>+</span><span>−</span></div>
    <div class="vals-cols">${cols}</div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Escada do nível efetivo: Elo + Restrições (+1 cada) − afinidade, teto Elo + 4
// ---------------------------------------------------------------------------

export function levelLadder(info: EffectiveInfo): string {
  const base = info.slotLevel;
  const withRestr = Math.min(base + info.restrictionBonus, base + 4, 12);
  const withAligned = Math.min(base + info.restrictionBonus + info.alignedBonus, base + 4, 12);
  const capped = withAligned;
  const cells = Array.from({ length: 12 }, (_, i) => {
    const n = i + 1;
    let cls = 'empty';
    let tip = '';
    if (n <= base) {
      cls = 'base';
      tip = `Elo ${base}`;
    } else if (n <= withRestr) {
      cls = 'restr';
      tip = 'Restrição';
    } else if (n <= withAligned) {
      cls = 'aligned';
      tip = 'Valor forte';
    }
    if (n > info.effective && n <= capped) {
      cls += ' lost';
      tip = 'Penalidade de afinidade';
    }
    if (n > base + 4) cls += ' out';
    if (n > 8) cls += ' beyond';
    if (n === info.effective) cls += ' current';
    return `<div class="lcell ${cls}" title="${tip}"><span>${n}</span></div>`;
  }).join('');
  return `<div class="ladder">${cells}</div>
    <div class="ladder-legend">
      <span><i class="lg base"></i>Elo ${base}</span>
      ${info.restrictionBonus ? `<span><i class="lg restr"></i>+${Math.min(info.restrictionBonus, 4)} Restrições</span>` : ''}
      ${info.alignedBonus ? `<span><i class="lg aligned"></i>+1 valor forte</span>` : ''}
      ${info.affinityPenalty ? `<span><i class="lg lost"></i>−${info.affinityPenalty} afinidade</span>` : ''}
      <span class="muted">teto Elo + 4 · 9–12 Além-limite</span>
    </div>`;
}

// ---------------------------------------------------------------------------
// Forja como equalizador de pontos (referência: equalizador)
// ---------------------------------------------------------------------------

export function forgeEqualizer(slot: EloSlot, info: EffectiveInfo, tech: TechniqueDef, discount: number, editable: boolean): string {
  const free = info.points - info.pointsUsed;
  const budget = Array.from({ length: Math.max(info.points, 0) }, (_, i) => `<i class="${i < info.pointsUsed ? 'on' : ''}"></i>`).join('');
  const cols = tech.mods
    .map((id: ModId) => {
      const d = MODS[id];
      const n = slot.mods[id] ?? 0;
      const cost = modCost(id, discount);
      const dots = Array.from({ length: d.max }, (_, k) => {
        const level = k + 1;
        const on = level <= n;
        const extra = (level - n) * cost;
        const affordable = level <= n || extra <= free;
        return `<button class="fdot ${on ? 'on' : ''} ${affordable ? '' : 'na'}" data-mod="${id}" data-n="${level}" ${!editable || !affordable ? 'disabled' : ''} title="${d.name} ${level}"></button>`;
      })
        .reverse()
        .join('');
      return `<div class="fcol ${n ? 'active' : ''}" title="${d.desc}">
        <span class="fic">${icon(id, 18)}</span>
        <div class="fpill">${dots}</div>
        <span class="fname">${d.name}</span>
        <span class="fcost">${cost} pt${cost > 1 ? 's' : ''}</span>
        <button class="fclear" data-mod="${id}" data-n="0" ${!editable || !n ? 'disabled' : ''}>limpar</button>
      </div>`;
    })
    .join('');
  return `<div class="forge">
    <div class="budget"><span>Pontos de forja</span><div class="bdots">${budget || '<em class="muted">nenhum no nível 1 — adicione uma Restrição</em>'}</div><b>${info.pointsUsed}/${info.points}</b></div>
    <div class="fcols">${cols}</div>
  </div>`;
}

export const pactPips = (level: number) => `<span class="pips">${Array.from({ length: 4 }, (_, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('')}</span>`;

export const pactCost = (id: keyof typeof PACTS) => PACTS[id].level;

