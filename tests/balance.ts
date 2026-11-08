import { createCharacter, maxHpFor, refreshEloUnlocks } from '../src/sim/character';
import { AFFINITY_RING, type Affinity } from '../src/sim/flow/affinity';
import { dist, normalize } from '../src/sim/math';
import { tideLevel } from '../src/sim/flow/flow';
import { emptyInput, Simulation, TICK, type PlayerInput } from '../src/sim/sim';
import { SPELLS, type SpellId } from '../src/sim/techniques';
import type { Enemy, EnemyKind } from '../src/sim/world/entities';

/**
 * Bot de balanceamento: joga cenários fixos e mede tempo de luta e dano recebido.
 * skill 0 = só bate e usa magias; skill 1 = também usa a Maré e desvia dos golpes pesados.
 */

const MELEE_SPELLS: SpellId[] = ['votePunch', 'conjuredBlade', 'repel'];

function botInput(sim: Simulation, ids: Set<number>, skill: number): PlayerInput {
  const p = sim.player;
  const input = emptyInput();
  const foes = sim.enemies.filter((e) => ids.has(e.id) && e.state !== 'dead');
  const extra = sim.enemies.filter((e) => e.summoned && e.state !== 'dead');
  const all = [...foes, ...extra];
  if (!all.length) return input;
  const target = all.sort((a, b) => dist(a.pos, p.pos) - dist(b.pos, p.pos))[0]!;
  const d = dist(target.pos, p.pos);
  input.aim = { ...target.pos };

  // Ameaças: esmagamento pesado (usa a Maré) e golpe em cone de elite (recua).
  const heavy = all.find((e) => e.state === 'windup' && e.attack?.heavy && dist(e.attackTarget, p.pos) <= e.attack.radius + 0.8);
  const cone = all.find(
    (e) => e.state === 'windup' && e.def.elite && e.attack?.type === 'melee' && dist(e.pos, p.pos) <= e.attack.range + e.def.radius + 0.6,
  );
  if (skill > 0 && heavy) {
    // Fica e gira a Maré para a defesa no instante do golpe.
    input.tideSteps = heavy.timer < 0.45 ? -2 - tideLevel(p.tide.target) : 0;
  } else if (skill > 0 && cone) {
    input.move = normalize({ x: p.pos.x - cone.pos.x, y: p.pos.y - cone.pos.y });
    input.tideSteps = -tideLevel(p.tide.target);
  } else {
    // Hábil: luta com a Maré no centro e desce para «« nos golpes pesados.
    if (skill > 0) input.tideSteps = -tideLevel(p.tide.target);
    if (d > 1.6) input.move = sim.pathDir(p.pos, target.pos);
  }
  input.basic = d < 2.1;

  for (const slot of sim.c.elos) {
    if (!slot.unlocked || !slot.technique || (p.slotCd[slot.level] ?? 0) > 0) continue;
    const spell = SPELLS[slot.technique as SpellId];
    const info = sim.slotInfo(slot);
    if (!info || p.flow < sim.slotCost(slot, info)) continue;
    const reach = MELEE_SPELLS.includes(spell.id) ? 3 : spell.id === 'point' ? 2.2 : Math.max(spell.range, 4);
    if (d > reach) continue;
    // Ponto zera a defesa por 2 s: quem sabe jogar não usa com um golpe vindo.
    if (
      skill > 0 &&
      spell.id === 'point' &&
      all.some(
        (e) =>
          (e.state === 'windup' && dist(e.pos, p.pos) < 6) ||
          e.def.attacks.some((a) => a.heavy && (e.cooldowns[a.id] ?? 0) < 2.5),
      )
    )
      continue;
    input.useSlot = slot.level;
    break;
  }
  return input;
}

export interface ScenarioResult {
  affinity: Affinity;
  scenario: string;
  won: boolean;
  seconds: number;
  hpLostPct: number;
  perfectTides: number;
}

export function runScenario(
  affinity: Affinity,
  scenario: { name: string; level: number; kinds: Array<{ kind: EnemyKind; n: number }>; skill: number; limit?: number },
): ScenarioResult {
  const c = createCharacter('Bot', affinity, 77);
  c.level = scenario.level;
  refreshEloUnlocks(c);
  const sim = new Simulation(c, 13);
  sim.player.hp = maxHpFor(c);
  // Mantém só os inimigos do cenário, perto de um ponto aberto do campo.
  const chosen: Enemy[] = [];
  for (const { kind, n } of scenario.kinds) chosen.push(...sim.enemies.filter((e) => e.kind === kind && !chosen.includes(e)).slice(0, n));
  const arena = scenario.kinds.some((k) => k.kind === 'boss');
  const center = arena ? { ...sim.map.arena! } : { x: 24, y: 22 };
  for (const e of sim.enemies) if (!chosen.includes(e)) Object.assign(e, { state: 'dead', respawnIn: Infinity });
  chosen.forEach((e, i) => {
    if (!arena) e.pos = { x: center.x + 3 + (i % 3) * 1.2, y: center.y - 1 + Math.floor(i / 3) * 1.2 };
    e.home = { ...e.pos };
    e.aggro = true;
    e.state = 'chase';
  });
  sim.player.pos = arena ? { x: center.x - 4, y: center.y } : { x: center.x - 1, y: center.y };
  const ids = new Set(chosen.map((e) => e.id));
  const maxHp = sim.maxHp();
  let lost = 0;
  let perfect = 0;
  const limit = scenario.limit ?? 240;
  let t = 0;
  for (; t < limit; t += TICK) {
    const hpBefore = sim.player.hp;
    const ev = sim.step(botInput(sim, ids, scenario.skill));
    for (const e of ev) if (e.t === 'perfectTide') perfect++;
    if (sim.player.hp < hpBefore) lost += hpBefore - sim.player.hp;
    if (sim.player.dead) break;
    if (chosen.every((e) => e.state === 'dead') && !sim.enemies.some((e) => e.summoned && e.state !== 'dead')) break;
  }
  return {
    affinity,
    scenario: scenario.name,
    won: !sim.player.dead && chosen.every((e) => e.state === 'dead'),
    seconds: Math.round(t),
    hpLostPct: Math.round((lost / maxHp) * 100),
    perfectTides: perfect,
  };
}

export const SCENARIOS = [
  { name: 'Carniçais x2 (nv 1)', level: 1, kinds: [{ kind: 'grunt' as const, n: 2 }], skill: 0 },
  { name: 'Matilha x4 + Espreitador (nv 2)', level: 2, kinds: [{ kind: 'grunt' as const, n: 4 }, { kind: 'stalker' as const, n: 1 }], skill: 0 },
  { name: 'Bruto (nv 3)', level: 3, kinds: [{ kind: 'brute' as const, n: 1 }], skill: 1 },
  { name: 'Guardião (nv 4, hábil)', level: 4, kinds: [{ kind: 'boss' as const, n: 1 }], skill: 1 },
  { name: 'Guardião (nv 4, sem Maré)', level: 4, kinds: [{ kind: 'boss' as const, n: 1 }], skill: 0 },
];

export function balanceReport(): ScenarioResult[] {
  const out: ScenarioResult[] = [];
  for (const s of SCENARIOS) for (const a of AFFINITY_RING) out.push(runScenario(a, s));
  return out;
}
