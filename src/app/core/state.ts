import { DEFAULT_SETTINGS, REFINE_DISCOUNT_REFERENCE, VIAL_OPTIONS } from '../config/game';
import {
  MARKET_DEFAULTS,
  RACK_BASE_SLOTS,
  RACK_DISPLAY_LIMIT,
  RACK_SLOT_STEP,
  STORAGE_KEYS,
  VIAL_DEFAULTS,
} from '../config/economy';
import type {
  ActiveTab,
  ApplicationStore,
  BuffState,
  DeckState,
  RefineDiscountCosts,
  RefineDiscountSettings,
  HolderTierId,
  Rig,
  RigPreset,
  Scope,
  PlannerProfile,
  PersistedCashoutCycle,
} from '../types';
import { clamp, clone, number } from './format';
import { normalizeHolderTierSettings, normalizeTierMultiplier } from './holder-tiers';
import { activeProfile, profileStorageKey, selectProfile } from './profile';
import { normalizeStakingNodeId } from './staking';
import { loadPositiveDefaults, mergeState, readJson, setPath, writeJson } from './storage';

const ACTIVE_TABS: ActiveTab[] = ['target', 'reset', 'current', 'planner', 'costing', 'settings'];
const VALID_VIAL_HOURS = new Set<number>(VIAL_OPTIONS);

function defaultBuffs(): BuffState {
  return {
    tier: DEFAULT_SETTINGS.holderTiers.driller.mult,
    coolantLevel: 0,
    prestigePct: 0,
    bronze: false,
    silver: false,
    gold: false,
    mixed: false,
    auraPct: 0,
    corePct: 0,
    layoutPct: 0,
    stakingNode: 0,
  };
}

function defaultDiscountCosts(): RefineDiscountCosts {
  return {
    dailyGrind: 0,
    weeklyGrind: 0,
  };
}

function normalizeTier(value: unknown, holderTiers: ApplicationStore['state']['settings']['holderTiers']): number {
  return normalizeTierMultiplier(value, holderTiers);
}

function normalizeBuffs(
  buffs: BuffState,
  holderTiers: ApplicationStore['state']['settings']['holderTiers'],
): void {
  buffs.tier = normalizeTier(buffs.tier, holderTiers);
  buffs.coolantLevel = clamp(Math.floor(number(buffs.coolantLevel)), 0, 10);
  buffs.prestigePct = Math.max(0, number(buffs.prestigePct));
  buffs.auraPct = Math.max(0, number(buffs.auraPct));
  buffs.corePct = Math.max(0, number(buffs.corePct));
  buffs.layoutPct = Math.max(0, number(buffs.layoutPct));
  buffs.stakingNode = normalizeStakingNodeId(buffs.stakingNode);
  if (buffs.mixed) {
    buffs.bronze = false;
    buffs.silver = false;
    buffs.gold = false;
  }
}

function normalizeDiscountSettings(discounts: RefineDiscountSettings): void {
  discounts.taskDiscountsEnabled = number(discounts.taskDiscountsEnabled) >= 0.5 ? 1 : 0;
  // Game reference: Daily 5%, Weekly 10%, Seasonal Pass 5%.
  // These are fixed conversion rules, not marketplace assumptions.
  discounts.dailyPct = REFINE_DISCOUNT_REFERENCE.dailyPct;
  discounts.weeklyPct = REFINE_DISCOUNT_REFERENCE.weeklyPct;
  discounts.passPct = REFINE_DISCOUNT_REFERENCE.passPct;
  discounts.passPrice = Math.max(0, number(discounts.passPrice));
  discounts.dailyActive = number(discounts.dailyActive) >= 0.5 ? 1 : 0;
  discounts.weeklyActive = number(discounts.weeklyActive) >= 0.5 ? 1 : 0;
  discounts.passActive = number(discounts.passActive) >= 0.5 ? 1 : 0;
}

function normalizeDiscountCosts(costs: RefineDiscountCosts): void {
  costs.dailyGrind = Math.max(0, number(costs.dailyGrind));
  costs.weeklyGrind = Math.max(0, number(costs.weeklyGrind));
}

