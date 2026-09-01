import { DEFAULT_SETTINGS } from '../config/game';
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
  DeckView,
  PlannerView,
  Rig,
  RigPreset,
  Scope,
} from '../types';
import { clamp, clone, number } from './format';
import { loadPositiveDefaults, mergeState, readJson, setPath, writeJson } from './storage';

const ACTIVE_TABS: ActiveTab[] = ['target', 'reset', 'current', 'planner', 'costing', 'settings'];
const PLANNER_VIEWS: PlannerView[] = ['output', 'cost', 'readiness'];
const DECK_VIEWS: DeckView[] = ['output', 'cost', 'readiness'];

function defaultBuffs(): BuffState {
  return {
    tier: 0,
    coolantLevel: 0,
    prestigePct: 0,
    bronze: false,
    silver: false,
    gold: false,
    mixed: false,
    auraPct: 0,
    corePct: 0,
    otherMult: 0,
  };
}

function normalizeBuffs(buffs: BuffState): void {
  buffs.coolantLevel = clamp(Math.floor(number(buffs.coolantLevel)), 0, 10);
  buffs.prestigePct = Math.max(0, number(buffs.prestigePct));
  buffs.auraPct = Math.max(0, number(buffs.auraPct));
  buffs.corePct = Math.max(0, number(buffs.corePct));
  buffs.otherMult = Math.max(0, number(buffs.otherMult));
}

export function createDefaultState(): ApplicationStore['state'] {
  return {
    activeTab: 'target',
    settings: clone(DEFAULT_SETTINGS),
    target: { grindPerDay: 0 },
    reset: { finalRate: 0, vialHours: 0 },
    planner: {
      targetGrindPerDay: 0,
      vialHours: 0,
      buffs: defaultBuffs(),
      rigs: [],
      view: 'output',
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
    rigs: [],
    view: 'output',
    baseline: {
      currentDeckSlots: RACK_BASE_SLOTS,
      currentGrit: 0,
      includeVialCost: true,
    },
  };
}

function loadStore(): ApplicationStore {
  const state = mergeState(createDefaultState(), readJson<unknown>(STORAGE_KEYS.app, {}));
  const deck = mergeState(createDefaultDeck(), readJson<unknown>(STORAGE_KEYS.deck, {}));
  const ui = mergeState(
    { cashoutEditor: false, readinessGroup: 1, readinessPage: 1, rackPage: 1 },
    readJson<unknown>(STORAGE_KEYS.ui, {}),
  );

  state.activeTab = ACTIVE_TABS.includes(state.activeTab) ? state.activeTab : 'target';
  state.planner.view = PLANNER_VIEWS.includes(state.planner.view) ? state.planner.view : 'output';
  deck.view = DECK_VIEWS.includes(deck.view) ? deck.view : 'output';

  if (number(state.settings.refineRate) <= 0) state.settings.refineRate = DEFAULT_SETTINGS.refineRate;
  state.settings.maxRackSlots = Math.max(0, Math.floor(number(state.settings.maxRackSlots)));
  state.reset.vialHours = clamp(number(state.reset.vialHours), 0, 24);
  state.planner.vialHours = clamp(number(state.planner.vialHours), 0, 24);
  normalizeBuffs(state.planner.buffs);

  deck.qns = Math.max(0, Math.floor(number(deck.qns)));
  deck.addedQns = Math.max(0, Math.floor(number(deck.addedQns)));
  deck.currentOverclockHours = Math.max(0, number(deck.currentOverclockHours));
  deck.currentOverclockMinutes = clamp(number(deck.currentOverclockMinutes), 0, 59);
  deck.vialHours = clamp(number(deck.vialHours), 0, 24);
  deck.baseline.currentDeckSlots = Math.max(
    RACK_BASE_SLOTS,
    Math.floor(number(deck.baseline.currentDeckSlots, RACK_BASE_SLOTS)),
  );
  deck.baseline.currentGrit = Math.max(0, number(deck.baseline.currentGrit));
  normalizeBuffs(deck.buffs);

  const market = loadPositiveDefaults(STORAGE_KEYS.market, MARKET_DEFAULTS);
  const vials = loadPositiveDefaults(STORAGE_KEYS.vials, VIAL_DEFAULTS, { repairZero: true });
  const costingReference = mergeState(
    { coolantLevel: 0, rackSlots: RACK_BASE_SLOTS },
    readJson<unknown>(STORAGE_KEYS.costingReference, {}),
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
  writeJson(STORAGE_KEYS.app, store.state);
  writeJson(STORAGE_KEYS.deck, store.deck);
  writeJson(STORAGE_KEYS.ui, store.ui);
  writeJson(STORAGE_KEYS.market, store.market);
  writeJson(STORAGE_KEYS.vials, store.vials);
  writeJson(STORAGE_KEYS.costingReference, store.costingReference);
}

export function resolveInputPath(path: string): [Record<string, unknown>, string] {
  if (path.startsWith('deck.')) return [store.deck as unknown as Record<string, unknown>, path.slice(5)];
  if (path.startsWith('state.')) return [store.state as unknown as Record<string, unknown>, path.slice(6)];
  return [store.state as unknown as Record<string, unknown>, path];
}

export function updateInputPath(path: string, value: number): void {
  const [root, relativePath] = resolveInputPath(path);
  setPath(root, relativePath, value);
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
    existing.qty = number(existing.qty) + 1;
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
  store.ui = { cashoutEditor: false, readinessGroup: 1, readinessPage: 1, rackPage: 1 };
  saveAll();
}
