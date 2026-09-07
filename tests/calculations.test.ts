declare const require: (id: string) => any;

const { test } = require('node:test');
const assert = require('node:assert/strict');

import {
  coolantUpgradeCost,
  fundingTimeline,
  production,
  qnPrice,
  qnTotalCost,
  rackExpansion,
  rigStats,
  solveMinimumBuild,
} from '../src/app/core/calculations';
import { loadPositiveDefaults, readJson, writeJson } from '../src/app/core/storage';
import type { BuffState, Rig, RigPreset } from '../src/app/types';

const buffs: BuffState = {
  tier: 1,
  coolantLevel: 0,
  prestigePct: 0,
  bronze: false,
  silver: false,
  gold: false,
  mixed: false,
  auraPct: 0,
  corePct: 0,
};

const quantumNode: RigPreset = {
  name: 'QUANTUM NODE',
  rate: 1400,
  synergy: 0,
  slots: 1,
  accent: 'green',
  optimizerFill: true,
};

function memoryStorage(memory: Map<string, string>): Storage {
  return {
    get length() { return memory.size; },
    clear() { memory.clear(); },
    getItem(key: string) { return memory.get(key) ?? null; },
    key(index: number) { return [...memory.keys()][index] ?? null; },
    removeItem(key: string) { memory.delete(key); },
    setItem(key: string, value: string) { memory.set(key, String(value)); },
  };
}

function installMemoryStorage(): Map<string, string> {
  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage(memory), configurable: true });
  return memory;
}

test('production applies overclock only inside the requested window', () => {
  const result = production(100, 3600, 1800);
  assert.equal(result.overclock, 1800);
  assert.equal(result.normal, 1800);
  assert.equal(result.grit, 540_000);
  assert.equal(result.average, 150);
});

test('QN pricing follows the configured geometric assumption', () => {
  assert.equal(qnPrice(0), 2_800_000);
  assert.ok(Math.abs(qnPrice(1) - 3_220_000) < 1e-6);
  assert.ok(Math.abs(qnTotalCost(0, 3) - (qnPrice(0) + qnPrice(1) + qnPrice(2))) < 1e-6);
});

test('custom QN pricing flows through price, total cost, and funding', () => {
  assert.equal(qnPrice(2, 100, 2), 400);
  assert.equal(qnTotalCost(0, 3, 100, 2), 700);

  const timeline = fundingTimeline({
    currentQns: 0,
    targetQns: 1,
    currentGrit: 0,
    rateForQns: () => 100,
    qnBasePrice: 1000,
    qnPriceGrowth: 2,
  });

  assert.equal(timeline.length, 1);
  assert.ok(Math.abs((timeline[0]?.time ?? 0) - 10) < 1e-6);
});

test('market defaults fill missing keys while preserving an explicit zero', () => {
  const memory = installMemoryStorage();
  const defaults = { bronze_frame: 1_250_000, silver_frame: 2_500_000 };

  assert.deepEqual(loadPositiveDefaults('market-test', defaults), defaults);
  memory.set('market-test', JSON.stringify({ bronze_frame: 0 }));

  assert.deepEqual(loadPositiveDefaults('market-test', defaults), {
    bronze_frame: 0,
    silver_frame: 2_500_000,
  });
});

test('JSON persistence falls back to session storage when local storage is unavailable', () => {
  const unavailable: Storage = {
    get length() { return 0; },
    clear() { throw new Error('blocked'); },
    getItem() { throw new Error('blocked'); },
    key() { return null; },
    removeItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  };
  const session = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { value: unavailable, configurable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: memoryStorage(session), configurable: true });

  writeJson('persist-test', { target: 300_000, vial: 6 });
  assert.deepEqual(readJson('persist-test', {}), { target: 300_000, vial: 6 });
  assert.ok(session.has('persist-test'));
});

test('funding timeline splits correctly when overclock expires mid-purchase', () => {
  const timeline = fundingTimeline({
    currentQns: 0,
    targetQns: 1,
    currentGrit: 0,
    rateForQns: () => 1000,
    overclockSeconds: 1000,
  });

  assert.equal(timeline.length, 1);
  assert.ok(Math.abs((timeline[0]?.time ?? 0) - 1800) < 1e-6);
});

