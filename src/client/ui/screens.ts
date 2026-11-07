import { AFFINITY_COLORS, AFFINITY_DESC, AFFINITY_NAMES, AFFINITY_PLAYSTYLE, AFFINITY_RING, minSlotFor, type Affinity } from '../../sim/flow/affinity';
import { SPELLS, STARTER_SPELLS } from '../../sim/techniques';
import { escapeHtml } from '../util';
import { icon } from './icons';

/** Telas fora do jogo: título e criação do personagem. */

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
      <p class="foot">Fatia vertical · v0.2</p>
    </div>`;
  root.querySelector('[data-a="continue"]')?.addEventListener('click', opts.onContinue);
  root.querySelector('[data-a="new"]')?.addEventListener('click', opts.onNew);
}

/** Pentágono das afinidades, clicável. Cada nó mostra o Elo mínimo a partir da escolhida. */
function pentagon(selected: Affinity): string {
  const S = 340;
  const cx = S / 2;
  const cy = S / 2 + 6;
  const R = 118;
  const pos = (i: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    return [cx + Math.cos(a) * R, cy + Math.sin(a) * R] as const;
  };
  const pts = AFFINITY_RING.map((_, i) => pos(i));
  const edges = pts.map((p, i) => {
    const q = pts[(i + 1) % 5]!;
    return `<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" class="pg-edge"/>`;
  });
  const nodes = AFFINITY_RING.map((a, i) => {
    const [x, y] = pts[i]!;
    const d = minSlotFor(selected, a);
    const sel = a === selected;
    const tag = sel ? 'sua' : `Elo ${d}+`;
    return `<g class="pg-node ${sel ? 'sel' : ''}" data-aff="${a}" style="--c:${AFFINITY_COLORS[a]}" tabindex="0" role="button" aria-label="${AFFINITY_NAMES[a]}">
      <circle cx="${x}" cy="${y}" r="${sel ? 34 : 28}" class="pg-halo"/>
      <circle cx="${x}" cy="${y}" r="${sel ? 24 : 20}" class="pg-dot"/>
      <text x="${x}" y="${y + (y < cy ? -44 : 50)}" text-anchor="middle" class="pg-name">${AFFINITY_NAMES[a]}</text>
      <text x="${x}" y="${y + 4}" text-anchor="middle" class="pg-tag">${tag}</text>
    </g>`;
  });
  return `<svg class="pentagon" viewBox="0 0 ${S} ${S + 20}">${edges.join('')}${nodes.join('')}</svg>`;
}

/**
 * Criação: o jogador escolhe nome e estilo de poder inicial. Sem questionário —
 * a personalidade nasce das conversas e ações dentro do jogo.
 */
export function creationScreen(root: HTMLElement, onDone: (name: string, affinity: Affinity) => void): void {
  root.className = 'screen create';
  let selected: Affinity = 'vigor';
  let name = '';

  const go = () => onDone(name.trim() || 'Viajante', selected);
  const render = () => {
    const color = AFFINITY_COLORS[selected];
    const spells = STARTER_SPELLS[selected].map((id) => SPELLS[id]);
    const far = AFFINITY_RING.filter((a) => minSlotFor(selected, a) === 3).map((a) => AFFINITY_NAMES[a]);
    const near = AFFINITY_RING.filter((a) => minSlotFor(selected, a) === 2).map((a) => AFFINITY_NAMES[a]);
    root.innerHTML = `
      <div class="create-wrap" style="--aff:${color}">
        <div class="create-left">
          <p class="eyebrow">Novo personagem</p>
          <h2>Escolha seu estilo de poder</h2>
          <p class="sub">Sua afinidade decide quais magias você usa melhor. Magias de outras afinidades também funcionam, mas exigem Elos mais altos.</p>
          ${pentagon(selected)}
        </div>
        <div class="create-right">
          <div class="aff-card">
            <span class="aff-eyebrow">Afinidade</span>
            <h3>${AFFINITY_NAMES[selected]}</h3>
            <p class="aff-desc">${AFFINITY_DESC[selected]}</p>
            <p class="aff-style">${AFFINITY_PLAYSTYLE[selected]}</p>
            <h5>Magias iniciais</h5>
            <div class="starter">${spells
              .map(
                (s) =>
                  `<div class="sp"><span class="sp-ic">${icon(s.icon, 26)}</span><div><b>${s.name}</b><span class="sp-role">${s.role}</span><p>${s.desc}</p></div></div>`,
              )
              .join('')}</div>
            <h5>Outras afinidades</h5>
            <div class="reach">
              <span><i class="r1"></i>Vizinhas (${near.join(', ')}): a partir do Elo 2</span>
              <span><i class="r2"></i>Distantes (${far.join(', ')}): a partir do Elo 3</span>
            </div>
          </div>
          <label class="name-field"><span>Nome</span><input class="name" maxlength="18" placeholder="Seu nome" value="${escapeHtml(name)}"/></label>
          <button class="btn primary big" data-a="go">Entrar no Vale da Ponte</button>
          <p class="fine">Sua personalidade não é escolhida aqui: ela nasce do que você diz às pessoas do vale e do que faz em combate.</p>
        </div>
      </div>`;
    const input = root.querySelector<HTMLInputElement>('input.name')!;
    input.addEventListener('input', () => (name = input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') go();
    });
    root.querySelectorAll<SVGGElement>('.pg-node').forEach((n) =>
      n.addEventListener('click', () => {
        selected = n.dataset.aff as Affinity;
        render();
      }),
    );
    root.querySelector('[data-a="go"]')!.addEventListener('click', go);
  };
  render();
}
