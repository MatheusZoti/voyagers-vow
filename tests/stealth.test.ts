import { describe, expect, it } from 'vitest';
import { createCharacter } from '../src/sim/character';
import { emptyInput, Simulation, TICK } from '../src/sim/sim';

function setup() {
  const sim = new Simulation(createCharacter('Teste', 'vigor', 3), 5);
  const g = sim.enemies.find((e) => e.kind === 'grunt')!;
  return { sim, g };
}
const still = () => ({ ...emptyInput(), posture: 'silence' as const });

describe('Silêncio', () => {
  it('quem já te viu continua te atacando depois que você entra em Silêncio', () => {
    const { sim, g } = setup();
    sim.player.pos = { x: g.pos.x - 2, y: g.pos.y };
    for (let i = 0; i < 10; i++) sim.step(emptyInput());
    expect(g.aggro).toBe(true);
    for (let i = 0; i < 3 / TICK; i++) sim.step(still());
    expect(g.aggro).toBe(true);
    expect(g.state).not.toBe('return');
  });

  it('esconde de quem ainda não te viu, dentro do raio normal mas fora do raio em Silêncio', () => {
    const { sim, g } = setup();
    const r = sim.stealthRadius(g);
    expect(r).toBeLessThan(g.def.aggroRadius);
    sim.player.pos = { x: g.pos.x - (r + 1), y: g.pos.y };
    sim.step(still());
    for (let i = 0; i < 20; i++) sim.step(still());
    expect(g.aggro).toBe(false);
  });

  it('o raio de percepção encolhe com a Maestria do Silêncio', () => {
    const { sim, g } = setup();
    const r1 = sim.stealthRadius(g);
    sim.c.mastery.silence.level = 15;
    expect(sim.stealthRadius(g)).toBeLessThan(r1 * 0.6);
  });

  it('passar despercebido perto de inimigos treina o Silêncio', () => {
    const { sim, g } = setup();
    const before = sim.c.mastery.silence.level;
    sim.player.pos = { x: g.pos.x - (sim.stealthRadius(g) + 1), y: g.pos.y };
    for (let i = 0; i < 3 / TICK; i++) sim.step(still());
    expect(g.aggro).toBe(false);
    expect(sim.c.mastery.silence.level).toBeGreaterThan(before);
  });
});
