declare const require: (id: string) => any;

const { test } = require('node:test');
const assert = require('node:assert/strict');

import {
  effectiveHashMultiplier,
  fundingTimeline,
  multiplier,
  productionWithDailyBoost,
  rateFactory,
  solveMinimumBuild,
} from '../src/app/core/calculations';
import {
  permanentRefineRate,
  stakingDailyBoostHours,
  stakingNode,
} from '../src/app/core/staking';
import type { BuffState, RigPreset } from '../src/app/types';

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

const baseBuffs: BuffState = {
  tier: 1,
  coolantLevel: 0,
  prestigePct: 0,
  bronze: false,
  silver: false,
  gold: false,
  mixed: false,
  auraPct: 0,
  corePct: 0,
  stakingNode: 0,
};

const quantumNode: RigPreset = {
  name: 'QUANTUM NODE',
  rate: 1400,
  synergy: 0,
  slots: 1,
  accent: 'green',
  optimizerFill: true,
};

test('staking node reference exposes planner-relevant bonuses', () => {
  assert.deepEqual(stakingNode(1), {
    id: 1,
    label: 'NODE 1',
    refinePct: 2,
    hashPct: 0,
    dailyBoostHours: 0,
  });
  assert.equal(stakingDailyBoostHours(2), 1);
  assert.equal(stakingDailyBoostHours(3), 1);
  assert.equal(stakingDailyBoostHours(4), 2);
});

test('Node hash changes hash rate without changing the Mining Deck buff multiplier', () => {
  const node4 = { ...baseBuffs, stakingNode: 4 } as BuffState;
  assert.equal(multiplier({ ...baseBuffs, stakingNode: 0 }), 1);
  assert.equal(multiplier(node4), 1);
  assert.ok(Math.abs(effectiveHashMultiplier(node4) - 1.075) < 1e-12);
  assert.ok(Math.abs(rateFactory([], node4, quantumNode)(1) - 1400 * 1.075) < 1e-12);

  const stacked = {
    ...baseBuffs,
    tier: 1.75,
    coolantLevel: 3,
    stakingNode: 4,
  } as BuffState;
  assert.ok(Math.abs(multiplier(stacked) - 1.75 * 1.3) < 1e-12);
  assert.ok(Math.abs(effectiveHashMultiplier(stacked) - 1.75 * 1.3 * 1.075) < 1e-12);
});

test('exact Core Power reproduces the Mining Deck TOTAL before its rounded Core badge', () => {
  const gameLikeBuffs: BuffState = {
    ...baseBuffs,
    tier: 1.9,
    coolantLevel: 7,
    prestigePct: 50,
    bronze: true,
    silver: true,
    gold: true,
    auraPct: 10,
    corePct: 1.6,
  };
  assert.equal(multiplier(gameLikeBuffs).toFixed(2), '10.83');
});

test('staking refine compounds after the holder-tier refine discount', () => {
  const operatorNode4 = permanentRefineRate(104_000, {
    ...baseBuffs,
    tier: 1.75,
    stakingNode: 4,
  });
  assert.equal(operatorNode4, 93_860);

  const overlordNode3 = permanentRefineRate(104_000, {
    ...baseBuffs,
    tier: 3,
    stakingNode: 3,
  });
  assert.equal(overlordNode3, 79_872);
});

test('daily Node boost repeats once per 24H window', () => {
  const result = productionWithDailyBoost(100, DAY * 2, 2 * HOUR, 2 * HOUR);
  assert.equal(result.overclock, 4 * HOUR);
  assert.equal(result.normal, DAY * 2 - 4 * HOUR);
  assert.equal(result.grit, 100 * (DAY * 2 + 4 * HOUR));
  assert.equal(result.average, 100 * (1 + 4 / 48));
});

test('daily Node boost time never reduces the stable minimum QN requirement', () => {
  const buffs: BuffState = { ...baseBuffs, stakingNode: 4 };
  const refineRate = permanentRefineRate(104_000, buffs);
  const withoutTemporaryBoost = solveMinimumBuild({
    targetGrindPerDay: 5_000,
    refineRate,
    vialHours: 0,
    dailyBoostHours: 0,
    rigs: [],
    buffs,
    quantumNode,
    allowVialToReduceMinimum: false,
  });
  const withDailyNodeBoost = solveMinimumBuild({
    targetGrindPerDay: 5_000,
    refineRate,
    vialHours: 0,
    dailyBoostHours: 2,
    rigs: [],
    buffs,
    quantumNode,
    allowVialToReduceMinimum: false,
  });

  assert.equal(withDailyNodeBoost.qns, withoutTemporaryBoost.qns);
  assert.equal(withDailyNodeBoost.productionFactorAtReady, 1);
});

test('recurring daily Node boost speeds a multi-day funding path', () => {
  const normal = fundingTimeline({
    currentQns: 0,
    targetQns: 1,
    currentGrit: 0,
    rateForQns: () => 10,
    qnBasePrice: 1_000_000,
    qnPriceGrowth: 1,
  });
  const boosted = fundingTimeline({
    currentQns: 0,
    targetQns: 1,
    currentGrit: 0,
    rateForQns: () => 10,
    overclockSeconds: 2 * HOUR,
    dailyBoostSeconds: 2 * HOUR,
    qnBasePrice: 1_000_000,
    qnPriceGrowth: 1,
  });

  assert.ok((normal[0]?.time ?? 0) > DAY);
  assert.ok((boosted[0]?.time ?? Number.POSITIVE_INFINITY) < (normal[0]?.time ?? 0));
});

test('permanent Node hash and refine can reduce the stable minimum QNs', () => {
  const noNodeRefine = permanentRefineRate(104_000, baseBuffs);
  const node4Buffs: BuffState = { ...baseBuffs, stakingNode: 4 };
  const node4Refine = permanentRefineRate(104_000, node4Buffs);

  const noNode = solveMinimumBuild({
    targetGrindPerDay: 5_000,
    refineRate: noNodeRefine,
    vialHours: 0,
    rigs: [],
    buffs: baseBuffs,
    quantumNode,
  });
  const node4 = solveMinimumBuild({
    targetGrindPerDay: 5_000,
    refineRate: node4Refine,
    vialHours: 0,
    rigs: [],
    buffs: node4Buffs,
    quantumNode,
  });

  assert.ok(node4.qns !== null && noNode.qns !== null);
  assert.ok(node4.qns! <= noNode.qns!);
});
