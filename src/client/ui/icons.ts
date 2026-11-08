/**
 * Ícones de traço fino (line-art), 24x24, cor herdada do texto.
 * Mesma linguagem das ilustrações de catálogo: contorno, sem preenchimento.
 */
const P: Record<string, string> = {
  // Posturas
  veil: '<path d="M12 3c4 2 6 2 7 2 0 7-2.5 12-7 15-4.5-3-7-8-7-15 1 0 3 0 7-2z"/><path d="M12 7.5c2 1 3 1 3.5 1-.2 3.6-1.4 6.2-3.5 7.8-2.1-1.6-3.3-4.2-3.5-7.8.5 0 1.5 0 3.5-1z" opacity=".55"/>',
  silence: '<path d="M3 12c2.5-3.5 5.5-5 9-5s6.5 1.5 9 5"/><path d="M5.5 14.5l-1.5 2M9.5 16l-.6 2.3M14.5 16l.6 2.3M18.5 14.5l1.5 2"/>',
  impetus: '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.3 2.3-5.2 3.4-8.3.5 1.8 1.3 2.8 2.3 3.4.2-2.8 1.4-5.2 3.6-6.9-.4 3.7 4.2 6.3 4.2 11.8 0 3.6-3 6.2-7 6.2z"/><path d="M12 21c-1.6 0-2.7-1.1-2.7-2.7 0-1.7 1.6-2.6 2.2-4.3 1.6 1.2 3.2 2.3 3.2 4.3 0 1.6-1.1 2.7-2.7 2.7z" opacity=".6"/>',
  gaze: '<path d="M2.5 12c2.5-4.2 5.7-6.3 9.5-6.3s7 2.1 9.5 6.3c-2.5 4.2-5.7 6.3-9.5 6.3S5 16.2 2.5 12z"/><circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r=".9" fill="currentColor"/>',
  // Técnicas
  signature:
    '<path d="M7 11V7.5a1.5 1.5 0 013 0V10m0-3.5a1.5 1.5 0 013 0V10m0-2.5a1.5 1.5 0 013 0V11m0-1a1.5 1.5 0 013 0v4.5c0 3.6-2.6 6.5-6.5 6.5h-1c-2.6 0-4.4-1.4-5.4-3.4L5 14.2a1.4 1.4 0 012.3-1.5L8.5 14"/><path d="M2 6l2 1M2.5 10.5L4.6 10M4 2.5l1.3 1.8" opacity=".6"/>',
  point:
    '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5" opacity=".6"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3"/>',
  basic: '<path d="M4 20L18.5 5.5M14 4h5v5"/><path d="M6 13l5 5M3 17l4 4" opacity=".6"/>',
  lance: '<path d="M3 21L17 7"/><path d="M14 4l6-1-1 6-3.5-1.5z"/><path d="M6 13l-2 2M10 17l-2 2" opacity=".55"/>',
  orbs: '<circle cx="7" cy="7" r="2.6"/><circle cx="16.5" cy="9" r="2.1"/><circle cx="10.5" cy="15.5" r="3"/><path d="M4 21h16" opacity=".5"/><path d="M7 10.5v2M16.5 12v2.5" opacity=".5"/>',
  pull: '<path d="M3 12h7"/><path d="M6.5 8.5L3 12l3.5 3.5"/><path d="M10 12c2-4 4-4 5 0s3 4 5 0" /><circle cx="20.5" cy="12" r="1.3" opacity=".6"/>',
  bolt: '<path d="M13 2.5L5 13.5h6l-1.5 8 8.5-11.5h-6z"/>',
  chains:
    '<rect x="3" y="9" width="8" height="5" rx="2.5" transform="rotate(-35 7 11.5)"/><rect x="13" y="10" width="8" height="5" rx="2.5" transform="rotate(-35 17 12.5)"/><path d="M10.5 12.5l3 -1" /><path d="M4 21h16" opacity=".5"/>',
  blade: '<path d="M4 20c5-1 11-6 14-14l2-2-2 .5C11 7 6 13 4 20z"/><path d="M4 20l3.5-3.5" opacity=".6"/>',
  repel: '<circle cx="12" cy="12" r="2.5"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/><path d="M5.3 5.3l2.4 2.4M16.3 16.3l2.4 2.4M5.3 18.7l2.4-2.4M16.3 7.7l2.4-2.4" opacity=".55"/>',
  discord: '<circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M3.5 20c.8-3 2.4-4.5 4.5-4.5s3.7 1.5 4.5 4.5M11.5 20c.8-3 2.4-4.5 4.5-4.5s3.7 1.5 4.5 4.5"/><path d="M11 4l2 2-2 2" opacity=".6"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 016.5 3H20v15H6.5A2.5 2.5 0 004 20.5z"/><path d="M4 20.5A2.5 2.5 0 016.5 18H20v3H6.5" opacity=".6"/><path d="M9 7.5h7M9 10.5h5" opacity=".6"/>',
  talk: '<path d="M4 5h16v10H9l-5 4z"/><path d="M8 9h8M8 12h5" opacity=".6"/>',
  tide: '<path d="M2.5 9c2 0 2-1.6 4-1.6S8.5 9 10.5 9s2-1.6 4-1.6 2 1.6 4 1.6 2-1.6 3-1.6"/><path d="M2.5 14c2 0 2-1.6 4-1.6s2 1.6 4 1.6 2-1.6 4-1.6 2 1.6 4 1.6 2-1.6 3-1.6"/><path d="M2.5 19c2 0 2-1.6 4-1.6s2 1.6 4 1.6 2-1.6 4-1.6 2 1.6 4 1.6" opacity=".55"/>',
  capacity: '<path d="M12 2.8c3.4 4.4 6.2 8 6.2 11.4a6.2 6.2 0 01-12.4 0C5.8 10.8 8.6 7.2 12 2.8z"/><path d="M8.6 15.2a3.4 3.4 0 003.4 3.1" opacity=".6"/>',
  // Estado
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5l5 5"/>',
  back: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 018 0v3"/><circle cx="12" cy="15.5" r="1.3"/>',
  empty: '<circle cx="12" cy="12" r="8" stroke-dasharray="2.5 3"/><path d="M12 9v6M9 12h6" opacity=".6"/>',
  seal: '<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/><path d="M12 7v5l3 2" opacity=".5"/>',
  // Modificadores
  damage: '<path d="M12 2.5l2.3 6 6.4.4-5 4 1.7 6.3L12 15.6l-5.4 3.6 1.7-6.3-5-4 6.4-.4z"/>',
  area: '<circle cx="12" cy="12" r="2.2"/><circle cx="12" cy="12" r="5.6" opacity=".7"/><circle cx="12" cy="12" r="9" opacity=".4"/>',
  range: '<path d="M3 12h16M14 6.5L19.5 12 14 17.5"/><path d="M3 8v8" opacity=".5"/>',
  cadence: '<circle cx="12" cy="13" r="8"/><path d="M12 8.5V13l3 2M9.5 2.5h5"/>',
  restore: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0112 7.5 4.3 4.3 0 0119.5 10c0 5.4-7.5 10-7.5 10z"/><path d="M12 10.5v5M9.5 13h5" opacity=".7"/>',
  stun: '<circle cx="12" cy="15" r="5.5"/><path d="M4.5 6.5l1.7 1.7M12 2.5v2.8M19.5 6.5l-1.7 1.7" opacity=".7"/><path d="M10 14.5h.01M14 14.5h.01"/>',
  shatter: '<path d="M12 3l7 3v5.5c0 4.4-3 8-7 9.5-4-1.5-7-5.1-7-9.5V6z"/><path d="M12 3l-1 6 3 2-2.5 5 .5 5" opacity=".7"/>',
};

export function icon(name: string, size = 20, extra = ''): string {
  const body = P[name] ?? P.empty;
  return `<svg class="ic ${extra}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
