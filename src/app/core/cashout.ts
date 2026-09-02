import { DAY, STORAGE_KEYS } from '../config/economy';
import type { CashoutCycle, PersistedCashoutCycle } from '../types';
import { readJson, writeJson } from './storage';

export function cashoutCycle(): CashoutCycle {
  const raw = readJson<PersistedCashoutCycle>(STORAGE_KEYS.cashout, {});
  const last = Number(raw.lastWithdrawalAt);

  return {
    last: Number.isFinite(last) && last > 0 ? last : null,
  };
}

export function saveCashoutCycle(cycle: PersistedCashoutCycle): void {
  writeJson(STORAGE_KEYS.cashout, cycle);
}

export function nextCashoutAt(cycle: CashoutCycle = cashoutCycle()): number | null {
  return cycle.last !== null ? cycle.last + DAY * 1000 : null;
}

export function cashoutRemainingSeconds(cycle: CashoutCycle = cashoutCycle()): number | null {
  const next = nextCashoutAt(cycle);
  return next !== null ? Math.max(0, (next - Date.now()) / 1000) : null;
}

export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Device local time';
  } catch {
    return 'Device local time';
  }
}

export function formatLocalTime(timestamp: number | null, includeYear = true): string {
  if (timestamp === null || !Number.isFinite(timestamp)) return 'NOT SET';

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      ...(includeYear ? { year: 'numeric' } : {}),
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toLocaleString();
  }
}

export function markWithdrawnNow(): void {
  saveCashoutCycle({ lastWithdrawalAt: Date.now() });
}

export function setLastWithdrawal(timestamp: number): boolean {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return false;
  if (timestamp > Date.now() + 60_000) return false;

  saveCashoutCycle({ lastWithdrawalAt: timestamp });
  return true;
}

export function setNextCashout(timestamp: number): boolean {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return false;

  const lastWithdrawalAt = timestamp - DAY * 1000;
  if (lastWithdrawalAt <= 0 || lastWithdrawalAt > Date.now() + 60_000) return false;

  saveCashoutCycle({ lastWithdrawalAt });
  return true;
}

export function clearCashoutCycle(): void {
  writeJson<PersistedCashoutCycle>(STORAGE_KEYS.cashout, {});
}