function normalizeVialHours(value: unknown): number {
  const hours = number(value);
  return VALID_VIAL_HOURS.has(hours) ? hours : 0;
}

function normalizeRackLimit(value: unknown): number {
  const slots = Math.max(0, Math.floor(number(value)));
  if (slots === 0) return 0;
  return clamp(
    RACK_BASE_SLOTS + Math.round((slots - RACK_BASE_SLOTS) / RACK_SLOT_STEP) * RACK_SLOT_STEP,
    RACK_BASE_SLOTS,
    RACK_DISPLAY_LIMIT,
  );
}

function normalizePreset(preset: RigPreset): void {
  preset.rate = Math.max(0, number(preset.rate));
  preset.synergy = Math.max(0, number(preset.synergy));
  preset.slots = Math.max(0, Math.floor(number(preset.slots, 1)));
}

function normalizeRigs(rigs: Rig[]): void {
  for (const rig of rigs) {
    rig.qty = Math.max(0, Math.floor(number(rig.qty)));
    rig.rate = Math.max(0, number(rig.rate));
    rig.synergy = Math.max(0, number(rig.synergy));
    rig.slots = Math.max(0, Math.floor(number(rig.slots, 1)));
  }
}

export function createDefaultState(): ApplicationStore['state'] {
  return {
    activeTab: 'target',
    settings: clone(DEFAULT_SETTINGS),
    target: { grindPerDay: 0, tier: DEFAULT_SETTINGS.holderTiers.driller.mult },
    reset: { finalRate: 0, vialHours: 0, tier: DEFAULT_SETTINGS.holderTiers.driller.mult },
    planner: {
      targetGrindPerDay: 0,
      extraQns: 0,
      vialHours: 0,
      showVialAssistedMinimum: false,
      buffs: defaultBuffs(),
      rigs: [],
      view: 'output',
      discountCosts: defaultDiscountCosts(),
    },
  };
}

export function createDefaultDeck(): DeckState {
  return {
    qns: 0,
    addedQns: 0,
    currentOverclockHours: 0,
    currentOverclockMinutes: 0,
    vialHours: 0,
    buffs: defaultBuffs(),
    simulatedNode: -1,
    includeDailyNodeBoost: 1,
    rigs: [],
    view: 'output',
    discountCosts: defaultDiscountCosts(),
    baseline: {
      currentDeckSlots: RACK_BASE_SLOTS,
      currentGrit: 0,
      includeVialCost: true,
    },
  };
}

