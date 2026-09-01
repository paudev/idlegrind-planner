import {
  MARKET_DEFAULTS,
  RACK_BASE_SLOTS,
  RACK_DISPLAY_LIMIT,
  RACK_SLOT_STEP,
  STORAGE_KEYS,
  VIAL_DEFAULTS,
} from './config/economy';
import {
  clearCashoutCycle,
  cashoutRemainingSeconds,
  markWithdrawnNow,
  setLastWithdrawal,
} from './core/cashout';
import { clamp, duration, number, parseHuman } from './core/format';
import {
  addCustomRig,
  addRig,
  buffTarget,
  resetPlannerData,
  saveAll,
  store,
  updateInputPath,
} from './core/state';
import { writeJson } from './core/storage';
import type {
  ActiveTab,
  BuffState,
  DeckView,
  PlannerView,
  Rig,
  Scope,
} from './types';
import { shell } from './ui/shell';
import { renderCostingView } from './views/costing';
import { renderDeckView } from './views/deck';
import { renderPlannerView } from './views/planner';
import { renderPotentialView } from './views/potential';
import { renderSettingsView } from './views/settings';
import { renderTargetView } from './views/target';

const appRoot = document.querySelector<HTMLElement>('#app');
if (!appRoot) throw new Error('Application root #app was not found.');
const app: HTMLElement = appRoot;

const ACTIVE_TABS: ActiveTab[] = ['target', 'reset', 'current', 'planner', 'costing', 'settings'];
const DECK_VIEWS: DeckView[] = ['output', 'cost', 'readiness'];
const PLANNER_VIEWS: PlannerView[] = ['output', 'cost', 'readiness'];
const SCOPES: Scope[] = ['deck', 'planner'];

type NumericBuffKey = 'tier' | 'coolantLevel' | 'prestigePct' | 'auraPct' | 'corePct' | 'otherMult';
type FrameKey = 'bronze' | 'silver' | 'gold' | 'mixed';
type RigField = 'name' | 'qty' | 'rate' | 'synergy' | 'slots';

function isScope(value: string | undefined): value is Scope {
  return value !== undefined && SCOPES.includes(value as Scope);
}

function currentView(): string {
  switch (store.state.activeTab) {
    case 'target': return renderTargetView();
    case 'reset': return renderPotentialView();
    case 'current': return renderDeckView();
    case 'planner': return renderPlannerView();
    case 'costing': return renderCostingView();
    case 'settings': return renderSettingsView();
  }
}

export function render(): void {
  saveAll();
  app.innerHTML = shell(currentView());
}

function updateRigField(scope: Scope, id: string, key: RigField, rawValue: string): void {
  const rigs = scope === 'deck' ? store.deck.rigs : store.state.planner.rigs;
  const rig = rigs.find((item) => item.id === id);
  if (!rig) return;

  if (key === 'name') {
    rig.name = rawValue;
    return;
  }

  const parsed = parseHuman(rawValue);
  if (Number.isFinite(parsed)) rig[key] = Math.max(0, parsed);
}

function setNumericBuff(buffs: BuffState, key: string, value: number): void {
  const numericKey = key as NumericBuffKey;
  if (!['tier', 'coolantLevel', 'prestigePct', 'auraPct', 'corePct', 'otherMult'].includes(numericKey)) return;
  buffs[numericKey] = Math.max(0, value);
}

function toggleFrame(buffs: BuffState, key: string): void {
  if (!['bronze', 'silver', 'gold', 'mixed'].includes(key)) return;
  const frame = key as FrameKey;
  buffs[frame] = !buffs[frame];
  if (frame !== 'mixed' && buffs[frame]) buffs.mixed = false;
}

