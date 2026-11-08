/** Teclas dos 8 Elos: 1–4 e depois Q E R F. Rótulos (HUD, menus) e códigos (teclado). */
export const SLOT_KEYS = ['1', '2', '3', '4', 'Q', 'E', 'R', 'F'] as const;
export const SLOT_CODES: Record<string, number> = {
  Digit1: 1,
  Digit2: 2,
  Digit3: 3,
  Digit4: 4,
  KeyQ: 5,
  KeyE: 6,
  KeyR: 7,
  KeyF: 8,
};