function loadStore(resetTransientUi = true): ApplicationStore {
  const snapshot = readJson<Partial<ApplicationStore>>(profileStorageKey(STORAGE_KEYS.snapshot), {});
  const state = mergeState(createDefaultState(), readJson<unknown>(profileStorageKey(STORAGE_KEYS.app), snapshot.state ?? {}));
  const deck = mergeState(createDefaultDeck(), readJson<unknown>(profileStorageKey(STORAGE_KEYS.deck), snapshot.deck ?? {}));
  const ui = mergeState(
    { readinessGroup: 1, readinessPage: 1, rackPage: 1 },
    readJson<unknown>(profileStorageKey(STORAGE_KEYS.ui), snapshot.ui ?? {}),
  );

  state.activeTab = ACTIVE_TABS.includes(state.activeTab) ? state.activeTab : 'target';
  // Page/subview selection is transient UI state, not user data. A browser reload
  // keeps all inputs but reopens simulator/planner modules on their primary output view.
  if (resetTransientUi) {
    state.planner.view = 'output';
    deck.view = 'output';
    ui.readinessPage = 1;
  }

  state.settings.refineRate = Math.max(0, number(state.settings.refineRate, DEFAULT_SETTINGS.refineRate));
  state.settings.maxRackSlots = normalizeRackLimit(state.settings.maxRackSlots);
  state.settings.qnBasePrice = Math.max(0, number(state.settings.qnBasePrice, DEFAULT_SETTINGS.qnBasePrice));
  state.settings.qnPriceGrowth = Math.max(1, number(state.settings.qnPriceGrowth, DEFAULT_SETTINGS.qnPriceGrowth));
  state.settings.holderTiers = normalizeHolderTierSettings(state.settings.holderTiers);
  normalizeDiscountSettings(state.settings.refineDiscounts);
  Object.values(state.settings.rigPresets).forEach(normalizePreset);
  const qdcSPreset = state.settings.rigPresets.qdc_s;
  if (qdcSPreset && Math.abs(number(qdcSPreset.synergy) - 600) < 1e-9) {
    qdcSPreset.synergy = DEFAULT_SETTINGS.rigPresets.qdc_s.synergy;
  }
  state.target.tier = normalizeTier(state.target.tier, state.settings.holderTiers);
  state.reset.tier = normalizeTier(state.reset.tier, state.settings.holderTiers);
  state.reset.vialHours = normalizeVialHours(state.reset.vialHours);
  state.planner.extraQns = Math.max(0, Math.floor(number(state.planner.extraQns)));
  state.planner.vialHours = normalizeVialHours(state.planner.vialHours);
  if (resetTransientUi) state.planner.showVialAssistedMinimum = false;
  normalizeBuffs(state.planner.buffs, state.settings.holderTiers);
  normalizeRigs(state.planner.rigs);
  normalizeDiscountCosts(state.planner.discountCosts);

  deck.qns = Math.max(0, Math.floor(number(deck.qns)));
  deck.addedQns = Math.max(0, Math.floor(number(deck.addedQns)));
  deck.currentOverclockHours = Math.max(0, number(deck.currentOverclockHours));
  deck.currentOverclockMinutes = clamp(number(deck.currentOverclockMinutes), 0, 59);
  deck.vialHours = normalizeVialHours(deck.vialHours);
  deck.simulatedNode = number(deck.simulatedNode, -1);
  deck.simulatedNode = deck.simulatedNode >= 0 && deck.simulatedNode <= 4
    ? normalizeStakingNodeId(deck.simulatedNode)
    : -1;
  deck.includeDailyNodeBoost = number(deck.includeDailyNodeBoost, 1) >= 0.5 ? 1 : 0;
  deck.baseline.currentDeckSlots = Math.max(
    RACK_BASE_SLOTS,
    Math.floor(number(deck.baseline.currentDeckSlots, RACK_BASE_SLOTS)),
  );
  deck.baseline.currentGrit = Math.max(0, number(deck.baseline.currentGrit));
  normalizeBuffs(deck.buffs, state.settings.holderTiers);
  normalizeRigs(deck.rigs);
  normalizeDiscountCosts(deck.discountCosts);

  const market = loadPositiveDefaults(profileStorageKey(STORAGE_KEYS.market), MARKET_DEFAULTS, {
    fallback: snapshot.market as Record<string, unknown> | undefined,
  });
  const vials = loadPositiveDefaults(profileStorageKey(STORAGE_KEYS.vials), VIAL_DEFAULTS, {
    repairZero: true,
    fallback: snapshot.vials as Record<string, unknown> | undefined,
  });
  const costingReference = mergeState(
    { coolantLevel: 0, rackSlots: RACK_BASE_SLOTS },
    readJson<unknown>(profileStorageKey(STORAGE_KEYS.costingReference), snapshot.costingReference ?? {}),
  );

  costingReference.coolantLevel = clamp(Math.floor(number(costingReference.coolantLevel)), 0, 10);
  costingReference.rackSlots = clamp(
    RACK_BASE_SLOTS + Math.round((number(costingReference.rackSlots, RACK_BASE_SLOTS) - RACK_BASE_SLOTS) / RACK_SLOT_STEP) * RACK_SLOT_STEP,
    RACK_BASE_SLOTS,
    RACK_DISPLAY_LIMIT,
  );

  return { state, deck, ui, market, vials, costingReference };
}

export const store: ApplicationStore = loadStore();

