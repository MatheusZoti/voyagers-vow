import { AFFINITY_RING, type Affinity } from './flow/affinity';
import { clamp, type Rng } from './math';

/**
 * Equipamentos (estilo Albion): catálogo feito à mão, como as magias. O tier do item é o
 * tier da região onde ele cai; a qualidade (Comum → Obra-prima) multiplica a base e traz
 * afixos que conversam com os sistemas do jogo (Maré, Véu, Fluxo).
 *
 * Itens nunca mudam o nível das magias: a Grade de Elos continua decidindo isso.
 */

export const SLOTS = ['weapon', 'head', 'chest', 'feet', 'focus'] as const;
export type Slot = (typeof SLOTS)[number];
export const SLOT_NAMES: Record<Slot, string> = { weapon: 'Arma', head: 'Cabeça', chest: 'Peito', feet: 'Pés', focus: 'Foco' };

/** O que um item pode somar à ficha. */
export type ItemStat = 'hp' | 'flowMax' | 'flowRegen' | 'power' | 'guard' | 'speed' | 'flowCost' | 'tideSpeed' | 'veil' | 'focusPower' | 'focusCost';

/** Forma da arma: muda o Golpe básico. */
export type WeaponForm = 'fists' | 'blade' | 'mace' | 'staff';
export interface WeaponFormDef {
  name: string;
  /** dano do golpe (×) */
  damage: number;
  /** intervalo entre golpes (×; menor = mais rápido) */
  cadence: number;
  /** alcance extra (m) */
  reach: number;
  /** abertura extra do golpe (graus) */
  arc: number;
  /** atordoamento extra do finalizador (s) */
  stun: number;
  /** empurrão (×) */
  knock: number;
  desc: string;
}
export const WEAPON_FORMS: Record<WeaponForm, WeaponFormDef> = {
  fists: { name: 'Punhos', damage: 1, cadence: 1, reach: 0, arc: 0, stun: 0, knock: 1, desc: 'Sem arma: golpes curtos e rápidos.' },
  blade: { name: 'Lâmina', damage: 1.05, cadence: 0.88, reach: 0.25, arc: 0, stun: 0, knock: 0.9, desc: 'Mais rápida e um pouco mais longa que os punhos.' },
  mace: { name: 'Maça', damage: 1.5, cadence: 1.35, reach: 0, arc: 5, stun: 0.35, knock: 1.5, desc: 'Lenta e pesada: o finalizador atordoa por mais tempo e empurra longe.' },
  staff: { name: 'Cajado', damage: 0.9, cadence: 1.05, reach: 0.8, arc: 15, stun: 0, knock: 1.1, desc: 'Alcance longo e golpe largo; canaliza Fluxo.' },
};

export interface ItemDef {
  id: string;
  name: string;
  slot: Slot;
  /** 1–8: o tier da região onde cai */
  tier: number;
  form?: WeaponForm;
  base: Partial<Record<ItemStat, number>>;
  desc: string;
}

