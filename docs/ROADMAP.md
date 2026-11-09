# Roadmap

Fonte de verdade do design: o GDD "Sistema de Aura, Psique e Maestria" (documento interno), com as decisões abaixo por cima dele.

## Decisões que mudam o GDD

- **Sem questionário na criação.** O jogador escolhe nome e afinidade inicial. A personalidade nasce das conversas com NPCs (os dilemas do GDD viraram diálogos) e das ações em jogo.
- **Cinco afinidades em pentágono.** Vigor, Mutação, Forja, Domínio e Projeção. Singular existe no mundo, mas fica fora do padrão: é uma exceção a decidir.
- **Magias determinísticas no lugar da fábrica de Assinatura.** Cada magia tem uma afinidade (o tipo principal) e um papel, e cai de criaturas e livros.
- **Regra de equipar:** Elo mínimo = nível mínimo da magia + distância no pentágono. A magia nunca fica com nível negativo.

## Fatia vertical — v0.2

- [x] Emoções filtradas por traços, estresse, Crises (Frenesi, Pânico, Apatia) com aviso de 3 s
- [x] Memória curta (8) e longa; traços mudam por diálogo, por ação e por memórias marcantes
- [x] Posturas, Maré, modificadores emocionais do Fluxo
- [x] Maestria e Afiação: risco, retorno decrescente, reaprendizado 3x, carência em tempo jogado, piso de 50%
- [x] Grade de Elos: nível efetivo, Além-limite, Pactos aplicáveis por magia, alinhamento com valores
- [x] Criação por escolha de afinidade (pentágono) com 2 magias iniciais
- [x] 10 magias (2 por afinidade): golpe, reforço, projétil, área, puxão, elétrico, controle, golpe amplo, empurrão, discórdia
- [x] Grimórios caindo de criaturas (o chefe sempre deixa um) e 2 livros antigos no mapa
- [x] 6 NPCs e um evento na ponte com os 10 dilemas do GDD
- [x] Cliente 3D estilo Albion, janela do personagem (Psique, Elos, Maestria), HUD com ícones
- [x] Chefe com golpe pesado telegrafado; morte com penalidade por níveis e Eco
- [x] Salvamento local com migração de saves antigos

## v0.3 — segunda região

- [x] Gerador de regiões genérico (relevo, penhascos, rampas, clareiras) com auditoria automática
- [x] Relevo em andares (estilo Tibia): cada andar plano, paredes de rocha entre andares e rampas de 3 tiles (salientes ou escavadas) por onde jogador e monstros sobem e descem
- [x] Planalto de Varn (tier 2): acampamento, Capitã Lys e o dilema do prisioneiro, floresta de outono
- [x] Viagem entre regiões (passagem abre ao vencer o Guardião), exploração salva por região
- [x] Lançador de Espinhos: mantém distância, avisa com linha no chão, projétil desviável
- [x] Monstros: provocação, alerta à matilha, recuo imune quando inalcançáveis
- [x] Atributos derivados (sem pontos para distribuir): Vida, Fluxo máximo, Regeneração, Poder, Guarda e Velocidade calculados num lugar só (`src/sim/stats.ts`), com aba Atributos (I) mostrando a origem de cada número
- [x] Nível: +12 Vida e +3 Fluxo por nível; faixa de nível recomendada por tier de região (1–5, 5–9, …)
- [x] Equipamentos (estilo Albion, catálogo à mão em `src/sim/items.ts`): 14 modelos em 2 tiers, 5 espaços (Arma muda o Golpe básico e dá o Poder; Cabeça e Peito dão Guarda; Pés, Velocidade; Foco fortalece uma afinidade), qualidade Comum → Obra-prima e afixos da Maré, Véu, Fluxo; drops de criaturas (chefe sempre, e melhor), mochila de 20, sem troca em combate
- [x] Itens na morte: cada equipamento (vestido ou na mochila) tem a chance da penalidade (1/3/6/10%) de cair no Eco; o Eco é salvo no personagem (sobrevive a sair e a viajar) e devolve XP e itens — o que estava vestido volta ao corpo. Se dissipa em 30 min de jogo ou ao cair de novo antes, levando o que guardava
- [x] Ressonância dos itens raros com a Psique: Obra-prima (sempre) e Primoroso (metade) pedem um Valor ligado ao espaço; se o Valor é forte em você o item rende +25%, se você é contra rende −25% e soma estresse em combate. Acompanha os Valores conforme eles mudam

- [x] Psique, Fase 1 (Sinal e voz — doc "Psique no jogo — redesenho"): sussurros quando traços e Valores mudam, marco quando um Valor fica forte (com o que abre), efeito de cada emoção em palavras no HUD e aura no chão, voz interna do personagem nos momentos marcantes, aba "Como você mudou"

## Próximo

- Psique, Fase 2: ações que moldam os Valores (render, poupar, executar, algoz, saquear, defender)
- Psique, Fase 3: as 9 conversas viram situações com consequência e eco
- Psique, Fase 4: falas que notam você, reputação por região, inimigos que reagem


- Sensação de jogo e equilíbrio: painel de debug para ajustar números ao vivo, impacto nos golpes (pausa no acerto, recuo), sons
- Mais magias por afinidade e onde cada uma cai (tabela de drops por região)
- Mais conversas e ações que moldam a personalidade (poupar inimigos, saquear, ajudar outros jogadores)

## Depois da fatia

- Servidor autoritativo (Node + WebSocket) rodando `src/sim`
- Singular como exceção (evento raro)
- Crise de Ruptura e Transe
- Necessidades completas (explorar, criar, socializar)
- Técnicas avançadas (Campo, Sombra, Impregnar, Bastião)
- Itens, chance de drop na morte, Selos de proteção
- PvP por zonas e tiers de mapa; Infâmia