export function saveAll(): void {
  writeJson(profileStorageKey(STORAGE_KEYS.app), store.state);
  writeJson(profileStorageKey(STORAGE_KEYS.deck), store.deck);
  writeJson(profileStorageKey(STORAGE_KEYS.ui), store.ui);
  writeJson(profileStorageKey(STORAGE_KEYS.market), store.market);
  writeJson(profileStorageKey(STORAGE_KEYS.vials), store.vials);
  writeJson(profileStorageKey(STORAGE_KEYS.costingReference), store.costingReference);
  writeJson(profileStorageKey(STORAGE_KEYS.snapshot), {
    state: store.state,
    deck: store.deck,
    ui: store.ui,
    market: store.market,
    vials: store.vials,
    costingReference: store.costingReference,
  });
}

// A new profile starts as a snapshot of the current workspace. Subsequent edits
// are isolated by platform-specific storage keys, including cashout timing.
export function switchProfile(next: PlannerProfile): void {
  if (next === activeProfile()) return;

  saveAll();
  const targetSnapshotKey = profileStorageKey(STORAGE_KEYS.snapshot, next);
  if (readJson<Partial<ApplicationStore> | null>(targetSnapshotKey, null) === null) {
    writeJson(targetSnapshotKey, store);
    const cashout = readJson<PersistedCashoutCycle>(
      profileStorageKey(STORAGE_KEYS.cashout),
      {},
    );
    writeJson(profileStorageKey(STORAGE_KEYS.cashout, next), cashout);
  }

  selectProfile(next);
  Object.assign(store, loadStore(false));
  saveAll();
}

export function resolveInputPath(path: string): [Record<string, unknown>, string] {
  if (path.startsWith('deck.')) return [store.deck as unknown as Record<string, unknown>, path.slice(5)];
  if (path.startsWith('state.')) return [store.state as unknown as Record<string, unknown>, path.slice(6)];
  return [store.state as unknown as Record<string, unknown>, path];
}

const HOLDER_TIER_SETTING_PATH = /^state\.settings\.holderTiers\.(visitor|miner|driller|operator|whale|kingpin|overlord)\.(mult|refinePct)$/;

function syncSelectedTierMultiplier(previous: number, next: number): void {
  if (Math.abs(previous - next) < 1e-9) return;
  const selections = [
    store.state.target,
    store.state.reset,
    store.state.planner.buffs,
    store.deck.buffs,
  ];
  for (const selection of selections) {
    if (Math.abs(number(selection.tier) - previous) < 1e-9) selection.tier = next;
  }
}

function normalizedHolderTierInput(path: string, value: number): number | null {
  const match = path.match(HOLDER_TIER_SETTING_PATH);
  if (!match) return null;

  const id = match[1] as HolderTierId;
  const field = match[2] as 'mult' | 'refinePct';
  if (field === 'refinePct') return clamp(value, 0, 99.99);

  const candidate = Math.max(0.01, value);
  const duplicate = Object.entries(store.state.settings.holderTiers)
    .some(([otherId, tier]) => otherId !== id && Math.abs(number(tier.mult) - candidate) < 1e-9);
  return duplicate ? store.state.settings.holderTiers[id].mult : candidate;
}

