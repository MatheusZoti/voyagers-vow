/** Teclas dos 8 Elos: Q E R F (Elos 1–4) e depois 1–4 (Elos 5–8). Rótulos (HUD, menus) e códigos (teclado). */
export const SLOT_KEYS = ['Q', 'E', 'R', 'F', '1', '2', '3', '4'] as const;
export const SLOT_CODES: Record<string, number> = {
  KeyQ: 1,
  KeyE: 2,
  KeyR: 3,
  KeyF: 4,
  Digit1: 5,
  Digit2: 6,
  Digit3: 7,
  Digit4: 8,
};
