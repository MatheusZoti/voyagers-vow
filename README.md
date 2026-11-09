# Voyager's Vow

ARPG isométrico em 3D (estilo Albion) em que o personagem cresce por três sistemas em ciclo:

- **Fluxo** — a energia vital: posturas (Silêncio, Olhar), a **Maré** em 5 degraus entre defesa (Véu) e ataque (Ímpeto), **magias** e **Pactos**.
- **Psique** — traços, valores, emoções, memórias e estresse. Nasce das conversas com NPCs e das ações no jogo, e modula o Fluxo em combate.
- **Maestria** — cada magia e postura sobe com prática real e perde afiação quando fica parada (relógio em tempo jogado).

## Afinidades e magias

O jogador escolhe a afinidade inicial entre cinco, num pentágono (Singular fica fora do padrão):

```
          Vigor
 Projeção        Mutação
   Domínio ── Forja
```

As magias são fixas, feitas por nós: cada uma tem uma afinidade e um papel (golpe, reforço, projétil…). Elas caem de criaturas e de livros. Para equipar uma magia, o Elo precisa ser no mínimo **1 + a distância no pentágono**. Exemplo: um personagem de Vigor usa magias de Vigor no Elo 1, de Mutação ou Projeção no Elo 2 e de Forja ou Domínio no Elo 3. Equipada no mínimo, a magia funciona como nível 1. **Restrições** elevam o nível efetivo (+1 por nível) até a faixa Além-limite (9–12).

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
| Golpe básico | Botão esquerdo · Espaço |
| Magias nos Elos 1–8 | 1 · 2 · 3 · 4 · Q · E · R · F (botão direito = Elo 1) |
| Conversar | Clique no NPC |
| Posturas (toque de novo para sair) | Shift Silêncio · Tab Olhar |
| Maré: «« « • » »» (±15% por degrau, −1% de Fluxo/s por degrau) | Roda do mouse (ou Z / X) |
| Psique · Atributos · Grade de Elos · Grimório · Maestria · Mapa | C · I · K · G · M · N |
| Ajuda · Pausa (volume) | H · Esc |
| Painel de playtest | ` (crase) ou F2 |

## Balanceamento

`npm test` roda um bot que joga cenários fixos (Carniçais, matilha, Bruto, Guardião) com as cinco afinidades e imprime tempo de luta e vida perdida. Por enquanto o Guardião no nível 4 é difícil de propósito (o balanceamento virá com equipamentos, níveis e atributos); o teste falha se usar a Maré deixar de fazer diferença clara contra ele. Para ver a tabela:

```bash
npx vitest run tests/balance.test.ts --silent=false
```

No jogo, o painel de playtest ajusta multiplicadores globais ao vivo (`src/sim/tuning.ts`). "Copiar valores" gera o JSON para trazer de volta ao código.

## Estrutura

```
src/sim/          regras puras, sem DOM — prontas para rodar num servidor autoritativo
  psyche/         traços, diálogos com NPCs, emoções, estresse/Crises, memórias
  flow/           afinidades (pentágono), posturas, Maré, modificadores emocionais
  techniques.ts   catálogo de magias
  mastery.ts      Maestria e Afiação (uso e desuso)
  elos.ts         Grade de Elos, Pactos, pontos de forja, regra de equipar
  world/          mapa, NPCs, livros, inimigos
  sim.ts          Simulation: step(dt, input) -> estado + eventos
src/client/       render 3D (Three.js), input, HUD, diálogos, janelas
tests/            testes das regras (Vitest)
```

O cliente nunca muda o estado do jogo diretamente: ele envia `PlayerInput` para a `Simulation` e desenha o que ela devolve. É a mesma fronteira que o servidor vai ocupar quando o jogo ficar online.

Veja [docs/ROADMAP.md](docs/ROADMAP.md).
