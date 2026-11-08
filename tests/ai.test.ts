import { describe, expect, it } from 'vitest';
import { createCharacter } from '../src/sim/character';
import { MODS } from '../src/sim/elos';
import { emptyInput, LEASH, Simulation, TICK } from '../src/sim/sim';
import { SPELL_IDS } from '../src/sim/techniques';
import { isBlocked } from '../src/sim/world/map';

function projectionSim() {
  const c = createCharacter('Teste', 'projection', 3);
  c.knownSpells = [...SPELL_IDS];
  const sim = new Simulation(c, 5);
  return sim;
}
const fire = (sim: Simulation, at: { x: number; y: number }, slot = 1) => sim.step({ ...emptyInput(), aim: { ...at }, useSlot: slot });

describe('Inteligência dos monstros', () => {
  it('atingido de longe (fora da percepção), o inimigo vem atrás', () => {
    const sim = projectionSim();
    const g = sim.enemies.find((e) => e.kind === 'grunt')!;
    sim.player.pos = { x: g.pos.x - 9, y: g.pos.y };
    // Garante linha livre para a lança.
    for (let x = Math.floor(g.pos.x - 9); x <= g.pos.x; x++) expect(isBlocked(sim.map, x + 0.5, g.pos.y)).toBe(false);
    const ev = fire(sim, g.pos);
    expect(ev.some((e) => e.t === 'damage' && e.id === g.id && e.amount > 0)).toBe(true);
    const d0 = Math.hypot(g.pos.x - sim.player.pos.x, g.pos.y - sim.player.pos.y);
    for (let i = 0; i < 2 / TICK; i++) sim.step(emptyInput());
    expect(g.state === 'chase' || g.state === 'windup' || g.state === 'recover').toBe(true);
    expect(Math.hypot(g.pos.x - sim.player.pos.x, g.pos.y - sim.player.pos.y)).toBeLessThan(d0 - 3);
  });

  it('a matilha vem junto quando um é atingido', () => {
    const sim = projectionSim();
    const [a, b] = sim.enemies.filter((e) => e.kind === 'grunt');
    b!.pos = { x: a!.pos.x + 2, y: a!.pos.y + 1 };
    b!.home = { ...b!.pos };
    sim.player.pos = { x: a!.pos.x - 8, y: a!.pos.y };
    fire(sim, a!.pos);
    sim.step(emptyInput());
    expect(b!.state).toBe('chase');
  });

  it('puxado para longe demais de casa, recua imune e volta curado', () => {
    const sim = projectionSim();
    const g = sim.enemies.find((e) => e.kind === 'grunt')!;
    g.hp = g.maxHp * 0.5;
    g.aggro = true;
    g.state = 'chase';
    g.provokedUntil = sim.time + 99;
    // Um ponto livre a mais de LEASH de casa.
    let x = g.home.x + LEASH + 1;
    while (isBlocked(sim.map, x, g.home.y) && x < sim.map.w - 2) x += 1;
    g.pos = { x, y: g.home.y };
    sim.player.pos = { x: g.pos.x + 3, y: g.pos.y };
    sim.step(emptyInput());
    expect(g.evading).toBe(true);
    // Imune enquanto recua.
    const ev = fire(sim, g.pos);
    expect(ev.some((e) => e.t === 'damage' && e.id === g.id && e.amount > 0)).toBe(false);
    for (let i = 0; i < 30 / TICK && g.evading; i++) sim.step(emptyInput());
    expect(g.evading).toBe(false);
    expect(g.hp).toBe(g.maxHp);
  });

  it('sem caminho até você (outro lado do desfiladeiro), desiste em vez de virar alvo', () => {
    const sim = projectionSim();
    const g = sim.enemies.find((e) => e.kind === 'grunt')!;
    // Jogador na margem leste, inimigo na oeste, longe da ponte.
    sim.player.pos = { x: 52.5, y: 8.5 };
    g.pos = { x: 41.5, y: 8.5 };
    g.home = { ...g.pos };
    if (isBlocked(sim.map, g.pos.x, g.pos.y) || isBlocked(sim.map, sim.player.pos.x, sim.player.pos.y)) return; // relevo mudou: teste não se aplica
    expect(sim.pathReachable(g.pos, sim.player.pos)).toBe(true); // há caminho, mas é longo (pela ponte)
    g.aggro = true;
    g.state = 'chase';
    g.provokedUntil = sim.time + 99;
    let evaded = false;
    for (let i = 0; i < 30 / TICK && !evaded; i++) {
      sim.step(emptyInput());
      evaded = g.evading;
    }
    // Ou chegou perto pelo caminho, ou desistiu: nunca fica parado levando tiro.
    expect(evaded || Math.hypot(g.pos.x - sim.player.pos.x, g.pos.y - sim.player.pos.y) < 4).toBe(true);
  });
});

describe('Alcance das magias', () => {
  it('ponto de Alcance vale menos e custa mais', () => {
    expect(MODS.range.cost).toBe(2);
  });

  it('nenhuma magia acerta fora do raio de visão, nem com Alcance no máximo', () => {
    const sim = projectionSim();
    const slot = sim.c.elos[2]!;
    slot.unlocked = true;
    slot.technique = 'flowLance';
    slot.restrictions = ['eliteOnly', 'lowFlow'];
    slot.mods = { range: 3 };
    const g = sim.enemies.find((e) => e.kind === 'grunt')!;
    sim.player.pos = { x: g.pos.x - 11.5, y: g.pos.y };
    sim.player.flow = sim.flowMax() * 0.2;
    slot.restrictions = [];
    const ev = fire(sim, g.pos, 3);
    expect(ev.some((e) => e.t === 'damage' && e.id === g.id)).toBe(false);
    const beam = ev.find((e) => e.t === 'beam');
    if (beam && beam.t === 'beam') expect(Math.hypot(beam.to.x - beam.from.x, beam.to.y - beam.from.y)).toBeLessThanOrEqual(sim.visionRadius() + 0.01);
  });
});
