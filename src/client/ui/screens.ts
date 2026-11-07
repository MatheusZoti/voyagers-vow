import { AFFINITY_COLORS, AFFINITY_DESC, AFFINITY_NAMES } from '../../sim/flow/affinity';
import type { Character } from '../../sim/character';
import { RITE_QUESTIONS } from '../../sim/psyche/rite';
import { TRAIT_IDS, traitPhrase, VALUE_IDS, valuePhrase } from '../../sim/psyche/traits';
import { escapeHtml } from '../hud';

/** Telas fora do jogo: título, perguntas do Rito e a revelação no Cálice. */

export function titleScreen(root: HTMLElement, opts: { hasSave: string | null; onContinue: () => void; onNew: () => void }): void {
  root.className = 'screen title';
  root.innerHTML = `
    <div class="title-wrap">
      <div class="crest"></div>
      <h1>Voyager's Vow</h1>
      <p class="tagline">Quem você é decide o que você faz bem.<br/>O que você faz muda quem você é.</p>
      <div class="actions">
        ${opts.hasSave ? `<button class="btn primary" data-a="continue">Continuar como ${escapeHtml(opts.hasSave)}</button>` : ''}
        <button class="btn ${opts.hasSave ? '' : 'primary'}" data-a="new">Novo personagem</button>
      </div>
      <p class="foot">Fatia vertical · v0.1</p>
    </div>`;
  root.querySelector('[data-a="continue"]')?.addEventListener('click', opts.onContinue);
  root.querySelector('[data-a="new"]')?.addEventListener('click', opts.onNew);
}

export function riteScreen(root: HTMLElement, onDone: (name: string, answers: number[]) => void): void {
  root.className = 'screen rite';
  const answers: number[] = [];
  let name = '';

  const askName = () => {
    root.innerHTML = `
      <div class="rite-card">
        <p class="eyebrow">Antes do Rito</p>
        <h2>Como você se chama, viajante?</h2>
        <input class="name" maxlength="18" placeholder="Seu nome" autofocus />
        <button class="btn primary" data-a="go">Começar</button>
      </div>`;
    const input = root.querySelector<HTMLInputElement>('input')!;
    const go = () => {
      name = input.value.trim() || 'Viajante';
      question(0);
    };
    input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
    root.querySelector('[data-a="go"]')!.addEventListener('click', go);
    setTimeout(() => input.focus(), 50);
  };

  const question = (i: number) => {
    const q = RITE_QUESTIONS[i];
    if (!q) return onDone(name, answers);
    root.innerHTML = `
      <div class="rite-card fade-in">
        <p class="eyebrow">${i + 1} de ${RITE_QUESTIONS.length}</p>
        <h2>${q.prompt}</h2>
        <div class="options">
          ${q.options.map((o, k) => `<button class="option" data-k="${k}"><span class="num">${k + 1}</span>${o.text}</button>`).join('')}
        </div>
        <div class="progress"><div style="width:${(i / RITE_QUESTIONS.length) * 100}%"></div></div>
      </div>`;
    const pick = (k: number) => {
      window.removeEventListener('keydown', onKey);
      answers.push(k);
      question(i + 1);
    };
    const onKey = (e: KeyboardEvent) => {
      const k = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
      if (k >= 0) pick(k);
    };
    window.addEventListener('keydown', onKey);
    root.querySelectorAll<HTMLButtonElement>('.option').forEach((b) => b.addEventListener('click', () => pick(+b.dataset.k!)));
  };

  askName();
}

/** Frases mais marcantes da personalidade (as mais extremas primeiro). */
export function personalityLines(c: Character, max = 6): string[] {
  const t = c.psyche.traits;
  const v = c.psyche.values;
  const traits = TRAIT_IDS.map((id) => ({ id, d: Math.abs(t[id] - 50), s: traitPhrase(id, t[id]) }))
    .filter((x) => x.s)
    .sort((a, b) => b.d - a.d)
    .map((x) => x.s!);
  const values = VALUE_IDS.map((id) => ({ d: Math.abs(v[id]), s: valuePhrase(id, v[id]) }))
    .filter((x) => x.s)
    .sort((a, b) => b.d - a.d)
    .map((x) => x.s!);
  return [...traits.slice(0, max - 2), ...values.slice(0, 2)];
}

export function revealScreen(root: HTMLElement, c: Character, onEnter: () => void): void {
  root.className = 'screen reveal';
  const color = AFFINITY_COLORS[c.affinity];
  const lines = personalityLines(c);
  root.innerHTML = `
    <div class="reveal-wrap" style="--aff:${color}">
      <p class="eyebrow">O Rito do Cálice</p>
      <div class="chalice ${c.affinity}">
        <div class="cup"><div class="water"></div><div class="leaf"></div><div class="glow"></div></div>
        <div class="stem"></div><div class="base"></div>
      </div>
      <p class="omen">A água responde ao seu Fluxo…</p>
      <div class="result">
        <h2>Afinidade: <span>${AFFINITY_NAMES[c.affinity]}</span></h2>
        <p class="desc">${AFFINITY_DESC[c.affinity]}</p>
        <ul class="lines">${lines.map((l) => `<li>${escapeHtml(capitalize(l))}</li>`).join('')}</ul>
        ${
          c.affinity !== 'vigor'
            ? `<p class="note">Sua Assinatura de partida, o Punho do Voto, é de Vigor. Fora da sua afinidade ela entra nos Elos com penalidade de nível.</p>`
            : `<p class="note">O Punho do Voto, sua Assinatura de partida, ressoa com a sua natureza.</p>`
        }
        <button class="btn primary" data-a="enter">Entrar no Vale da Ponte</button>
      </div>
    </div>`;
  root.querySelector('[data-a="enter"]')!.addEventListener('click', onEnter);
}

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
