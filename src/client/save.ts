import { migrateCharacter, type Character } from '../sim/character';

/**
 * Persistência local provisória. Quando o servidor existir, o personagem mora nele;
 * por ora o navegador guarda uma cópia.
 */
const KEY = 'voyagers-vow/character/v1';
/** O Mestre (GM) tem um espaço próprio: nunca sobrescreve o personagem do jogador. */
const GM_KEY = 'voyagers-vow/gm/v1';

export function loadCharacter(kind: 'player' | 'gm' = 'player'): Character | null {
  try {
    const raw = localStorage.getItem(kind === 'gm' ? GM_KEY : KEY);
    if (!raw) return null;
    return migrateCharacter(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveCharacter(c: Character): void {
  try {
    localStorage.setItem(c.gm ? GM_KEY : KEY, JSON.stringify(c));
  } catch {
    /* sem armazenamento: o jogo continua, só não persiste */
  }
}

export function deleteCharacter(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
