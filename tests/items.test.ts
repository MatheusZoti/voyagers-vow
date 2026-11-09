import { describe, expect, it } from 'vitest';
import { createCharacter } from '../src/sim/character';
import { AFFINITY_RING } from '../src/sim/flow/affinity';
import { AFFIXES, BAG_SIZE, ITEMS, itemMinLevel, itemStats, lootPool, rollItem, rollQuality, SLOTS } from '../src/sim/items';
import { Rng } from '../src/sim/math';
import { emptyInput, Simulation, TICK } from '../src/sim/sim';
import { computeStats } from '../src/sim/stats';

const fresh = (level = 1) => {
  const c = createCharacter('Teste', 'vigor', 3);
  c.level = level;
  return c;
};
const give = (c: ReturnType<typeof fresh>, def: string, quality = 1) => {
  const it = rollItem(new Rng(c.nextItemUid), def, c.nextItemUid++, quality);
  it.affixes = [];
  c.bag.push(it);
  return it;
};

describe('Catálogo de itens', () => {
  it('cada espaço tem item nos tiers 1 e 2', () => {
    for (const tier of [1, 2]) for (const slot of SLOTS) expect(Object.values(ITEMS).some((d) => d.tier === tier && d.slot === slot), `${slot} T${tier}`).toBe(true);
  });

  it('qualidade traz afixos (Comum 0, Bom/Excelente 1, Primoroso/Obra-prima 2), só dos que cabem no espaço', () => {
    const rng = new Rng(9);
    for (const id of Object.keys(ITEMS))
      for (let q = 1; q <= 5; q++) {
        const it = rollItem(rng, id, 1, q);
        expect(it.affixes.length).toBe([0, 1, 1, 2, 2][q - 1]);
        for (const a of it.affixes) expect(AFFIXES[a.id].slots).toContain(ITEMS[id]!.slot);
        expect(new Set(it.affixes.map((a) => a.id)).size).toBe(it.affixes.length);
      }
  });

  it('o Foco sorteia uma afinidade; os outros não têm', () => {
    const rng = new Rng(4);
    expect(AFFINITY_RING).toContain(rollItem(rng, 'stoneAmulet', 1).affinity);
    expect(rollItem(rng, 'padded', 2).affinity).toBeUndefined();
  });

  it('qualidade maior multiplica a base; o peso da armadura não', () => {
    const rng = new Rng(1);
    const common = itemStats({ ...rollItem(rng, 'scaleMail', 1, 1), affixes: [] });
    const master = itemStats({ ...rollItem(rng, 'scaleMail', 2, 5), affixes: [] });
    expect(master.guard!).toBeCloseTo(common.guard! * 1.5);
    expect(master.speed).toBe(common.speed);
  });

  it('chefes tiram qualidade melhor', () => {
    const rng = new Rng(2);
    const avg = (luck: number) => Array.from({ length: 2000 }, () => rollQuality(rng, luck)).reduce((a, b) => a + b, 0) / 2000;
    expect(avg(1.5)).toBeGreaterThan(avg(0) + 0.8);
  });

  it('cada região sorteia itens do próprio tier (e do maior abaixo, se faltar)', () => {
    expect(lootPool(1).every((id) => ITEMS[id]!.tier === 1)).toBe(true);
    expect(lootPool(2).every((id) => ITEMS[id]!.tier === 2)).toBe(true);
    expect(lootPool(5).every((id) => ITEMS[id]!.tier === 2)).toBe(true);
  });
});

