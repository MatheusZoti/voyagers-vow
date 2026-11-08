import { MAX_RESTRICTION_BONUS, PACT_IDS, PACTS, type PactId } from './elos';
import { clamp } from './math';
import { SPELL_IDS, SPELLS, type SpellId } from './techniques';

/**
 * Ajustes do Mestre (GM) sobre os dados de magias e Restrições.
 * Os valores do código são o padrão; os ajustes são aplicados por cima, em tempo real
 * (a simulação lê SPELLS/PACTS a cada uso). "Restaurar" volta exatamente ao código.
 * Quando houver servidor, estes ajustes moram nele.
 */

export type SpellNumField = 'baseDamage' | 'range' | 'radius' | 'minLevel';

export interface FieldDef {
  key: SpellNumField;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  hint: string;
}

export const SPELL_FIELDS: readonly FieldDef[] = [
  { key: 'baseDamage', label: 'Dano base', unit: '', min: 0, max: 500, step: 1, hint: 'Dano antes de nível efetivo, forja, Maré e Maestria.' },
  { key: 'range', label: 'Alcance', unit: 'm', min: 0, max: 30, step: 0.1, hint: 'Distância máxima (nunca passa do seu raio de visão).' },
  { key: 'radius', label: 'Raio', unit: 'm', min: 0, max: 12, step: 0.1, hint: 'Tamanho da área de efeito.' },
  { key: 'minLevel', label: 'Nível mínimo', unit: '', min: 1, max: 8, step: 1, hint: 'Elo mínimo na própria afinidade; outras afinidades somam a distância.' },
];

export const PACT_LEVEL_MIN = 1;
export const PACT_LEVEL_MAX = MAX_RESTRICTION_BONUS;

export interface SpellOverride {
  baseDamage?: number;
  range?: number;
  radius?: number;
  minLevel?: number;
  /** lista completa de Restrições compatíveis, quando alterada */
  pacts?: PactId[];
}
export interface PactOverride {
  level?: number;
}
export interface DataOverrides {
  spells: Partial<Record<SpellId, SpellOverride>>;
  pacts: Partial<Record<PactId, PactOverride>>;
}

export const emptyOverrides = (): DataOverrides => ({ spells: {}, pacts: {} });

// Retrato dos valores do código, tirado uma vez ao carregar o módulo.
const DEFAULT_SPELLS = Object.fromEntries(
  SPELL_IDS.map((id) => {
    const s = SPELLS[id];
    return [id, { baseDamage: s.baseDamage, range: s.range, radius: s.radius, minLevel: s.minLevel, pacts: [...s.pacts] }];
  }),
) as Record<SpellId, Required<SpellOverride>>;
const DEFAULT_PACTS = Object.fromEntries(PACT_IDS.map((id) => [id, { level: PACTS[id].level }])) as Record<PactId, Required<PactOverride>>;

export const spellDefault = (id: SpellId) => DEFAULT_SPELLS[id];
export const pactDefault = (id: PactId) => DEFAULT_PACTS[id];

const round = (v: number, step: number) => (step >= 1 ? Math.round(v) : Math.round(v * 10) / 10);

/** Limpa entradas inválidas (ids que não existem mais, números fora da faixa). */
export function sanitizeOverrides(raw: unknown): DataOverrides {
  const out = emptyOverrides();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as { spells?: Record<string, SpellOverride>; pacts?: Record<string, PactOverride> };
  for (const [id, o] of Object.entries(r.spells ?? {})) {
    if (!(SPELL_IDS as readonly string[]).includes(id) || !o || typeof o !== 'object') continue;
    const clean: SpellOverride = {};
    for (const f of SPELL_FIELDS) {
      const v = o[f.key];
      if (typeof v === 'number' && Number.isFinite(v)) clean[f.key] = round(clamp(v, f.min, f.max), f.step);
    }
    if (Array.isArray(o.pacts)) clean.pacts = PACT_IDS.filter((p) => o.pacts!.includes(p));
    if (Object.keys(clean).length) out.spells[id as SpellId] = clean;
  }
  for (const [id, o] of Object.entries(r.pacts ?? {})) {
    if (!(PACT_IDS as readonly string[]).includes(id) || !o || typeof o.level !== 'number') continue;
    out.pacts[id as PactId] = { level: Math.round(clamp(o.level, PACT_LEVEL_MIN, PACT_LEVEL_MAX)) };
  }
  return out;
}

/** Volta tudo ao código e aplica os ajustes por cima. */
export function applyOverrides(o: DataOverrides): void {
  for (const id of SPELL_IDS) {
    const s = SPELLS[id];
    const d = DEFAULT_SPELLS[id];
    const ov = o.spells[id] ?? {};
    s.baseDamage = ov.baseDamage ?? d.baseDamage;
    s.range = ov.range ?? d.range;
    s.radius = ov.radius ?? d.radius;
    s.minLevel = ov.minLevel ?? d.minLevel;
    s.pacts = [...(ov.pacts ?? d.pacts)];
  }
  for (const id of PACT_IDS) PACTS[id].level = o.pacts[id]?.level ?? DEFAULT_PACTS[id].level;
}

/** Grava um campo numérico de magia; igual ao padrão = remove o ajuste. */
export function setSpellField(o: DataOverrides, id: SpellId, key: SpellNumField, value: number): void {
  const f = SPELL_FIELDS.find((x) => x.key === key)!;
  const v = round(clamp(value, f.min, f.max), f.step);
  const ov = { ...(o.spells[id] ?? {}) };
  if (v === DEFAULT_SPELLS[id][key]) delete ov[key];
  else ov[key] = v;
  setSpell(o, id, ov);
}

/** Liga/desliga uma Restrição compatível com a magia. */
export function toggleSpellPact(o: DataOverrides, id: SpellId, pact: PactId): void {
  const cur = new Set(o.spells[id]?.pacts ?? DEFAULT_SPELLS[id].pacts);
  if (cur.has(pact)) cur.delete(pact);
  else cur.add(pact);
  const list = PACT_IDS.filter((p) => cur.has(p));
  const ov = { ...(o.spells[id] ?? {}) };
  const def = DEFAULT_SPELLS[id].pacts;
  if (list.length === def.length && list.every((p) => def.includes(p))) delete ov.pacts;
  else ov.pacts = list;
  setSpell(o, id, ov);
}

export function setPactLevel(o: DataOverrides, id: PactId, level: number): void {
  const v = Math.round(clamp(level, PACT_LEVEL_MIN, PACT_LEVEL_MAX));
  if (v === DEFAULT_PACTS[id].level) delete o.pacts[id];
  else o.pacts[id] = { level: v };
}

export function resetSpell(o: DataOverrides, id: SpellId): void {
  delete o.spells[id];
}
export function resetPact(o: DataOverrides, id: PactId): void {
  delete o.pacts[id];
}

export function countOverrides(o: DataOverrides): number {
  return Object.values(o.spells).reduce((n, s) => n + Object.keys(s ?? {}).length, 0) + Object.keys(o.pacts).length;
}

function setSpell(o: DataOverrides, id: SpellId, ov: SpellOverride): void {
  if (Object.keys(ov).length) o.spells[id] = ov;
  else delete o.spells[id];
}
