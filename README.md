# Voyager's Vow

ARPG isométrico em que o personagem cresce por três sistemas em ciclo:

- **Fluxo** — a energia vital: posturas (Véu, Silêncio, Ímpeto, Olhar), a **Maré** entre ataque e defesa, a **Assinatura** e os **Pactos**.
- **Psique** — traços, valores, emoções, memórias e estresse. Decide a afinidade e modula o Fluxo em combate.
- **Maestria** — cada técnica sobe com prática real e perde afiação quando fica parada (relógio em tempo jogado).

A **Grade de Elos** organiza as técnicas: 8 Elos (níveis 1–8); Restrições elevam o nível efetivo até a faixa Além-limite (9–12).

> Princípio central: o poder não vem só do loot. Quem o personagem é decide o que ele faz bem, e o que ele faz muda quem ele é.

## Rodando

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # testes das regras
npm run build
```

## Controles

| Ação | Tecla |
| --- | --- |
| Mover | WASD |
| Mirar | Mouse |
| Golpe básico | Botão esquerdo |
| Assinatura / Ponto | Botão direito ou Q / E |
| Posturas | 1 Véu · 2 Silêncio · 3 Ímpeto · 4 Olhar |
| Maré (ataque ↔ defesa) | Roda do mouse (ou Z / X) |
| Ficha da Psique | C |
| Grade de Elos (no santuário) | K |
| Maestria | M |
| Pausa | Esc |

## Estrutura

```
src/sim/      regras puras, sem DOM — prontas para rodar num servidor autoritativo
  psyche/     traços, Rito, emoções, estresse/Crises, memórias
  flow/       afinidades (hexágono), posturas, Maré, modificadores emocionais
  mastery.ts  Maestria e Afiação (uso e desuso)
  elos.ts     Grade de Elos, Pactos, pontos de forja
  world/      mapa, inimigos, combate
  sim.ts      Simulation: step(dt, input) -> estado + eventos
src/client/   render 3D (Three.js, estilo Albion), input, HUD, telas
tests/        testes das regras (Vitest)
```

O cliente nunca muda o estado do jogo diretamente: ele envia `PlayerInput` para a `Simulation` e desenha o que ela devolve. É a mesma fronteira que o servidor vai ocupar quando o jogo ficar online.

## Fatia vertical (estado atual)

Segue os "Próximos passos" do GDD: afinidade Vigor jogável, 4 posturas, Maré, emoções com efeito em combate, uma Crise por perfil de traços, 1 chefe. Veja [docs/ROADMAP.md](docs/ROADMAP.md).
