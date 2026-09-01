import { DAY, HOUR } from '../config/economy';

export function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

export function number(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function compact(value: unknown, digits = 3): string {
  const raw = Number(value);
  if (Number.isNaN(raw)) return '—';
  if (raw === Number.POSITIVE_INFINITY) return '∞';
  if (raw === Number.NEGATIVE_INFINITY) return '−∞';

  const n = raw;
  const abs = Math.abs(n);
  const scales: ReadonlyArray<readonly [number, string]> = [
    [1e15, 'Q'],
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];

  for (const [scale, suffix] of scales) {
    if (abs < scale) continue;
    const text = (n / scale)
      .toFixed(digits)
      .replace(/\.0+$/, '')
      .replace(/(\.\d*?)0+$/, '$1')
      .replace(/\.$/, '');
    return `${text}${suffix}`;
  }

  return n.toLocaleString('en-US', { maximumFractionDigits: digits });
}

export function parseHuman(value: unknown): number {
  const text = String(value ?? '').trim().replaceAll(',', '');
  if (!text) return 0;

  const match = text.match(/^(-?(?:\d+(?:\.\d*)?|\.\d+))\s*([kmbtq])?$/i);
  if (!match) return Number.NaN;

  const scales: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9, t: 1e12, q: 1e15 };
  const suffix = match[2]?.toLowerCase();
  return Number(match[1]) * (suffix ? scales[suffix] : 1);
}

export function inputText(value: unknown): string {
  return number(value).toLocaleString('en-US', { maximumFractionDigits: 8 });
}

export function duration(seconds: number | null, { ready = true }: { ready?: boolean } = {}): string {
  if (seconds === null) return 'NOT SET';
  if (!Number.isFinite(seconds)) return 'UNREACHABLE';
  if (seconds <= 0.5) return ready ? 'READY NOW' : '0m';

  let remaining = Math.max(0, Math.round(seconds));
  const days = Math.floor(remaining / DAY);
  remaining %= DAY;
  const hours = Math.floor(remaining / HOUR);
  remaining %= HOUR;
  const minutes = Math.floor(remaining / 60);
  const secs = remaining % 60;

  if (days) return `${days}d ${hours}h ${minutes}m`;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

export function signed(value: number, suffix = ''): string {
  if (!Number.isFinite(value)) return `${value > 0 ? '+' : value < 0 ? '−' : ''}${compact(value)}${suffix}`;
  if (Math.abs(value) < 1e-9) return `0${suffix}`;
  return `${value > 0 ? '+' : '−'}${compact(Math.abs(value))}${suffix}`;
}

export function money(value: number, currency = '$GRIND', negative = false): string {
  const amount = Math.max(0, value);
  return `${negative && amount > 0 ? '−' : ''}${compact(amount)} ${currency}`;
}
