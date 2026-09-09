import { TIER_OPTIONS } from '../config/game';
import type { RefineDiscountKey, RefineDiscountSettings } from '../types';
import { clamp, number } from './format';

export const TASK_TIME_ZONE = 'America/Los_Angeles';
export const TASK_RESET_HOUR = 18;
export const TASK_RESET_MINUTE = 5;

const DISCOUNT_KEYS: RefineDiscountKey[] = ['daily', 'weekly', 'pass'];

function enabled(value: unknown): boolean {
  return number(value) >= 0.5;
}

export function normalizedDiscountPct(value: unknown): number {
  return clamp(number(value), 0, 99.99);
}

export function holderTierRefineDiscountPct(tierMultiplier: unknown): number {
  const tier = number(tierMultiplier, 1);
  const match = TIER_OPTIONS.find((option) => Math.abs(option.mult - tier) < 1e-9);
  return match?.refinePct ?? 0;
}

export function holderTierRefineRate(baseRate: number, tierMultiplier: unknown): number {
  const base = Math.max(0, number(baseRate));
  return base * (1 - holderTierRefineDiscountPct(tierMultiplier) / 100);
}

export function discountPct(settings: RefineDiscountSettings, key: RefineDiscountKey): number {
  if ((key === 'daily' || key === 'weekly') && !enabled(settings.taskDiscountsEnabled)) return 0;
  if (key === 'daily') return normalizedDiscountPct(settings.dailyPct);
  if (key === 'weekly') return normalizedDiscountPct(settings.weeklyPct);
  return normalizedDiscountPct(settings.passPct);
}

export function discountActive(settings: RefineDiscountSettings, key: RefineDiscountKey): boolean {
  if ((key === 'daily' || key === 'weekly') && !enabled(settings.taskDiscountsEnabled)) return false;
  if (key === 'daily') return enabled(settings.dailyActive);
  if (key === 'weekly') return enabled(settings.weeklyActive);
  return enabled(settings.passActive);
}

export function effectiveRefineRate(
  baseRate: number,
  settings: RefineDiscountSettings,
  overrides: Partial<Record<RefineDiscountKey, boolean>> = {},
): number {
  let rate = Math.max(0, number(baseRate));
  for (const key of DISCOUNT_KEYS) {
    const active = overrides[key] ?? discountActive(settings, key);
    if (!active) continue;
    const pct = discountPct(settings, key);
    rate *= 1 - pct / 100;
  }
  return rate;
}

export function activeDiscountPct(baseRate: number, settings: RefineDiscountSettings): number {
  const base = Math.max(0, number(baseRate));
  if (!(base > 0)) return 0;
  const effective = effectiveRefineRate(base, settings);
  return Math.max(0, (1 - effective / base) * 100);
}

interface PacificParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const pacificFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TASK_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function pacificParts(timestamp: number): PacificParts {
  const values: Record<string, number> = {};
  for (const part of pacificFormatter.formatToParts(new Date(timestamp))) {
    if (part.type === 'literal') continue;
    const parsed = Number(part.value);
    if (Number.isFinite(parsed)) values[part.type] = parsed;
  }
  return {
    year: values.year ?? 1970,
    month: values.month ?? 1,
    day: values.day ?? 1,
    hour: values.hour ?? 0,
    minute: values.minute ?? 0,
    second: values.second ?? 0,
  };
}

function wallClockStamp(parts: PacificParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

function pacificWallTimeToUtc(parts: PacificParts): number {
  const targetStamp = wallClockStamp(parts);
  let guess = targetStamp;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const seen = pacificParts(guess);
    const delta = targetStamp - wallClockStamp(seen);
    guess += delta;
    if (Math.abs(delta) < 1) break;
  }

  return guess;
}

function addPacificCalendarDays(parts: PacificParts, days: number): PacificParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function resetWallClock(parts: PacificParts): PacificParts {
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: TASK_RESET_HOUR,
    minute: TASK_RESET_MINUTE,
    second: 0,
  };
}

export function nextDailyTaskReset(now = Date.now()): number {
  const current = pacificParts(now);
  let candidateParts = resetWallClock(current);
  let candidate = pacificWallTimeToUtc(candidateParts);
  if (candidate <= now) {
    candidateParts = addPacificCalendarDays(candidateParts, 1);
    candidate = pacificWallTimeToUtc(candidateParts);
  }
  return candidate;
}

