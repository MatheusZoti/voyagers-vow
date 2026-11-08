import { describe, expect, it } from 'vitest';
import { createCharacter } from '../src/sim/character';
import { emptyInput, REGION, Simulation } from '../src/sim/sim';

describe('Névoa de guerra', () => {
  it('começa explorando só em volta do santuário e salva o que foi visto', () => {
    const c = createCharacter('Teste', 'vigor', 3);
    const sim = new Simulation(c, 5);
    expect(sim.isExplored(sim.map.playerStart.x, sim.map.playerStart.y)).toBe(true);
    expect(sim.isExplored(sim.map.arena.x, sim.map.arena.y)).toBe(false);
    sim.player.pos = { ...sim.map.arena };
    sim.step(emptyInput());
    expect(sim.isExplored(sim.map.arena.x, sim.map.arena.y)).toBe(true);
    // Persistência: um novo Simulation com o mesmo personagem lembra.
    expect(c.explored[REGION]).toBeTruthy();
    const again = new Simulation(c, 5);
    expect(again.isExplored(sim.map.arena.x, sim.map.arena.y)).toBe(true);
  });

  it('o Olhar enxerga mais longe', () => {
    const sim = new Simulation(createCharacter('Teste', 'vigor', 3), 5);
    const far = { x: sim.player.pos.x + 12, y: sim.player.pos.y };
    expect(sim.isVisible(far)).toBe(false);
    sim.step({ ...emptyInput(), posture: 'gaze' });
    expect(sim.isVisible(far)).toBe(true);
  });
});
