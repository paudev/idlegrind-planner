import { DEFAULT_HOLDER_TIERS, TIER_OPTIONS } from '../config/game';
import type { HolderTierId, HolderTierSettings, SettingsState } from '../types';
import { clamp, number } from './format';

export interface HolderTierOption {
  id: HolderTierId;
  label: string;
  mult: number;
  refinePct: number;
  dailyCap: number;
}

export type HolderTierSettingsMap = SettingsState['holderTiers'];

export function holderTierOptions(holderTiers: HolderTierSettingsMap): HolderTierOption[] {
  return TIER_OPTIONS.map((option) => {
    const configured = holderTiers?.[option.id];
    const configuredMult = number(configured?.mult, option.mult);
    return {
      ...option,
      mult: configuredMult > 0 ? configuredMult : option.mult,
      refinePct: clamp(number(configured?.refinePct, option.refinePct), 0, 99.99),
    };
  });
}

export function normalizeHolderTierSettings(value: unknown): HolderTierSettingsMap {
  const raw = value && typeof value === 'object'
    ? value as Partial<Record<HolderTierId, Partial<HolderTierSettings>>>
    : {};

  return Object.fromEntries(TIER_OPTIONS.map((option) => {
    const configured = raw[option.id];
    const mult = number(configured?.mult, DEFAULT_HOLDER_TIERS[option.id].mult);
    return [option.id, {
      mult: mult > 0 ? mult : DEFAULT_HOLDER_TIERS[option.id].mult,
      refinePct: clamp(number(configured?.refinePct, DEFAULT_HOLDER_TIERS[option.id].refinePct), 0, 99.99),
    }];
  })) as HolderTierSettingsMap;
}

export function holderTierForMultiplier(
  value: unknown,
  holderTiers: HolderTierSettingsMap,
): HolderTierOption {
  const options = holderTierOptions(holderTiers);
  const tier = number(value, DEFAULT_HOLDER_TIERS.driller.mult);

  const configuredMatch = options.find((option) => Math.abs(option.mult - tier) < 1e-9);
  if (configuredMatch) return configuredMatch;

  const legacyMatch = TIER_OPTIONS.find((option) => Math.abs(option.mult - tier) < 1e-9);
  if (legacyMatch) {
    return options.find((option) => option.id === legacyMatch.id)
      ?? options.find((option) => option.id === 'driller')
      ?? options[0];
  }

  return options.find((option) => option.id === 'driller') ?? options[0];
}

export function normalizeTierMultiplier(value: unknown, holderTiers: HolderTierSettingsMap): number {
  return holderTierForMultiplier(value, holderTiers).mult;
}
