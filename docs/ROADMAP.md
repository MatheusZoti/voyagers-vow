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

## Próximo

- Loot de equipamentos (armas e armaduras) e chance de perdê-los ao morrer

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
