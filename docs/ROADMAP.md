# Roadmap

Fonte de verdade do design: o GDD "Sistema de Aura, Psique e Maestria" (documento interno).

## Fatia vertical — v0.1

- [x] Regras puras: Rito (10 perguntas, 16 traços, 8 valores), hexágono de afinidades
- [x] Emoções filtradas por traços, estresse, Crises (Frenesi, Pânico, Apatia) com aviso de 3 s
- [x] Memória curta (8) e longa, com deriva lenta de traços
- [x] Posturas, Maré, modificadores emocionais do Fluxo
- [x] Maestria e Afiação: risco, retorno decrescente, reaprendizado 3x, carência em tempo jogado, piso de 50%
- [x] Grade de Elos: nível efetivo, Além-limite, Pactos, alinhamento com valores, penalidade de afinidade
- [x] Cliente 3D (Three.js) estilo Albion: câmera inclinada fixa, terreno low-poly, modelos procedurais
- [x] Arena isométrica jogável: inimigos comuns, elite, espreitador em Sombra, armadilhas ocultas
- [x] Chefe com golpe pesado telegrafado (testa a Maré)
- [x] Morte com penalidade por níveis e Eco do jogador
- [x] HUD: emoção dominante + estresse; ficha, Grade de Elos e Maestria
- [x] Salvar personagem localmente

## Próximo

- Playtest de balanceamento (dano, custos de Fluxo, ritmo do chefe)
- Sons e música
- Modelos e animações melhores (GLTF), mantendo o estilo low-poly

## Depois da fatia

- Servidor autoritativo (Node + WebSocket) rodando `src/sim`
- Editor completo de Assinatura (efeito base, modificadores de loot, etiquetas de natureza)
- Crise de Ruptura e Transe (evolução lendária da Assinatura)
- Necessidades completas (explorar, criar, socializar)
- Demais afinidades e técnicas avançadas (Campo, Sombra, Impregnar, Bastião)
- Loot, itens e chance de drop na morte; Selos de proteção
- PvP por zonas e tiers de mapa; Infâmia
