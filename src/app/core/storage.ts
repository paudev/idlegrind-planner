import { clone, parseHuman } from './format';

export function readJson<T>(key: string, fallback: T): T {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || 'null');
    return value && typeof value === 'object' ? value as T : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local storage may be unavailable in private/restricted browser contexts.
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
  { repairZero = false }: { repairZero?: boolean } = {},
): Record<string, number> {
  const saved = readJson<Record<string, unknown>>(key, {});
  const values: Record<string, number> = {};
  let changed = false;

  for (const [id, fallback] of Object.entries(defaults)) {
    const present = Object.prototype.hasOwnProperty.call(saved, id);
    const value = present ? parseHuman(saved[id]) : Number.NaN;
    const invalid = !present || !Number.isFinite(value) || (repairZero ? value <= 0 : value < 0);
    values[id] = invalid ? fallback : value;
    if (invalid) changed = true;
  }

  if (changed) writeJson(key, values);
  return values;
}