const def = (d: ItemDef): ItemDef => d;
export const ITEMS: Record<string, ItemDef> = Object.fromEntries(
  [
    // Tier 1 — Vale da Ponte
    def({ id: 'huntKnife', name: 'Faca de caça', slot: 'weapon', tier: 1, form: 'blade', base: { power: 0.1 }, desc: 'Lâmina curta de caçador.' }),
    def({ id: 'knotClub', name: 'Porrete de nó', slot: 'weapon', tier: 1, form: 'mace', base: { power: 0.12 }, desc: 'Um galho grosso, um nó na ponta.' }),
    def({ id: 'ashStaff', name: 'Bordão de freixo', slot: 'weapon', tier: 1, form: 'staff', base: { power: 0.08, flowRegen: 0.5 }, desc: 'Madeira que guarda o Fluxo.' }),
    def({ id: 'leatherHood', name: 'Capuz de couro', slot: 'head', tier: 1, base: { hp: 8, guard: 0.03 }, desc: 'Protege a cabeça e esconde o rosto.' }),
    def({ id: 'padded', name: 'Gibão acolchoado', slot: 'chest', tier: 1, base: { guard: 0.08, hp: 5 }, desc: 'Camadas de lã costuradas.' }),
    def({ id: 'trailBoots', name: 'Botas de trilha', slot: 'feet', tier: 1, base: { speed: 0.25 }, desc: 'Leves, feitas para andar o dia todo.' }),
    def({ id: 'stoneAmulet', name: 'Amuleto de pedra-viva', slot: 'focus', tier: 1, base: { focusPower: 0.1, focusCost: 0.08 }, desc: 'Uma pedra que pulsa com uma afinidade.' }),
    // Tier 2 — Planalto de Varn
    def({ id: 'varnBlade', name: 'Lâmina de Varn', slot: 'weapon', tier: 2, form: 'blade', base: { power: 0.22 }, desc: 'Aço do planalto, bem temperado.' }),
    def({ id: 'stoneMace', name: 'Maça de pedra', slot: 'weapon', tier: 2, form: 'mace', base: { power: 0.26 }, desc: 'Pedra rubra presa a um cabo de carvalho.' }),
    def({ id: 'thornStaff', name: 'Cajado de espinheiro', slot: 'weapon', tier: 2, form: 'staff', base: { power: 0.18, flowRegen: 1 }, desc: 'Os espinhos ainda se mexem.' }),
    def({ id: 'bronzeHelm', name: 'Elmo de bronze', slot: 'head', tier: 2, base: { hp: 16, guard: 0.06 }, desc: 'Pesado, mas segura um golpe.' }),
    def({ id: 'scaleMail', name: 'Cota de escamas', slot: 'chest', tier: 2, base: { guard: 0.15, hp: 10, speed: -0.15 }, desc: 'Escamas de bronze: muita proteção, um pouco de peso.' }),
    def({ id: 'runnerBoots', name: 'Botas de corredor', slot: 'feet', tier: 2, base: { speed: 0.45, flowRegen: 0.3 }, desc: 'Couro fino e sola de cortiça.' }),
    def({ id: 'amberAmulet', name: 'Amuleto de âmbar', slot: 'focus', tier: 2, base: { focusPower: 0.18, focusCost: 0.12 }, desc: 'Âmbar com uma faísca presa dentro.' }),
  ].map((d) => [d.id, d]),
);

/** Qualidade 1–5. */
export const QUALITY_NAMES = ['Comum', 'Bom', 'Excelente', 'Primoroso', 'Obra-prima'] as const;
export const QUALITY_COLORS = ['#c9c3b4', '#7ed37a', '#6fb6ff', '#c49bff', '#ffbf5a'] as const;
const QUALITY_MULT = [1, 1.1, 1.2, 1.35, 1.5];
const QUALITY_AFFIXES = [0, 1, 1, 2, 2];

export type AffixId = 'vigor' | 'tide' | 'veil' | 'thrift' | 'spring' | 'swift' | 'edge';
interface AffixDef {
  name: string;
  stat: ItemStat;
  /** valor no tier 1 (o sorteio varia ±20%; cresce 60% por tier) */
  base: number;
  slots: readonly Slot[];
}
export const AFFIXES: Record<AffixId, AffixDef> = {
  vigor: { name: 'do Vigor', stat: 'hp', base: 8, slots: ['head', 'chest', 'feet', 'focus'] },
  tide: { name: 'da Maré', stat: 'tideSpeed', base: 0.08, slots: ['weapon', 'head', 'focus'] },
  veil: { name: 'do Véu', stat: 'veil', base: 0.04, slots: ['head', 'chest'] },
  thrift: { name: 'da Parcimônia', stat: 'flowCost', base: 0.05, slots: ['weapon', 'focus', 'head'] },
  spring: { name: 'da Fonte', stat: 'flowRegen', base: 0.5, slots: ['weapon', 'chest', 'focus', 'feet'] },
  swift: { name: 'do Vento', stat: 'speed', base: 0.2, slots: ['feet', 'chest'] },
  edge: { name: 'do Gume', stat: 'power', base: 0.04, slots: ['weapon', 'focus'] },
};

/** Um item que existe no mundo (na mochila, equipado ou no chão). */
export interface Item {
  uid: number;
  def: string;
  quality: number;
  /** afinidade do Foco (sorteada ao cair) */
  affinity?: Affinity;
  affixes: Array<{ id: AffixId; value: number }>;
}

export const BAG_SIZE = 20;

export const itemDef = (it: Item): ItemDef | undefined => ITEMS[it.def];

export function itemName(it: Item): string {
  const d = itemDef(it);
  if (!d) return 'Item desconhecido';
  const first = it.affixes[0];
  return first ? `${d.name} ${AFFIXES[first.id].name}` : d.name;
}

