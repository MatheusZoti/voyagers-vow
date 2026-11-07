import type { Character } from '../sim/character';

/**
 * Persistência local provisória. Quando o servidor existir, o personagem mora nele;
 * por ora o navegador guarda uma cópia.
 */
const KEY = 'voyagers-vow/character/v1';

export function loadCharacter(): Character | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Character;
    return c.version === 1 ? c : null;
  } catch {
    return null;
  }
}

export function saveCharacter(c: Character): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
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
