import {
  COOLANT_COSTS,
  QN_BASE_PRICE,
  QN_PRICE_GROWTH,
  RACK_BASE_SLOTS,
  RACK_PRICE_STEP,
  RACK_SLOT_STEP,
} from '../config/economy';
import { DEFAULT_SETTINGS } from '../config/game';
import type {
  BuffState,
  FundingProgress,
  FundingRow,
  ProductionResult,
  RackExpansionResult,
  Rig,
  RigPreset,
  RigStats,
} from '../types';
import { clamp, number } from './format';

export function multiplier(buffs: BuffState): number {
  const tier = number(buffs.tier) > 0 ? number(buffs.tier) : 1;
  const coolant = 1 + Math.max(0, number(buffs.coolantLevel)) * 0.1;
  const prestige = 1 + Math.max(0, number(buffs.prestigePct)) / 100;
  const frame = buffs.mixed
    ? 7 / 3
    : 1 + (buffs.bronze ? 0.15 : 0) + (buffs.silver ? 0.3 : 0) + (buffs.gold ? 0.55 : 0);
  const aura = 1 + Math.max(0, number(buffs.auraPct)) / 100;
  const core = 1 + Math.max(0, number(buffs.corePct)) / 100;
  const other = number(buffs.otherMult) > 0 ? number(buffs.otherMult) : 1;

  return tier * coolant * prestige * frame * aura * core * other;
}

function defaultQuantumNode(): RigPreset {
  return DEFAULT_SETTINGS.rigPresets.quantum_node;
}

export function rigStats(rigs: Rig[], qns: number, quantumNode: RigPreset = defaultQuantumNode()): RigStats {
  const fixedBase = rigs.reduce(
    (sum, rig) => sum + Math.max(0, number(rig.rate)) * Math.max(0, number(rig.qty)),
    0,
  );
  const fixedSlots = rigs.reduce(
    (sum, rig) => sum + Math.max(0, number(rig.slots, 1)) * Math.max(0, number(rig.qty)),
    0,
  );
  const synergy = rigs.reduce(
    (sum, rig) => sum + Math.max(0, number(rig.synergy)) * Math.max(0, number(rig.qty)),
    0,
  );

  const perQn = Math.max(0, number(quantumNode.rate, 1400)) + synergy;
  const qnCount = Math.max(0, number(qns));

  return {
    fixedBase,
    fixedSlots,
    synergy,
    perQn,
    base: fixedBase + qnCount * perQn,
    slots: fixedSlots + qnCount * Math.max(0, number(quantumNode.slots, 1)),
  };
}

export function rateFactory(rigs: Rig[], buffs: BuffState, quantumNode: RigPreset = defaultQuantumNode()): (qns: number) => number {
  const fixed = rigStats(rigs, 0, quantumNode);
  const buffMultiplier = multiplier(buffs);
  return (qns: number) => Math.max(0, (fixed.fixedBase + Math.max(0, qns) * fixed.perQn) * buffMultiplier);
}

export function production(rate: number, seconds: number, overclockSeconds = 0): ProductionResult {
  const total = Math.max(0, number(seconds));
  const overclock = Math.min(total, Math.max(0, number(overclockSeconds)));
  const normal = total - overclock;
  const grit = rate * normal + rate * 2 * overclock;

  return {
    grit,
    overclock,
    normal,
    average: total > 0 ? grit / total : rate,
  };
}

export function qnPrice(owned: number): number {
  return QN_BASE_PRICE * Math.pow(QN_PRICE_GROWTH, Math.max(0, Math.floor(number(owned))));
}

export function qnTotalCost(owned: number, count: number): number {
  const current = Math.max(0, Math.floor(number(owned)));
  const quantity = Math.max(0, Math.floor(number(count)));
  if (!quantity) return 0;

  const first = qnPrice(current);
  return first * (Math.pow(QN_PRICE_GROWTH, quantity) - 1) / (QN_PRICE_GROWTH - 1);
}

export function rackPackCount(slots: number): number {
  return slots <= RACK_BASE_SLOTS ? 0 : Math.ceil((slots - RACK_BASE_SLOTS) / RACK_SLOT_STEP);
}

export function rackExpansion(currentSlots: number, targetSlots: number): RackExpansionResult {
  const from = rackPackCount(Math.max(RACK_BASE_SLOTS, number(currentSlots, RACK_BASE_SLOTS)));
  const to = rackPackCount(Math.max(RACK_BASE_SLOTS, number(targetSlots, RACK_BASE_SLOTS)));
  const rows: RackExpansionResult['rows'] = [];
  let total = 0;

  for (let pack = from + 1; pack <= to; pack += 1) {
    const cost = RACK_PRICE_STEP * pack;
    total += cost;
    rows.push({ capacity: RACK_BASE_SLOTS + pack * RACK_SLOT_STEP, cost });
  }

  return { total, rows, count: rows.length };
}

export function coolantUpgradeCost(fromLevel: number, toLevel: number): number {
  const from = clamp(Math.floor(number(fromLevel)), 0, 10);
  const to = clamp(Math.floor(number(toLevel)), 0, 10);
  let total = 0;

  for (let level = from + 1; level <= to; level += 1) total += COOLANT_COSTS[level] ?? 0;
  return total;
}

