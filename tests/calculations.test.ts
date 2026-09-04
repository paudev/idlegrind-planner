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
import { loadPositiveDefaults } from '../src/app/core/storage';
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

function installMemoryStorage(): Map<string, string> {
  const memory = new Map<string, string>();
  const storage: Storage = {
    get length() { return memory.size; },
    clear() { memory.clear(); },
    getItem(key: string) { return memory.get(key) ?? null; },
    key(index: number) { return [...memory.keys()][index] ?? null; },
    removeItem(key: string) { memory.delete(key); },
    setItem(key: string, value: string) { memory.set(key, String(value)); },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
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
  assert.equal(qnPrice(1), 3_220_000);
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

test('3H and 24H vials produce the same minimum when the build is ready inside 3H', () => {
  const fixedRig: Rig = {
    id: 'starter',
    name: 'STARTER',
    qty: 1,
    rate: 1000,
    synergy: 0,
    slots: 1,
    accent: 'green',
  };
  const targetGrindPerDay = 2520; // 2,800 GRIT/s rate-equivalent at 96K refine.

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

  assert.equal(threeHour.qns, 1);
  assert.equal(twentyFourHour.qns, 1);
  assert.equal(threeHour.productionFactorAtReady, 2);
  assert.equal(twentyFourHour.productionFactorAtReady, 2);
  assert.ok(Math.abs(threeHour.fundingTime - twentyFourHour.fundingTime) < 1e-6);
  assert.ok(threeHour.fundingTime < 3 * 3600);
  assert.ok(threeHour.rateAtReady >= threeHour.requiredRate);
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
