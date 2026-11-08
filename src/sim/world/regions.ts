import { GENERATED_IDS, generateRegionData, type GeneratedId } from './generator';
import type { GameMap, RegionId } from './map';
import { compileMap, type MapData } from './terrain';

/**
 * Registro das regiões do jogo. Cada arquivo `src/maps/<id>.json` (feito no editor de
 * mapas) é uma região. Sem arquivo, o gerador procedural monta a região na hora.
 */
const files = import.meta.glob<MapData>('../../maps/*.json', { eager: true, import: 'default' });

const fromFiles = new Map<RegionId, MapData>();
for (const data of Object.values(files)) fromFiles.set(data.id, data);
/** Mapas temporários (teste de mapa vindo do editor): têm prioridade sobre os arquivos. */
const overrides = new Map<RegionId, MapData>();
const generated = new Map<RegionId, MapData>();

export const REGION_IDS: RegionId[] = [...new Set([...fromFiles.keys(), ...GENERATED_IDS])];

export function regionData(id: RegionId): MapData {
  const d = overrides.get(id) ?? fromFiles.get(id) ?? generated.get(id);
  if (d) return d;
  const gid = (GENERATED_IDS as string[]).includes(id) ? (id as GeneratedId) : GENERATED_IDS[0]!;
  const g = generateRegionData(gid);
  generated.set(gid, g);
  return g;
}

export function regionName(id: RegionId): string {
  return regionData(id).name;
}

export function buildRegion(id: RegionId): GameMap {
  return compileMap(regionData(id));
}

/** Usa este mapa no lugar do arquivo (só nesta sessão). */
export function registerMap(d: MapData): void {
  overrides.set(d.id, d);
  if (!REGION_IDS.includes(d.id)) REGION_IDS.push(d.id);
}