test('coolant prices double from the 12K level-one reference', () => {
  assert.equal(coolantUpgradeCost(0, 8), 3_060_000);
  assert.equal(coolantUpgradeCost(0, 10), 12_276_000);
});

test('rack expansion costs each successive +6 pack', () => {
  const rack = rackExpansion(12, 24);
  assert.equal(rack.count, 2);
  assert.equal(rack.total, 18_750);
  assert.deepEqual(rack.rows.map((row) => row.capacity), [18, 24]);
});

test('rig stats defend against fractional quantities and slot counts', () => {
  const rigs: Rig[] = [{
    id: 'fixed',
    name: 'FIXED',
    qty: 1.9,
    rate: 100,
    synergy: 10,
    slots: 1.9,
    accent: 'green',
  }];

  const stats = rigStats(rigs, 2.8, quantumNode);
  assert.equal(stats.fixedBase, 100);
  assert.equal(stats.fixedSlots, 1);
  assert.equal(stats.synergy, 10);
  assert.equal(stats.perQn, 1410);
  assert.equal(stats.base, 2920);
  assert.equal(stats.slots, 3);
});

test('3H and 24H vials keep the official minimum fixed when both cover funding', () => {
  const fixedRig: Rig = {
    id: 'starter',
    name: 'STARTER',
    qty: 1,
    rate: 1000,
    synergy: 0,
    slots: 1,
    accent: 'green',
  };
  const targetGrindPerDay = 2520; // 2,800 GRIT/s normal-rate target at 96K refine.

  const threeHour = solveMinimumBuild({
    targetGrindPerDay,
    refineRate: 96_000,
    vialHours: 3,
    rigs: [fixedRig],
    buffs,
    quantumNode,
  });
  const twentyFourHour = solveMinimumBuild({
    targetGrindPerDay,
    refineRate: 96_000,
    vialHours: 24,
    rigs: [fixedRig],
    buffs,
    quantumNode,
  });

  assert.equal(threeHour.qns, 2);
  assert.equal(twentyFourHour.qns, 2);
  assert.equal(threeHour.productionFactorAtReady, 1);
  assert.equal(twentyFourHour.productionFactorAtReady, 1);
  assert.ok(Math.abs(threeHour.fundingTime - twentyFourHour.fundingTime) < 1e-6);
  assert.ok(threeHour.fundingTime < 3 * 3600);
  assert.ok(threeHour.rateAtReady >= threeHour.requiredRate);
});

test('vial-assisted minimum reduction is opt-in', () => {
  const fixedRig: Rig = {
    id: 'starter',
    name: 'STARTER',
    qty: 1,
    rate: 1000,
    synergy: 0,
    slots: 1,
    accent: 'green',
  };

  const official = solveMinimumBuild({
    targetGrindPerDay: 2520,
    refineRate: 96_000,
    vialHours: 3,
    rigs: [fixedRig],
    buffs,
    quantumNode,
  });
  const assisted = solveMinimumBuild({
    targetGrindPerDay: 2520,
    refineRate: 96_000,
    vialHours: 3,
    rigs: [fixedRig],
    buffs,
    quantumNode,
    allowVialToReduceMinimum: true,
  });

  assert.equal(official.qns, 2);
  assert.equal(assisted.qns, 1);
  assert.equal(assisted.productionFactorAtReady, 2);
  assert.ok(assisted.fundingTime < 3 * 3600);
  assert.ok(assisted.rateAtReady >= assisted.requiredRate);
});

test('no vial uses the normal-rate QN requirement', () => {
  const fixedRig: Rig = {
    id: 'starter',
    name: 'STARTER',
    qty: 1,
    rate: 1000,
    synergy: 0,
    slots: 1,
    accent: 'green',
  };

  const result = solveMinimumBuild({
    targetGrindPerDay: 2520,
    refineRate: 96_000,
    vialHours: 0,
    rigs: [fixedRig],
    buffs,
    quantumNode,
  });

  assert.equal(result.qns, 2);
  assert.equal(result.productionFactorAtReady, 1);
  assert.ok(result.rateAtReady >= result.requiredRate);
});
