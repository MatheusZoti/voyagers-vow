import { migrateCharacter, type Character } from '../sim/character';

/**
 * Persistência local provisória. Quando o servidor existir, o personagem mora nele;
 * por ora o navegador guarda uma cópia.
 */
const KEY = 'voyagers-vow/character/v1';
let enabled = true;

/** Teste de mapa vindo do editor: nada é salvo. */
export function disableSaving(): void {
  enabled = false;
}

export function loadCharacter(): Character | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return migrateCharacter(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveCharacter(c: Character): void {
  if (!enabled) return;
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
