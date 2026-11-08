export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

/** "?" com balão explicativo no hover/foco (o posicionamento perto das bordas fica com a janela). */
export const hintTip = (text: string) =>
  `<span class="hint-i" tabindex="0" role="note" aria-label="${escapeHtml(text)}">?<span class="tip">${escapeHtml(text)}</span></span>`;
