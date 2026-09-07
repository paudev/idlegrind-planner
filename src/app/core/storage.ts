import { clone, parseHuman } from './format';

type BrowserStorageName = 'localStorage' | 'sessionStorage';

function browserStorage(name: BrowserStorageName): Storage | null {
  try {
    const root = globalThis as typeof globalThis & Partial<Record<BrowserStorageName, Storage>>;
    return root[name] ?? null;
  } catch {
    return null;
  }
}

export function readJson<T>(key: string, fallback: T): T {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    const storage = browserStorage(name);
    if (!storage) continue;
    try {
      const raw = storage.getItem(key);
      if (raw === null) continue;
      const value: unknown = JSON.parse(raw);
      if (value && typeof value === 'object') return value as T;
    } catch {
      // Try the next browser storage backend before falling back to defaults.
    }
  }
  return fallback;
}

export function writeJson<T>(key: string, value: T): void {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return;
  }
  if (serialized === undefined) return;

  for (const name of ['localStorage', 'sessionStorage'] as const) {
    const storage = browserStorage(name);
    if (!storage) continue;
    try {
      storage.setItem(key, serialized);
    } catch {
      // Keep the other storage backend as a reload-safe fallback.
    }
  }
}

export function mergeState<T>(base: T, saved: unknown): T {
  if (!saved || typeof saved !== 'object') return clone(base);
  if (Array.isArray(base)) return (Array.isArray(saved) ? saved : clone(base)) as T;

  const result = { ...(base as Record<string, unknown>) };
  const source = saved as Record<string, unknown>;

  for (const [key, value] of Object.entries(source)) {
    if (!(key in result)) continue;

    const baseValue = result[key];
    const canMerge =
      baseValue !== null &&
      typeof baseValue === 'object' &&
      !Array.isArray(baseValue) &&
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value);

    result[key] = canMerge ? mergeState(baseValue, value) : value;
  }

  return result as T;
}

export function setPath(root: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  const finalKey = keys.at(-1);
  if (!finalKey) return;

  let target = root;
  for (const key of keys.slice(0, -1)) {
    const current = target[key];
    if (!current || typeof current !== 'object' || Array.isArray(current)) target[key] = {};
    target = target[key] as Record<string, unknown>;
  }
  target[finalKey] = value;
}

export function loadPositiveDefaults(
  key: string,
  defaults: Record<string, number>,
  {
    repairZero = false,
    fallback = {},
  }: { repairZero?: boolean; fallback?: Record<string, unknown> } = {},
): Record<string, number> {
  const saved = readJson<Record<string, unknown>>(key, fallback);
  const values: Record<string, number> = {};
  let changed = false;

  for (const [id, defaultValue] of Object.entries(defaults)) {
    const present = Object.prototype.hasOwnProperty.call(saved, id);
    const value = present ? parseHuman(saved[id]) : Number.NaN;
    const invalid = !present || !Number.isFinite(value) || (repairZero ? value <= 0 : value < 0);
    values[id] = invalid ? defaultValue : value;
    if (invalid) changed = true;
  }

  if (changed) writeJson(key, values);
  return values;
}
