import type { Character } from '../../sim/character';
import { MODS, modCost, PACTS, type EffectiveInfo, type EloSlot, type ModId } from '../../sim/elos';
import { AFFINITY_COLORS, AFFINITY_NAMES, AFFINITY_RING, affinityScores, hexDistance } from '../../sim/flow/affinity';
import { displayLevel, type MasteryRecord } from '../../sim/mastery';
import { clamp } from '../../sim/math';
import { EMOTION_COLORS, EMOTION_NAMES, type EmotionId, type EmotionMap } from '../../sim/psyche/emotions';
import { STRESS_BAND_NAMES, stressBand, type StressBand } from '../../sim/psyche/psyche';
import { TRAIT_POLES, traitPhrase, VALUE_IDS, VALUE_NAMES, valuePhrase, type TraitId, type Traits, type Values } from '../../sim/psyche/traits';
import type { MasteryId, TechniqueDef } from '../../sim/techniques';
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

export function affinityRadar(c: Character): string {
  const S = 380;
  const H = 300;
  const cx = S / 2;
  const cy = H / 2 + 4;
  const R = 92;
  const scores = affinityScores(c.psyche.traits);
  const ang = (i: number) => -Math.PI / 2 + (i * Math.PI) / 3;
  const grad = nextId('rg');
  const glow = nextId('gl');
  const hex = (r: number) =>
    AFFINITY_RING.map((_, i) => polar(cx, cy, r, ang(i)))
      .map((p, i) => `${i ? 'L' : 'M'}${f(p[0])},${f(p[1])}`)
      .join(' ') + 'Z';
  const pts = AFFINITY_RING.map((a, i) => {
    const v = a === 'singular' ? 0.14 : clamp(0.2 + ((scores[a] + 35) / 70) * 0.8, 0.14, 1);
    return polar(cx, cy, R * v, ang(i));
  });
  const labels = AFFINITY_RING.map((a, i) => {
    const [x, y] = polar(cx, cy, R + 22, ang(i));
    const anchor = Math.abs(x - cx) < 4 ? 'middle' : x > cx ? 'start' : 'end';
    const d = hexDistance(c.affinity, a);
    const own = d === 0;
    const sub = own ? 'sua afinidade' : a === 'singular' ? 'rara · Transe' : `${['', 'vizinha', 'duas casas', 'oposta'][d]} · −${d}`;
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
    <defs><filter id="${glow}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter></defs>
    <path d="${smoothOpen(pts)}" stroke="${color}" stroke-width="16" fill="none" opacity=".55" filter="url(#${glow})" stroke-linecap="round"/>
    <path d="${smoothOpen(pts)}" stroke="${color}" stroke-width="1.2" fill="none" opacity=".5"/>
    ${rows}${dots}
  </svg>`;
}

// ---------------------------------------------------------------------------
// Valores como equalizador (referência: equalizador com pílulas)
// ---------------------------------------------------------------------------

export function valuesEqualizer(values: Values): string {
  const W = 400;
  const H = 210;
  const colW = W / VALUE_IDS.length;
  const top = 14;
  const bottom = 132;
  const mid = (top + bottom) / 2;
  const cols = VALUE_IDS.map((id, i) => {
    const v = values[id];
    const cx = colW * i + colW / 2;
    const y = mid - (v / 50) * ((bottom - top) / 2 - 10);
    const strong = Math.abs(v) >= 25;
    const phrase = valuePhrase(id, v);
    const marks = [-1, -0.5, 0, 0.5, 1].map((t) => `<circle cx="${f(cx)}" cy="${f(mid - t * ((bottom - top) / 2 - 10))}" r="2.2" class="eq-mark"/>`).join('');
    return `<g class="eq-col ${strong ? 'strong' : ''}"><title>${escapeHtml(phrase ? phrase.charAt(0).toUpperCase() + phrase.slice(1) : `Neutro quanto a ${VALUE_NAMES[id]}`)}</title>
      <rect x="${f(cx - 13)}" y="${top}" width="26" height="${bottom - top}" rx="13" class="eq-pill"/>
      ${marks}
      ${Math.abs(v) > 1 ? `<rect x="${f(cx - 7)}" y="${f(Math.min(y, mid))}" width="14" height="${f(Math.abs(y - mid))}" rx="7" class="eq-fill"/>` : ''}
      <circle cx="${f(cx)}" cy="${f(y)}" r="9" class="eq-dot"/>
      <text x="${f(cx + 4)}" y="${bottom + 16}" text-anchor="end" class="eq-label" transform="rotate(-38 ${f(cx + 4)} ${bottom + 16})">${VALUE_NAMES[id]}</text>
      ${strong ? `<circle cx="${f(cx)}" cy="${top - 6}" r="2.5" class="eq-star"><title>${v > 0 ? 'valor forte' : 'rejeita'}</title></circle>` : ''}
    </g>`;
  }).join('');
  return `<svg class="values" viewBox="0 0 ${W} ${H}" role="img">
    <text x="2" y="${top + 6}" class="eq-axis">+</text><text x="2" y="${bottom}" class="eq-axis">−</text>
    ${cols}
  </svg>`;
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

// ---------------------------------------------------------------------------
// Constelação da Maestria (referência: árvore de habilidades em leque)
// ---------------------------------------------------------------------------

export interface ConstellationNode {
  id: MasteryId;
  x: number;
  y: number;
  parent: MasteryId | 'root';
  icon: string;
  label: string;
}

export const CONSTELLATION: ConstellationNode[] = [
  { id: 'basic', x: 150, y: 228, parent: 'root', icon: 'basic', label: 'Golpe básico' },
  { id: 'signature', x: 78, y: 128, parent: 'basic', icon: 'signature', label: 'Punho do Voto' },
  { id: 'point', x: 188, y: 112, parent: 'basic', icon: 'point', label: 'Ponto' },
  { id: 'veil', x: 268, y: 168, parent: 'root', icon: 'veil', label: 'Véu' },
  { id: 'silence', x: 292, y: 62, parent: 'veil', icon: 'silence', label: 'Silêncio' },
  { id: 'gaze', x: 412, y: 168, parent: 'root', icon: 'gaze', label: 'Olhar' },
  { id: 'impetus', x: 388, y: 62, parent: 'gaze', icon: 'impetus', label: 'Ímpeto' },
  { id: 'tide', x: 530, y: 228, parent: 'root', icon: 'tide', label: 'Maré' },
  { id: 'capacity', x: 600, y: 128, parent: 'tide', icon: 'capacity', label: 'Capacidade' },
];
const ROOT = { x: 340, y: 300 };

export function constellation(mastery: Record<MasteryId, MasteryRecord>, selected: MasteryId, accent: string): string {
  const pos = (id: MasteryId | 'root') => (id === 'root' ? ROOT : CONSTELLATION.find((n) => n.id === id)!);
  const glow = nextId('cg');
  const lines = CONSTELLATION.map((n) => {
    const p = pos(n.parent);
    const lit = displayLevel(mastery[n.id]) > 1 || mastery[n.id].level - 1 > 0.25;
    const mx = (p.x + n.x) / 2;
    return `<path d="M${p.x},${p.y} Q${mx},${Math.max(p.y, n.y) + 10} ${n.x},${n.y}" class="c-line ${lit ? 'lit' : ''}"/>`;
  }).join('');
  const nodes = CONSTELLATION.map((n) => {
    const r = mastery[n.id];
    const lvl = displayLevel(r);
    const frac = r.level - lvl;
    const rr = 25;
    const pc = 2 * Math.PI * (rr + 4);
    const sc = 2 * Math.PI * (rr + 9);
    const sel = n.id === selected;
    return `<g class="c-node ${sel ? 'sel' : ''} ${lvl > 1 ? 'lit' : ''}" data-node="${n.id}" tabindex="0">
      ${sel ? `<circle cx="${n.x}" cy="${n.y}" r="${rr + 16}" fill="${accent}" opacity=".18" filter="url(#${glow})"/>` : ''}
      <circle cx="${n.x}" cy="${n.y}" r="${rr + 9}" class="c-sharp-track"/>
      <circle cx="${n.x}" cy="${n.y}" r="${rr + 9}" class="c-sharp" stroke-dasharray="${f(sc * r.sharpness)} ${f(sc)}" transform="rotate(-90 ${n.x} ${n.y})"/>
      <circle cx="${n.x}" cy="${n.y}" r="${rr + 4}" class="c-prog-track"/>
      <circle cx="${n.x}" cy="${n.y}" r="${rr + 4}" class="c-prog" stroke="${accent}" stroke-dasharray="${f(pc * frac)} ${f(pc)}" transform="rotate(-90 ${n.x} ${n.y})"/>
      <circle cx="${n.x}" cy="${n.y}" r="${rr}" class="c-core"/>
      <g transform="translate(${n.x - 12} ${n.y - 12})" class="c-ic">${icon(n.icon, 24)}</g>
      <circle cx="${n.x + 21}" cy="${n.y + 19}" r="10" class="c-badge"/>
      <text x="${n.x + 21}" y="${n.y + 23}" text-anchor="middle" class="c-lvl">${lvl}</text>
      <text x="${n.x}" y="${n.y + rr + 26}" text-anchor="middle" class="c-label">${n.label}</text>
    </g>`;
  }).join('');
  return `<svg class="constellation" viewBox="0 0 680 340" role="img" aria-label="Maestria">
    <defs><filter id="${glow}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8"/></filter></defs>
    <text x="110" y="24" class="c-group">TÉCNICAS</text><text x="340" y="24" text-anchor="middle" class="c-group">POSTURAS</text><text x="570" y="24" text-anchor="end" class="c-group">FLUXO</text>
    <path d="M60,300 A280,280 0 0 1 620,300" class="c-arc"/>
    ${lines}
    <circle cx="${ROOT.x}" cy="${ROOT.y}" r="14" class="c-root"/><circle cx="${ROOT.x}" cy="${ROOT.y}" r="5" fill="${accent}"/>
    ${nodes}
  </svg>`;
}