export function nextWeeklyTaskReset(now = Date.now()): number {
  const current = pacificParts(now);
  const currentDay = new Date(Date.UTC(current.year, current.month - 1, current.day)).getUTCDay();
  let daysUntilSunday = (7 - currentDay) % 7;
  let candidateParts = addPacificCalendarDays(resetWallClock(current), daysUntilSunday);
  let candidate = pacificWallTimeToUtc(candidateParts);
  if (candidate <= now) {
    daysUntilSunday += 7;
    candidateParts = addPacificCalendarDays(resetWallClock(current), daysUntilSunday);
    candidate = pacificWallTimeToUtc(candidateParts);
  }
  return candidate;
}

export interface RefineDiscountRoiInput {
  candidate: RefineDiscountKey;
  baseRefineRate: number;
  settings: RefineDiscountSettings;
  projectedGrit: number;
  gritCost?: number;
  grindCost?: number;
  horizonSeconds: number;
}

export interface RefineDiscountRoiResult {
  candidatePct: number;
  available: boolean;
  withoutRate: number;
  withRate: number;
  grossGain: number;
  costAtDiscountedRate: number;
  netGain: number;
  breakEvenGrit: number;
  breakEvenGrind: number;
  breakEvenSeconds: number;
  withoutGrind: number;
  withGrindAfterCosts: number;
}

export function refineDiscountRoi({
  candidate,
  baseRefineRate,
  settings,
  projectedGrit,
  gritCost = 0,
  grindCost = 0,
  horizonSeconds,
}: RefineDiscountRoiInput): RefineDiscountRoiResult {
  const base = Math.max(0, number(baseRefineRate));
  const grit = Math.max(0, number(projectedGrit));
  const taskGritCost = Math.max(0, number(gritCost));
  const directGrindCost = Math.max(0, number(grindCost));
  const candidatePct = discountPct(settings, candidate);
  const withoutRate = effectiveRefineRate(base, settings, { [candidate]: false });
  const withRate = effectiveRefineRate(base, settings, { [candidate]: true });
  const available = candidatePct > 0 && withoutRate > 0 && withRate > 0 && withRate < withoutRate;

  if (!available) {
    return {
      candidatePct,
      available: false,
      withoutRate,
      withRate,
      grossGain: 0,
      costAtDiscountedRate: directGrindCost,
      netGain: -directGrindCost,
      breakEvenGrit: Number.POSITIVE_INFINITY,
      breakEvenGrind: Number.POSITIVE_INFINITY,
      breakEvenSeconds: Number.POSITIVE_INFINITY,
      withoutGrind: withoutRate > 0 ? grit / withoutRate : 0,
      withGrindAfterCosts: withRate > 0 ? Math.max(0, grit - taskGritCost) / withRate - directGrindCost : 0,
    };
  }

  const withoutGrind = grit / withoutRate;
  const grossWith = grit / withRate;
  const grossGain = grossWith - withoutGrind;
  const costAtDiscountedRate = taskGritCost / withRate + directGrindCost;
  const withGrindAfterCosts = Math.max(0, grit - taskGritCost) / withRate - directGrindCost;
  const netGain = withGrindAfterCosts - withoutGrind;
  const gainPerGrit = 1 / withRate - 1 / withoutRate;
  const breakEvenGrit = gainPerGrit > 0
    ? (taskGritCost / withRate + directGrindCost) / gainPerGrit
    : Number.POSITIVE_INFINITY;
  const breakEvenGrind = Number.isFinite(breakEvenGrit) ? breakEvenGrit / withoutRate : Number.POSITIVE_INFINITY;
  const horizon = Math.max(0, number(horizonSeconds));
  const averageAvailableRate = horizon > 0 ? grit / horizon : 0;
  const breakEvenSeconds = averageAvailableRate > 0 && Number.isFinite(breakEvenGrit)
    ? breakEvenGrit / averageAvailableRate
    : Number.POSITIVE_INFINITY;

  return {
    candidatePct,
    available,
    withoutRate,
    withRate,
    grossGain,
    costAtDiscountedRate,
    netGain,
    breakEvenGrit,
    breakEvenGrind,
    breakEvenSeconds,
    withoutGrind,
    withGrindAfterCosts,
  };
}