app.addEventListener('input', (event: Event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;

  if (input.dataset.path) {
    const parsed = parseHuman(input.value);
    if (Number.isFinite(parsed)) {
      updateInputPath(input.dataset.path, parsed);
      saveAll();
    }
    return;
  }

  if (input.dataset.customBuff) {
    const [scopeValue, key] = input.dataset.customBuff.split(':');
    if (!isScope(scopeValue) || !key) return;
    const parsed = parseHuman(input.value);
    if (Number.isFinite(parsed)) {
      setNumericBuff(buffTarget(scopeValue), key, parsed);
      saveAll();
    }
    return;
  }

  if (input.dataset.rigField) {
    const [scopeValue, id, keyValue] = input.dataset.rigField.split(':');
    if (!isScope(scopeValue) || !id || !keyValue || !['name', 'qty', 'rate', 'synergy', 'slots'].includes(keyValue)) return;
    updateRigField(scopeValue, id, keyValue as RigField, input.value);
    saveAll();
    return;
  }

  if (input.dataset.preset) {
    const [id, key] = input.dataset.preset.split(':');
    const preset = id ? store.state.settings.rigPresets[id] : undefined;
    if (!preset || !key || !['rate', 'synergy', 'slots'].includes(key)) return;
    const parsed = parseHuman(input.value);
    if (Number.isFinite(parsed)) preset[key as 'rate' | 'synergy' | 'slots'] = Math.max(0, parsed);
    saveAll();
    return;
  }

  if (input.dataset.market) {
    const parsed = parseHuman(input.value);
    if (Number.isFinite(parsed)) {
      store.market[input.dataset.market] = Math.max(0, parsed);
      writeJson(STORAGE_KEYS.market, store.market);
    }
    return;
  }

  if (input.dataset.vialPrice) {
    const parsed = parseHuman(input.value);
    if (Number.isFinite(parsed)) {
      store.vials[input.dataset.vialPrice] = Math.max(0, parsed);
      writeJson(STORAGE_KEYS.vials, store.vials);
    }
  }
});

app.addEventListener('change', (event: Event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  if (input.dataset.cashoutDatetime) return;

  // Recompute only after editing finishes. Input events persist state without stealing focus.
  render();
});