interface FundingInput {
  currentQns: number;
  targetQns: number;
  currentGrit: number;
  rateForQns: (qns: number) => number;
  overclockSeconds?: number;
}

interface FundingHorizonInput extends FundingInput {
  horizon: number;
}

function unreachableRow(qns: number, cost: number, elapsed: number, rate: number, totalCost: number, balance: number): FundingRow {
  return {
    from: qns,
    to: qns + 1,
    cost,
    totalCost,
    wait: Number.POSITIVE_INFINITY,
    time: Number.POSITIVE_INFINITY,
    balanceAfter: balance,
    rateAfter: rate,
    overclockActive: false,
    unreachable: true,
  };
}

export function fundingTimeline({
  currentQns,
  targetQns,
  currentGrit,
  rateForQns,
  overclockSeconds = 0,
}: FundingInput): FundingRow[] {
  const target = Math.max(0, Math.floor(number(targetQns)));
  let qns = Math.max(0, Math.floor(number(currentQns)));
  let balance = Math.max(0, number(currentGrit));
  let elapsed = 0;
  let totalCost = 0;
  const rows: FundingRow[] = [];

  while (qns < target) {
    const cost = qnPrice(qns);
    const stepStartedAt = elapsed;

    if (!Number.isFinite(cost)) {
      rows.push(unreachableRow(qns, cost, elapsed, rateForQns(qns), totalCost, balance));
      break;
    }

    while (balance + 1e-6 < cost) {
      const normalRate = rateForQns(qns);
      if (!(normalRate > 0) || !Number.isFinite(normalRate)) {
        rows.push(unreachableRow(qns, cost, elapsed, normalRate, totalCost, balance));
        return rows;
      }

      const overclockActive = elapsed < overclockSeconds;
      const rate = overclockActive ? normalRate * 2 : normalRate;
      const need = cost - balance;
      const wait = need / rate;

      if (overclockActive && elapsed + wait > overclockSeconds) {
        const overclockLeft = overclockSeconds - elapsed;
        balance += rate * overclockLeft;
        elapsed = overclockSeconds;
        continue;
      }

      balance += rate * wait;
      elapsed += wait;
    }

    balance = Math.max(0, balance - cost);
    totalCost += cost;
    qns += 1;

    rows.push({
      from: qns - 1,
      to: qns,
      cost,
      totalCost,
      wait: elapsed - stepStartedAt,
      time: elapsed,
      balanceAfter: balance,
      rateAfter: rateForQns(qns),
      overclockActive: elapsed < overclockSeconds,
      unreachable: false,
    });
  }

  return rows;
}

export function fundingHorizon({
  currentQns,
  targetQns,
  currentGrit,
  rateForQns,
  horizon,
  overclockSeconds = 0,
}: FundingHorizonInput): FundingProgress {
  const end = Math.max(0, number(horizon));
  const target = Math.max(0, Math.floor(number(targetQns)));
  let qns = Math.max(0, Math.floor(number(currentQns)));
  let balance = Math.max(0, number(currentGrit));
  let elapsed = 0;
  let mined = 0;
  let spent = 0;
  let buyableNow = 0;
  let bought = 0;

  const accrue = (seconds: number): void => {
    const duration = Math.max(0, seconds);
    if (duration <= 0) return;
    const normalRate = Math.max(0, rateForQns(qns));
    const rate = elapsed < overclockSeconds ? normalRate * 2 : normalRate;
    const gain = duration * rate;
    balance += gain;
    mined += gain;
    elapsed += duration;
  };

  while (elapsed < end - 1e-8 && qns < target) {
    const cost = qnPrice(qns);

    if (balance + 1e-6 >= cost) {
      if (elapsed < 1e-7) buyableNow += 1;
      balance = Math.max(0, balance - cost);
      spent += cost;
      qns += 1;
      bought += 1;
      continue;
    }

    const normalRate = rateForQns(qns);
    if (!(normalRate > 0) || !Number.isFinite(normalRate)) break;

    const rate = elapsed < overclockSeconds ? normalRate * 2 : normalRate;
    let boundary = end;
    if (elapsed < overclockSeconds) boundary = Math.min(boundary, overclockSeconds);

    const wait = (cost - balance) / rate;
    if (elapsed + wait <= boundary + 1e-8) {
      accrue(wait);
      continue;
    }

    accrue(boundary - elapsed);
  }

  while (qns < target && balance + 1e-6 >= qnPrice(qns) && elapsed <= end + 1e-8) {
    const cost = qnPrice(qns);
    if (elapsed < 1e-7) buyableNow += 1;
    balance = Math.max(0, balance - cost);
    spent += cost;
    qns += 1;
    bought += 1;
  }

  while (elapsed < end - 1e-8) {
    let boundary = end;
    if (elapsed < overclockSeconds) boundary = Math.min(boundary, overclockSeconds);
    const delta = boundary - elapsed;
    if (delta <= 0) break;
    accrue(delta);
  }

  return { qns, balance, mined, spent, bought, buyableNow };
}
