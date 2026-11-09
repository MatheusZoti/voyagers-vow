import { describe, expect, it } from 'vitest';
import { createCharacter, migrateCharacter } from '../src/sim/character';
import { BAG_SIZE, rollItem } from '../src/sim/items';
import { Rng } from '../src/sim/math';
import { emptyInput, Simulation, TICK } from '../src/sim/sim';

const give = (c: ReturnType<typeof createCharacter>, def: string) => {
  const it = rollItem(new Rng(c.nextItemUid), def, c.nextItemUid++, 1);
  c.bag.push(it);
  return it;
};

/** Personagem com uma faca vestida e botas na mochila, fora do santuário. */
function setup(allFall = true) {
  const c = createCharacter('Teste', 'vigor', 3);
  c.xp = 80;
  const sim = new Simulation(c, 5);
  const knife = give(c, 'huntKnife');
  expect(sim.equipItem(knife.uid)).toBeNull();
  const boots = give(c, 'trailBoots');
  // Força a sorte: todo equipamento cai (ou nenhum).
  (sim as unknown as { rng: { chance: (p: number) => boolean } }).rng.chance = () => allFall;
  sim.player.pos = { x: sim.map.sanctuary.x + sim.map.sanctuary.r + 6, y: sim.map.sanctuary.y };
  return { c, sim, knife, boots };
}
const die = (sim: Simulation) => sim.damagePlayer(99999, { heavy: false });
const respawn = (sim: Simulation) => {
  for (let i = 0; i < 4 / TICK && sim.player.dead; i++) sim.step(emptyInput());
};

describe('Eco: itens ao morrer', () => {
  it('equipamento que cai vai para o Eco, e passar por ele devolve tudo (vestido volta ao corpo)', () => {
    const { c, sim, knife, boots } = setup();
    const deathPos = { ...sim.player.pos };
    die(sim);
    expect(c.equipment.weapon).toBeUndefined();
    expect(c.bag).toHaveLength(0);
    expect(c.echo!.items.map((x) => x.item.uid).sort()).toEqual([knife.uid, boots.uid].sort());
    expect(c.echo!.region).toBe('vale');
    respawn(sim);
    const xpBefore = c.xp;
    sim.player.pos = { ...deathPos };
    const ev = sim.step(emptyInput());
    expect(ev.some((e) => e.t === 'echoRecovered')).toBe(true);
    expect(c.equipment.weapon).toBe(knife);
    expect(c.bag).toContain(boots);
    expect(c.xp).toBeGreaterThan(xpBefore);
    expect(c.echo).toBeNull();
  });

  it('com sorte, nada cai (o Eco guarda só o XP)', () => {
    const { c, sim, knife } = setup(false);
    die(sim);
    expect(c.equipment.weapon).toBe(knife);
    expect(c.echo!.items).toHaveLength(0);
  });

  it('o Eco é salvo no personagem: sobrevive a sair do jogo e só aparece na região onde ficou', () => {
    const { c, sim } = setup();
    die(sim);
    const saved = migrateCharacter(JSON.parse(JSON.stringify(c)))!;
    expect(saved.echo!.items).toHaveLength(2);
    expect(new Simulation(saved, 5).echo).not.toBeNull();
    saved.region = 'varn';
    const there = new Simulation(saved, 5);
    expect(there.echo).toBeNull();
    expect(saved.echo).not.toBeNull();
  });

  it('se o Eco se dissipa (30 min de jogo), os itens se perdem — mesmo estando em outra região', () => {
    const { c, sim } = setup();
    die(sim);
    respawn(sim);
    c.region = 'varn';
    const there = new Simulation(c, 5);
    c.echo!.expiresAt = c.playTime - 1;
    there.step(emptyInput());
    expect(c.echo).toBeNull();
    expect(c.bag).toHaveLength(0);
    expect(c.equipment.weapon).toBeUndefined();
  });

  it('cair de novo antes de recuperar desfaz o Eco anterior (com o que ele tinha)', () => {
    const { c, sim, knife } = setup();
    die(sim);
    respawn(sim);
    sim.player.pos = { x: sim.map.sanctuary.x + sim.map.sanctuary.r + 8, y: sim.map.sanctuary.y + 2 };
    die(sim);
    expect(c.echo!.items.some((x) => x.item.uid === knife.uid)).toBe(false);
  });

  it('mochila cheia: o que não cabe continua esperando no Eco', () => {
    const { c, sim } = setup();
    const deathPos = { ...sim.player.pos };
    die(sim);
    respawn(sim);
    for (let i = 0; i < BAG_SIZE; i++) give(c, 'padded');
    sim.player.pos = { ...deathPos };
    sim.step(emptyInput());
    // A faca volta ao corpo (espaço livre); as botas não cabem na mochila.
    expect(c.equipment.weapon).toBeDefined();
    expect(c.echo!.items).toHaveLength(1);
    expect(c.echo!.xpBack).toBe(0);
  });
});