app.addEventListener('click', (event: MouseEvent) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest<HTMLButtonElement>('button');
  if (!button) return;

  if (button.dataset.tab && ACTIVE_TABS.includes(button.dataset.tab as ActiveTab)) {
    store.state.activeTab = button.dataset.tab as ActiveTab;
    render();
    return;
  }

  if (button.dataset.viewScope && button.dataset.view) {
    if (button.dataset.viewScope === 'deck' && DECK_VIEWS.includes(button.dataset.view as DeckView)) {
      store.deck.view = button.dataset.view as DeckView;
      store.ui.readinessPage = 1;
    } else if (button.dataset.viewScope === 'planner' && PLANNER_VIEWS.includes(button.dataset.view as PlannerView)) {
      store.state.planner.view = button.dataset.view as PlannerView;
      store.ui.readinessPage = 1;
    }
    render();
    return;
  }

  if (button.dataset.potentialVial !== undefined) {
    store.state.reset.vialHours = Math.max(0, Number(button.dataset.potentialVial));
    render();
    return;
  }

  if (button.dataset.deckVial !== undefined) {
    store.deck.vialHours = Math.max(0, Number(button.dataset.deckVial));
    render();
    return;
  }

  if (button.dataset.plVial !== undefined) {
    store.state.planner.vialHours = Math.max(0, Number(button.dataset.plVial));
    render();
    return;
  }

  if (button.dataset.addQn) {
    store.deck.addedQns = Math.max(0, Math.floor(number(store.deck.addedQns))) + Math.max(0, Number(button.dataset.addQn));
    render();
    return;
  }

  if (button.hasAttribute('data-clear-qn')) {
    store.deck.addedQns = 0;
    render();
    return;
  }

  if (button.hasAttribute('data-toggle-vial-cost')) {
    store.deck.baseline.includeVialCost = !store.deck.baseline.includeVialCost;
    render();
    return;
  }

  if (button.dataset.buff) {
    const [scopeValue, key, rawValue] = button.dataset.buff.split(':');
    if (isScope(scopeValue) && key && rawValue !== undefined) setNumericBuff(buffTarget(scopeValue), key, Number(rawValue));
    render();
    return;
  }

  if (button.dataset.frame) {
    const [scopeValue, key] = button.dataset.frame.split(':');
    if (isScope(scopeValue) && key) toggleFrame(buffTarget(scopeValue), key);
    render();
    return;
  }

  if (button.dataset.addRig) {
    const [scopeValue, presetId] = button.dataset.addRig.split(':');
    if (isScope(scopeValue) && presetId) addRig(scopeValue, presetId);
    render();
    return;
  }

  const customScope = button.dataset.addCustom;
  if (isScope(customScope)) {
    addCustomRig(customScope);
    render();
    return;
  }

  if (button.dataset.removeRig) {
    const [scopeValue, id] = button.dataset.removeRig.split(':');
    if (isScope(scopeValue) && id) {
      const rigs: Rig[] = scopeValue === 'deck' ? store.deck.rigs : store.state.planner.rigs;
      const next = rigs.filter((rig) => rig.id !== id);
      if (scopeValue === 'deck') store.deck.rigs = next;
      else store.state.planner.rigs = next;
    }
    render();
    return;
  }

  if (button.hasAttribute('data-cashout-mark')) {
    markWithdrawnNow();
    store.ui.cashoutEditor = false;
    render();
    return;
  }

  if (button.hasAttribute('data-cashout-edit')) {
    store.ui.cashoutEditor = true;
    render();
    return;
  }

  if (button.hasAttribute('data-cashout-cancel')) {
    store.ui.cashoutEditor = false;
    render();
    return;
  }

  if (button.hasAttribute('data-cashout-save')) {
    const input = app.querySelector<HTMLInputElement>('[data-cashout-datetime]');
    const timestamp = input?.value ? new Date(input.value).getTime() : Number.NaN;
    if (setLastWithdrawal(timestamp)) {
      store.ui.cashoutEditor = false;
      render();
    }
    return;
  }

  if (button.hasAttribute('data-cashout-clear')) {
    clearCashoutCycle();
    store.ui.cashoutEditor = false;
    render();
    return;
  }

  if (button.dataset.readinessGroup) {
    store.ui.readinessGroup = clamp(Number(button.dataset.readinessGroup), 1, 5);
    store.ui.readinessPage = 1;
    render();
    return;
  }

  if (button.dataset.readinessPage) {
    store.ui.readinessPage = Math.max(1, Number(button.dataset.readinessPage));
    render();
    return;
  }

  if (button.dataset.costRef) {
    const [type, action] = button.dataset.costRef.split(':');
    if (type === 'cool') {
      store.costingReference.coolantLevel = action === 'reset'
        ? 0
        : clamp(store.costingReference.coolantLevel + Number(action), 0, 10);
    } else if (type === 'rack') {
      store.costingReference.rackSlots = action === 'reset'
        ? RACK_BASE_SLOTS
        : clamp(
          store.costingReference.rackSlots + Number(action) * RACK_SLOT_STEP,
          RACK_BASE_SLOTS,
          RACK_DISPLAY_LIMIT,
        );
      store.ui.rackPage = 1;
    }
    render();
    return;
  }

  if (button.dataset.rackPage) {
    store.ui.rackPage = Math.max(1, Number(button.dataset.rackPage));
    render();
    return;
  }

  if (button.hasAttribute('data-market-reset')) {
    store.market = { ...MARKET_DEFAULTS };
    store.vials = { ...VIAL_DEFAULTS };
    render();
    return;
  }

  if (button.hasAttribute('data-reset-all') && confirm('Reset all planner settings and inputs?')) {
    resetPlannerData();
    clearCashoutCycle();
    render();
  }
});

setInterval(() => {
  const remaining = cashoutRemainingSeconds();
  app.querySelectorAll<HTMLElement>('[data-live-cashout]').forEach((node) => {
    node.textContent = remaining !== null ? duration(remaining) : 'NOT SET';
  });
}, 1000);

render();