describe('Equipar', () => {
  it('vestir soma à ficha; trocar devolve o antigo à mochila', () => {
    const c = fresh();
    const sim = new Simulation(c, 5);
    const knife = give(c, 'huntKnife');
    const club = give(c, 'knotClub');
    expect(sim.equipItem(knife.uid)).toBeNull();
    expect(sim.stats().power).toBeCloseTo(1.1);
    expect(sim.stats().weapon).toBe('blade');
    expect(sim.equipItem(club.uid)).toBeNull();
    expect(c.equipment.weapon).toBe(club);
    expect(c.bag).toContain(knife);
    expect(sim.stats().weapon).toBe('mace');
  });

  it('o tier pede nível mínimo', () => {
    const c = fresh(1);
    const sim = new Simulation(c, 5);
    const helm = give(c, 'bronzeHelm');
    expect(itemMinLevel(ITEMS.bronzeHelm!)).toBe(5);
    expect(sim.equipItem(helm.uid)).toMatch(/nível 5/);
    c.level = 5;
    expect(sim.equipItem(helm.uid)).toBeNull();
  });

  it('não se troca equipamento em combate (fora do santuário)', () => {
    const c = fresh();
    const sim = new Simulation(c, 5);
    const pad = give(c, 'padded');
    sim.player.pos = { x: sim.map.sanctuary.x + sim.map.sanctuary.r + 6, y: sim.map.sanctuary.y };
    sim.player.lastCombatAt = sim.time;
    expect(sim.equipItem(pad.uid)).toMatch(/combate/);
    sim.player.lastCombatAt = sim.time - 10;
    expect(sim.equipItem(pad.uid)).toBeNull();
    expect(computeStats(c).guard).toBeCloseTo(0.08);
  });

  it('tirar a armadura não mata e vestir não cura: a vida acompanha na mesma proporção', () => {
    const c = fresh();
    const sim = new Simulation(c, 5);
    const hood = give(c, 'leatherHood');
    sim.player.hp = 50;
    sim.equipItem(hood.uid);
    expect(sim.player.hp).toBe(Math.round(0.5 * sim.maxHp()));
    expect(sim.unequip('head')).toBeNull();
    expect(sim.player.hp).toBe(50);
  });

  it('a arma muda o golpe básico: a maça é mais lenta, a lâmina mais rápida', () => {
    const cd = (def: string | null) => {
      const c = fresh();
      const sim = new Simulation(c, 5);
      if (def) sim.equipItem(give(c, def).uid);
      sim.step({ ...emptyInput(), basic: true });
      return sim.player.basicCd + TICK;
    };
    expect(cd('knotClub')).toBeGreaterThan(cd(null) * 1.3);
    expect(cd('huntKnife')).toBeLessThan(cd(null));
  });

  it('o Foco barateia as magias da afinidade dele', () => {
    const c = fresh();
    const sim = new Simulation(c, 5);
    const slot = c.elos[0]!;
    const info = sim.slotInfo(slot)!;
    const before = sim.slotCost(slot, info);
    const amulet = give(c, 'stoneAmulet');
    amulet.affinity = 'vigor';
    sim.equipItem(amulet.uid);
    expect(sim.slotCost(slot, info)).toBeCloseTo(before * 0.92);
    amulet.affinity = 'forge';
    sim.unequip('focus');
    sim.equipItem(amulet.uid);
    expect(sim.slotCost(slot, info)).toBeCloseTo(before);
  });
});

describe('Drops', () => {
  it('o chefe sempre deixa um item; passar por cima guarda na mochila', () => {
    const c = fresh();
    const sim = new Simulation(c, 5);
    const boss = sim.boss()!;
    (sim as unknown as { dropGear: (e: unknown) => void }).dropGear(boss);
    expect(sim.itemDrops.length).toBe(1);
    const drop = sim.itemDrops[0]!;
    expect(ITEMS[drop.item.def]!.tier).toBe(1);
    sim.player.pos = { ...drop.pos };
    const ev = sim.step(emptyInput());
    expect(ev.some((e) => e.t === 'itemPickup')).toBe(true);
    expect(c.bag.map((i) => i.uid)).toContain(drop.item.uid);
  });

  it('com a mochila cheia, o item fica no chão', () => {
    const c = fresh();
    const sim = new Simulation(c, 5);
    for (let i = 0; i < BAG_SIZE; i++) give(c, 'trailBoots');
    (sim as unknown as { dropGear: (e: unknown) => void }).dropGear(sim.boss()!);
    sim.player.pos = { ...sim.itemDrops[0]!.pos };
    sim.step(emptyInput());
    expect(sim.itemDrops.length).toBe(1);
    expect(c.bag.length).toBe(BAG_SIZE);
  });

  it('saves antigos ganham equipamento e mochila vazios', async () => {
    const { migrateCharacter } = await import('../src/sim/character');
    const c = fresh() as unknown as Record<string, unknown>;
    delete c.equipment;
    delete c.bag;
    delete c.nextItemUid;
    const m = migrateCharacter(JSON.parse(JSON.stringify(c)))!;
    expect(m.equipment).toEqual({});
    expect(m.bag).toEqual([]);
    expect(m.nextItemUid).toBe(1);
  });
});