/** Nível mínimo para usar: o início da faixa do tier (1, 5, 9…). */
export const itemMinLevel = (d: ItemDef) => 1 + 4 * (d.tier - 1);

/** O que este item soma à ficha. */
export function itemStats(it: Item): Partial<Record<ItemStat, number>> {
  const d = itemDef(it);
  const out: Partial<Record<ItemStat, number>> = {};
  if (!d) return out;
  const q = QUALITY_MULT[clamp(it.quality, 1, 5) - 1]!;
  for (const [k, v] of Object.entries(d.base) as Array<[ItemStat, number]>) out[k] = (out[k] ?? 0) + (k === 'speed' && v < 0 ? v : v * q);
  for (const a of it.affixes) {
    const st = AFFIXES[a.id]?.stat;
    if (st) out[st] = (out[st] ?? 0) + a.value;
  }
  return out;
}

/** Arredonda para um número "de ficha". */
function tidy(stat: ItemStat, v: number): number {
  return stat === 'hp' ? Math.round(v) : Math.round(v * 100) / 100;
}

/** Cria um item de um modelo, sorteando qualidade (se não vier), afixos e a afinidade do Foco. */
export function rollItem(rng: Rng, defId: string, uid: number, quality?: number): Item {
  const d = ITEMS[defId]!;
  const q = quality ?? rollQuality(rng);
  const pool = (Object.keys(AFFIXES) as AffixId[]).filter((a) => AFFIXES[a].slots.includes(d.slot));
  const affixes: Item['affixes'] = [];
  for (let i = 0; i < QUALITY_AFFIXES[q - 1]! && pool.length; i++) {
    const id = pool.splice(rng.int(0, pool.length - 1), 1)[0]!;
    const a = AFFIXES[id];
    affixes.push({ id, value: tidy(a.stat, a.base * (1 + 0.6 * (d.tier - 1)) * rng.range(0.8, 1.2)) });
  }
  return { uid, def: defId, quality: q, affinity: d.slot === 'focus' ? rng.pick([...AFFINITY_RING]) : undefined, affixes };
}

/** Qualidade sorteada; `luck` > 0 empurra para cima (chefes). */
export function rollQuality(rng: Rng, luck = 0): number {
  const w = [50, 28, 14, 6, 2].map((x, i) => x * Math.pow(1 + luck, i));
  let r = rng.next() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < 5; i++) {
    r -= w[i]!;
    if (r <= 0) return i + 1;
  }
  return 5;
}

/** Modelos que podem cair numa região deste tier (os do próprio tier; nunca acima). */
export function lootPool(tier: number): string[] {
  const exact = Object.values(ITEMS).filter((d) => d.tier === tier);
  const best = exact.length ? exact : Object.values(ITEMS).filter((d) => d.tier <= tier).sort((a, b) => b.tier - a.tier);
  const top = best[0]?.tier ?? 1;
  return best.filter((d) => d.tier === top).map((d) => d.id);
}

/** Chance de uma criatura deixar um equipamento ao morrer. */
export const ITEM_DROP_CHANCE: Record<string, number> = { grunt: 0.1, stalker: 0.14, slinger: 0.14, brute: 0.45, boss: 1 };

/** Uma linha de texto para cada atributo do item (para fichas e dicas). */
export const ITEM_STAT_NAMES: Record<ItemStat, string> = {
  hp: 'Vida',
  flowMax: 'Fluxo máximo',
  flowRegen: 'Regeneração de Fluxo',
  power: 'Poder',
  guard: 'Guarda',
  speed: 'Velocidade',
  flowCost: 'Magias mais baratas',
  tideSpeed: 'Maré mais rápida',
  veil: 'Véu mais forte',
  focusPower: 'Magias da afinidade mais fortes',
  focusCost: 'Magias da afinidade mais baratas',
};
export function formatItemStat(stat: ItemStat, v: number): string {
  const sign = v > 0 ? '+' : '';
  if (stat === 'hp' || stat === 'flowMax') return `${sign}${Math.round(v)}`;
  if (stat === 'flowRegen') return `${sign}${v.toFixed(1)}/s`;
  if (stat === 'speed') return `${sign}${v.toFixed(2)} m/s`;
  return `${sign}${Math.round(v * 100)}%`;
}

/** Equipamento no chão. */
export interface ItemDrop {
  id: number;
  item: Item;
  pos: { x: number; y: number };
  expiresAt: number;
}