function normalizedInputValue(path: string, value: number): number {
  const holderTierValue = normalizedHolderTierInput(path, value);
  if (holderTierValue !== null) return holderTierValue;

  if (path.startsWith('state.settings.refineDiscounts.')) {
    if (path.endsWith('dailyPct')) return REFINE_DISCOUNT_REFERENCE.dailyPct;
    if (path.endsWith('weeklyPct')) return REFINE_DISCOUNT_REFERENCE.weeklyPct;
    if (path.endsWith('passPct')) return REFINE_DISCOUNT_REFERENCE.passPct;
    if (path.endsWith('Active') || path.endsWith('taskDiscountsEnabled')) return value >= 0.5 ? 1 : 0;
    return Math.max(0, value);
  }
  if (path.startsWith('state.planner.discountCosts.') || path.startsWith('deck.discountCosts.')) {
    return Math.max(0, value);
  }

  switch (path) {
    case 'deck.qns':
    case 'deck.addedQns':
    case 'state.planner.extraQns':
      return Math.max(0, Math.floor(value));
    case 'deck.buffs.stakingNode':
    case 'state.planner.buffs.stakingNode':
      return normalizeStakingNodeId(value);
    case 'deck.simulatedNode':
      return value >= 0 && value <= 4 ? normalizeStakingNodeId(value) : -1;
    case 'deck.includeDailyNodeBoost':
      return value >= 0.5 ? 1 : 0;
    case 'deck.baseline.currentDeckSlots':
      return Math.max(RACK_BASE_SLOTS, Math.floor(value));
    case 'deck.baseline.currentGrit':
    case 'deck.currentOverclockHours':
      return Math.max(0, value);
    case 'deck.currentOverclockMinutes':
      return clamp(value, 0, 59);
    case 'state.target.tier':
    case 'state.reset.tier':
      return normalizeTier(value, store.state.settings.holderTiers);
    case 'state.settings.maxRackSlots':
      return normalizeRackLimit(value);
    case 'state.settings.qnPriceGrowth':
      return Math.max(1, value);
    case 'state.settings.refineRate':
    case 'state.settings.qnBasePrice':
    case 'state.target.grindPerDay':
    case 'state.reset.finalRate':
    case 'state.planner.targetGrindPerDay':
      return Math.max(0, value);
    default:
      return value;
  }
}

export function updateInputPath(path: string, value: number): void {
  const [root, relativePath] = resolveInputPath(path);
  const holderTierMatch = path.match(HOLDER_TIER_SETTING_PATH);
  const previousMultiplier = holderTierMatch && holderTierMatch[2] === 'mult'
    ? number(store.state.settings.holderTiers[holderTierMatch[1] as HolderTierId].mult)
    : null;
  const nextValue = normalizedInputValue(path, value);
  setPath(root, relativePath, nextValue);

  if (previousMultiplier !== null) {
    syncSelectedTierMultiplier(previousMultiplier, nextValue);
    store.state.planner.extraQns = 0;
  }
}

export function getQuantumNodePreset(): RigPreset {
  return store.state.settings.rigPresets.quantum_node ?? {
    name: 'QUANTUM NODE',
    rate: 1400,
    synergy: 0,
    slots: 1,
    accent: 'green',
    optimizerFill: true,
  };
}

export function addRig(scope: Scope, presetId: string): void {
  const target = scope === 'deck' ? store.deck.rigs : store.state.planner.rigs;
  const preset = store.state.settings.rigPresets[presetId];
  if (!preset || preset.optimizerFill) return;

  const existing = target.find((rig) => rig.presetId === presetId);
  if (existing) {
    existing.qty = Math.max(0, Math.floor(number(existing.qty))) + 1;
    return;
  }

  const rig: Rig = {
    id: `rig-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    presetId,
    name: preset.name,
    qty: 1,
    rate: preset.rate,
    synergy: preset.synergy,
    slots: preset.slots,
    accent: preset.accent,
  };
  target.push(rig);
}

export function addCustomRig(scope: Scope): void {
  const target = scope === 'deck' ? store.deck.rigs : store.state.planner.rigs;
  target.push({
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: 'CUSTOM RIG',
    qty: 1,
    rate: 0,
    synergy: 0,
    slots: 1,
    accent: 'green',
  });
}

export function buffTarget(scope: Scope): BuffState {
  return scope === 'deck' ? store.deck.buffs : store.state.planner.buffs;
}

export function resetPlannerData(): void {
  store.state = createDefaultState();
  store.deck = createDefaultDeck();
  store.market = { ...MARKET_DEFAULTS };
  store.vials = { ...VIAL_DEFAULTS };
  store.costingReference = { coolantLevel: 0, rackSlots: RACK_BASE_SLOTS };
  store.ui = { readinessGroup: 1, readinessPage: 1, rackPage: 1 };
  saveAll();
}
