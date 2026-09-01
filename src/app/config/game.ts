import type { SettingsState } from '../types';

export const DEFAULT_SETTINGS: SettingsState = {
  refineRate: 0,
  maxRackSlots: 0,
  rigPresets: {
    quantum_node: { name: 'QUANTUM NODE', rate: 1400, synergy: 0, slots: 1, accent: 'green', optimizerFill: true },
    data_center: { name: 'DATA CENTER', rate: 260, synergy: 0, slots: 1, accent: 'green' },
    vault_scrap: { name: 'VAULT · SCRAP', rate: 300, synergy: 0, slots: 1, accent: 'purple' },
    vault_prime: { name: 'VAULT · PRIME', rate: 700, synergy: 0, slots: 1, accent: 'purple' },
    tiny_qdc: { name: 'TINY QDC', rate: 2500, synergy: 62.5, slots: 1, accent: 'purple' },
    mini_qdc: { name: 'MINI QDC', rate: 5000, synergy: 125, slots: 1, accent: 'purple' },
    qdc: { name: 'QUANTUM DATA CENTER', rate: 10000, synergy: 400, slots: 1, accent: 'purple' },
    qdc_s: { name: 'QUANTUM DATA CENTER S', rate: 20000, synergy: 600, slots: 1, accent: 'gold' },
  },
};

export const TIER_OPTIONS = [
  { label: 'VISITOR', mult: 0.5 },
  { label: 'MINER', mult: 1 },
  { label: 'DRILLER', mult: 1.2 },
  { label: 'OPERATOR', mult: 1.4 },
  { label: 'WHALE', mult: 1.6 },
  { label: 'KINGPIN', mult: 1.8 },
  { label: 'OVERLORD', mult: 2 },
] as const;

export const COOLANT_LEVELS = Array.from({ length: 11 }, (_, level) => level);

export const PRESTIGE_OPTIONS = [
  { label: 'NONE', pct: 0 },
  { label: 'PRESTIGE II', pct: 25 },
  { label: 'PRESTIGE III', pct: 50 },
] as const;

export const VIAL_OPTIONS = [0, 3, 6, 8, 12, 24] as const;
