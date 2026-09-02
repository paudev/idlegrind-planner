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

function localInputDate(timestamp: number | null): Date {
  return new Date(timestamp !== null && Number.isFinite(timestamp) ? timestamp : Date.now());
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function toLocalDateInput(timestamp: number | null): string {
  const date = localInputDate(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toLocalTimeInput(timestamp: number | null): string {
  const date = localInputDate(timestamp);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function localDateTimeTimestamp(dateValue: string, timeValue: string): number {
  const dateMatch = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = timeValue.match(/^(\d{2}):(\d{2})$/);
  if (!dateMatch || !timeMatch) return Number.NaN;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  const date = new Date(year, month - 1, day, hours, minutes, 0, 0);

  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
    || date.getHours() !== hours
    || date.getMinutes() !== minutes
  ) {
    return Number.NaN;
  }

  return date.getTime();
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

export function clearCashoutCycle(): void {
  writeJson<PersistedCashoutCycle>(STORAGE_KEYS.cashout, {});
}
