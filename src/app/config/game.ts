import { QN_BASE_PRICE, QN_PRICE_GROWTH } from './economy';
import type { SettingsState, StakingNodeId } from '../types';

export const REFINE_DISCOUNT_REFERENCE = {
  dailyPct: 5,
  weeklyPct: 10,
  passPct: 5,
} as const;

export const STAKING_NODE_OPTIONS: ReadonlyArray<{
  id: StakingNodeId;
  label: string;
  refinePct: number;
  hashPct: number;
  dailyBoostHours: number;
}> = [
  { id: 0, label: 'NONE', refinePct: 0, hashPct: 0, dailyBoostHours: 0 },
  { id: 1, label: 'NODE 1', refinePct: 2, hashPct: 0, dailyBoostHours: 0 },
  { id: 2, label: 'NODE 2', refinePct: 3, hashPct: 2.5, dailyBoostHours: 1 },
  { id: 3, label: 'NODE 3', refinePct: 4, hashPct: 5, dailyBoostHours: 1 },
  { id: 4, label: 'NODE 4', refinePct: 5, hashPct: 7.5, dailyBoostHours: 2 },
] as const;

export const DEFAULT_SETTINGS: SettingsState = {
  refineRate: 104_000,
  maxRackSlots: 0,
  qnBasePrice: QN_BASE_PRICE,
  qnPriceGrowth: QN_PRICE_GROWTH,
  refineDiscounts: {
    taskDiscountsEnabled: 1,
    dailyPct: REFINE_DISCOUNT_REFERENCE.dailyPct,
    weeklyPct: REFINE_DISCOUNT_REFERENCE.weeklyPct,
    passPct: REFINE_DISCOUNT_REFERENCE.passPct,
    passPrice: 0,
    dailyActive: 0,
    weeklyActive: 0,
    passActive: 0,
  },
  rigPresets: {
    quantum_node: { name: 'QUANTUM NODE', rate: 1400, synergy: 0, slots: 1, accent: 'green', optimizerFill: true },
    data_center: { name: 'DATA CENTER', rate: 260, synergy: 0, slots: 1, accent: 'green' },
    vault_scrap: { name: 'VAULT · SCRAP', rate: 300, synergy: 0, slots: 1, accent: 'purple' },
    vault_prime: { name: 'VAULT · PRIME', rate: 700, synergy: 0, slots: 1, accent: 'purple' },
    tiny_qdc: { name: 'TINY QDC', rate: 2500, synergy: 62.5, slots: 1, accent: 'purple' },
    mini_qdc: { name: 'MINI QDC', rate: 5000, synergy: 125, slots: 1, accent: 'purple' },
    qdc: { name: 'QUANTUM DATA CENTER', rate: 10000, synergy: 400, slots: 1, accent: 'purple' },
    qdc_s: { name: 'QUANTUM DATA CENTER S', rate: 20000, synergy: 800, slots: 1, accent: 'gold' },
  },
};

export const TIER_OPTIONS = [
  { label: 'VISITOR', mult: 0.5, refinePct: 0, dailyCap: 0 },
  { label: 'MINER', mult: 1, refinePct: 0, dailyCap: 0 },
  { label: 'DRILLER', mult: 1.2, refinePct: 0, dailyCap: 0 },
  { label: 'OPERATOR', mult: 1.4, refinePct: 5, dailyCap: 600_000 },
  { label: 'WHALE', mult: 1.6, refinePct: 7, dailyCap: 1_000_000 },
  { label: 'KINGPIN', mult: 1.8, refinePct: 10, dailyCap: 1_500_000 },
  { label: 'OVERLORD', mult: 2, refinePct: 20, dailyCap: 2_000_000 },
] as const;

export const COOLANT_LEVELS = Array.from({ length: 11 }, (_, level) => level);

export const PRESTIGE_OPTIONS = [
  { label: 'NONE', pct: 0 },
  { label: 'PRESTIGE II', pct: 25 },
  { label: 'PRESTIGE III', pct: 50 },
  { label: 'PRESTIGE IV', pct: 75 },
  { label: 'PRESTIGE V', pct: 100 },
] as const;

export const VIAL_OPTIONS = [0, 3, 6, 8, 12, 24] as const;
