import { describe, expect, it } from 'vitest';
import { createCharacter } from '../src/sim/character';
import { emptyInput, Simulation, TICK } from '../src/sim/sim';
import { buildMap, isBlocked } from '../src/sim/world/map';

const answers = [0, 1, 2, 0, 1, 2, 0, 1, 2, 0];
const newSim = () => new Simulation(createCharacter('Teste', answers, 3), 5);

describe('Mapa', () => {
  it('início, ponte e arena são caminháveis', () => {
    const m = buildMap();
    expect(isBlocked(m, m.playerStart.x, m.playerStart.y)).toBe(false);
    expect(isBlocked(m, m.bridge.x0 + 1, (m.bridge.y0 + m.bridge.y1) / 2)).toBe(false);
    expect(isBlocked(m, m.arena.x, m.arena.y)).toBe(false);
  });
});

describe('Simulação', () => {
  it('roda um minuto parado no santuário sem tomar dano', () => {
    const sim = newSim();
    const hp = sim.player.hp;
    for (let i = 0; i < 60 / TICK; i++) sim.step(emptyInput());
    expect(sim.player.hp).toBe(hp);
    expect(sim.player.dead).toBe(false);
  });

  it('golpe básico mata um Carniçal e dá XP', () => {
    const sim = newSim();
    const grunt = sim.enemies.find((e) => e.kind === 'grunt')!;
    sim.player.pos = { x: grunt.pos.x - 1, y: grunt.pos.y };
    let killed = false;
    for (let i = 0; i < 400 && !killed; i++) {
      const input = emptyInput();
      input.aim = { ...grunt.pos };
      input.basic = true;
      const ev = sim.step(input);
      killed = ev.some((e) => e.t === 'enemyDeath' && e.id === grunt.id);
    }
    expect(killed).toBe(true);
    expect(sim.c.xp).toBeGreaterThan(0);
  });

  it('Maré deslocada para defesa no instante do golpe pesado gera Maré perfeita', () => {
    const sim = newSim();
    sim.player.pos = { ...sim.map.arena };
    sim.player.tide.value = 0.2;
    sim.player.tide.target = 0.2;
    sim.player.tide.lastDefenseShiftAt = sim.time;
    const before = sim.player.hp;
    sim.damagePlayer(46, { heavy: true });
    const lostPerfect = before - sim.player.hp;
    expect(sim.events.some((e) => e.t === 'perfectTide')).toBe(true);

    const sim2 = newSim();
    sim2.player.pos = { ...sim2.map.arena };
    const before2 = sim2.player.hp;
    sim2.damagePlayer(46, { heavy: true });
    expect(lostPerfect).toBeLessThan((before2 - sim2.player.hp) / 2);
  });

  it('morte aplica penalidade, deixa um Eco e renasce no santuário', () => {
    const sim = newSim();
    sim.c.xp = 50;
    sim.player.pos = { x: 30, y: 24 };
    sim.damagePlayer(9999, { heavy: false });
    expect(sim.player.dead).toBe(true);
    expect(sim.echo).not.toBeNull();
    expect(sim.c.xp).toBeLessThan(50);
    for (let i = 0; i < 4 / TICK; i++) sim.step(emptyInput());
    expect(sim.player.dead).toBe(false);
    expect(sim.inSanctuary()).toBe(true);
  });

  it('Assinatura gasta Fluxo e entra em recarga', () => {
    const sim = newSim();
    const flow = sim.player.flow;
    const input = emptyInput();
    input.aim = { x: sim.player.pos.x + 3, y: sim.player.pos.y };
    input.useSlot = 2;
    sim.step(input);
    expect(sim.player.flow).toBeLessThan(flow);
    expect(sim.player.slotCd[2]).toBeGreaterThan(0);
  });

  it('fugir do chefe com o juramento sela o Elo', () => {
    const sim = newSim();
    sim.c.elos[1]!.restrictions = ['neverFlee'];
    sim.player.pos = { ...sim.map.arena };
    sim.step(emptyInput());
    expect(sim.player.bossEngaged).toBe(true);
    sim.player.pos = { ...sim.map.playerStart };
    sim.step(emptyInput());
    expect(sim.c.elos[1]!.sealed).toBe(true);
    expect(sim.c.psyche.emotions.shame).toBeDefined();
  });
});
