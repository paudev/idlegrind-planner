import { STAKING_NODE_OPTIONS } from '../config/game';
import type { BuffState, StakingNodeId } from '../types';
import { number } from './format';
import { holderTierRefineRate } from './refine-discounts';

export function normalizeStakingNodeId(value: unknown): StakingNodeId {
  const node = Math.floor(number(value));
  return STAKING_NODE_OPTIONS.some((option) => option.id === node)
    ? node as StakingNodeId
    : 0;
}

export function stakingNode(id: unknown) {
  const normalized = normalizeStakingNodeId(id);
  return STAKING_NODE_OPTIONS.find((option) => option.id === normalized) ?? STAKING_NODE_OPTIONS[0];
}

export function stakingHashMultiplier(id: unknown): number {
  return 1 + stakingNode(id).hashPct / 100;
}

export function stakingRefineMultiplier(id: unknown): number {
  return 1 - stakingNode(id).refinePct / 100;
}

export function stakingDailyBoostHours(id: unknown): number {
  return stakingNode(id).dailyBoostHours;
}

export function permanentRefineRate(baseRate: number, buffs: Pick<BuffState, 'tier' | 'stakingNode'>): number {
  return holderTierRefineRate(baseRate, buffs.tier) * stakingRefineMultiplier(buffs.stakingNode);
}

export function withStakingNode(buffs: BuffState, id: unknown): BuffState {
  return { ...buffs, stakingNode: normalizeStakingNodeId(id) };
}
