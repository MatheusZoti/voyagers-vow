/**
 * Ícones de traço fino (line-art), 24x24, cor herdada do texto.
 * Mesma linguagem das ilustrações de catálogo: contorno, sem preenchimento.
 */
const P: Record<string, string> = {
  // Equipamento
  helm: '<path d="M4.5 15.5c0-5 3.3-9.5 7.5-9.5s7.5 4.5 7.5 9.5"/><path d="M3.5 15.5h17v2.5h-17z"/><path d="M12 6v9.5M9 10.5h6" opacity=".6"/>',
  armor: '<path d="M8 3.5l4 2 4-2 4 3-2 4v10H6v-10l-2-4z"/><path d="M12 5.5v15M8.5 12h7" opacity=".55"/>',
  boots: '<path d="M7 3h5v9l6.5 3.2c1 .5 1.5 1.3 1.5 2.3V20H5V3z"/><path d="M5 16.5h15M7 7.5h5" opacity=".55"/>',
  amulet: '<path d="M6 3c0 4.5 2.7 7 6 7s6-2.5 6-7"/><path d="M12 10l4.5 5-4.5 6-4.5-6z"/><circle cx="12" cy="15.3" r="1.4" fill="currentColor" opacity=".7"/>',
  mace: '<path d="M4 20l8.5-8.5"/><circle cx="15.5" cy="8.5" r="4"/><path d="M15.5 2.5v2M21.5 8.5h-2M19.7 4.3l-1.4 1.4M19.7 12.7l-1.4-1.4M11.3 4.3l1.4 1.4" opacity=".6"/>',
  staff: '<path d="M6 21L16.5 6.5"/><circle cx="18" cy="4.8" r="2.4"/><path d="M14.5 9l2 1.5M11.5 13l2 1.5" opacity=".55"/>',
  fists: '<path d="M6 12.5V9a1.6 1.6 0 013.2 0v2.5m0-3a1.6 1.6 0 013.2 0v3m0-2a1.6 1.6 0 013.2 0v3m0-1.5a1.6 1.6 0 013.2 0V16c0 3-2.4 5-5.4 5h-2c-2.8 0-4.6-1.6-5.4-3.6L5 15"/>',
  bag: '<path d="M5 9h14l-1.2 11.5H6.2z"/><path d="M9 9V7a3 3 0 016 0v2"/><path d="M9 13.5h6" opacity=".55"/>',
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
  heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0112 7.5 4.3 4.3 0 0119.5 10c0 5.4-7.5 10-7.5 10z"/><path d="M8 12h2l1.2-2.5 1.6 5 1.2-2.5h2" opacity=".65"/>',
  quake: '<path d="M9 3v6l-2 2h6"/><path d="M2.5 15.5l3-2 2.5 3 3-3.5 2.5 3 3-2.5 3 2"/><path d="M4 20h16" opacity=".55"/>',
  fan: '<path d="M4 20L12 4M4 20l12-11M4 20l15-4.5M4 20l4-15.5M4 20L20 20" opacity=".9"/><path d="M11 6l1-2 1 2.2M15 9.8l1-.8.6 1.4" opacity=".55"/>',
  star: '<path d="M15 3l1.5 3.2 3.5.5-2.5 2.4.6 3.5-3.1-1.6-3.1 1.6.6-3.5-2.5-2.4 3.5-.5z"/><path d="M10 12l-6 6M7.5 10.5L3 15M12 15l-4.5 4.5" opacity=".55"/>',
  drop: '<path d="M12 3c3 4 5 6.7 5 9.3a5 5 0 01-10 0C7 9.7 9 7 12 3z"/><path d="M3 20c2 0 2-1.3 4.5-1.3S10 20 12 20s2.5-1.3 4.5-1.3S19 20 21 20" opacity=".6"/>',
  whip: '<path d="M4 20l3-3"/><path d="M7 17c2-6 8-3 9-8s-3-6-6-4"/><path d="M10 5l-1.5-1.2M10 5l-.4 1.8" opacity=".6"/>',
  shield: '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z"/><path d="M12 7v10M8 10.5h8" opacity=".55"/>',
  spikes: '<path d="M3 20h18"/><path d="M5 20l2-9 2 9M10 20l2-14 2 14M15 20l2-8 2 8"/>',
  kneel: '<circle cx="12" cy="5" r="2.2"/><path d="M12 7.5v6l-4 2v4.5M12 13.5h4.5V20"/><path d="M5 10l3-1.5M19 10l-3-1.5" opacity=".55"/>',
  well: '<circle cx="12" cy="12" r="1.6" fill="currentColor"/><path d="M12 4a8 8 0 017.6 10.4M20 12a8 8 0 01-10.4 7.6M12 20a8 8 0 01-7.6-10.4M4 12a8 8 0 0110.4-7.6"/><path d="M12 8a4 4 0 014 4M16 12a4 4 0 01-4 4M12 16a4 4 0 01-4-4M8 12a4 4 0 014-4" opacity=".55"/>',
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
