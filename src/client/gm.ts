import { applyOverrides, emptyOverrides, sanitizeOverrides, type DataOverrides } from '../sim/overrides';

/**
 * Ajustes do Mestre guardados neste navegador. Valem para todos os personagens daqui
 * (são os dados do mundo, como os botões de balanceamento do painel de playtest).
 */
const KEY = 'voyagers-vow/gm-overrides/v1';

export const gmOverrides: DataOverrides = emptyOverrides();

/** Lê os ajustes salvos e aplica sobre os dados do código. Chamar uma vez no início. */
export function loadGmOverrides(): void {
  let raw: unknown = null;
  try {
    const s = localStorage.getItem(KEY);
    raw = s ? JSON.parse(s) : null;
  } catch {
    raw = null;
  }
  Object.assign(gmOverrides, sanitizeOverrides(raw));
  applyOverrides(gmOverrides);
}

/** Aplica no jogo e grava. */
export function commitGmOverrides(): void {
  applyOverrides(gmOverrides);
  try {
    if (Object.keys(gmOverrides.spells).length || Object.keys(gmOverrides.pacts).length) localStorage.setItem(KEY, JSON.stringify(gmOverrides));
    else localStorage.removeItem(KEY);
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
}

export function resetAllGmOverrides(): void {
  gmOverrides.spells = {};
  gmOverrides.pacts = {};
  commitGmOverrides();
}
