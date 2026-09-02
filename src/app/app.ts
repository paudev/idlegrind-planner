import {
  MARKET_DEFAULTS,
  RACK_BASE_SLOTS,
  RACK_DISPLAY_LIMIT,
  RACK_SLOT_STEP,
  STORAGE_KEYS,
  VIAL_DEFAULTS,
} from './config/economy';
import {
  cashoutCycle,
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
import {
  cashoutMonthStart,
  cashoutPickerContent,
  type CashoutPickerScope,
} from './ui/cashout-picker';
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

function pickerRoot(scope: CashoutPickerScope): HTMLElement | null {
  return app.querySelector<HTMLElement>(`[data-cashout-picker="${scope}"]`);
}

function pickerDraft(root: HTMLElement): number {
  const value = Number(root.dataset.draft);
  return Number.isFinite(value) ? value : Date.now();
}

function pickerMonth(root: HTMLElement): number {
  const value = Number(root.dataset.month);
  return Number.isFinite(value) ? value : cashoutMonthStart(pickerDraft(root));
}

function refreshPicker(root: HTMLElement, draft: number, month = cashoutMonthStart(draft)): void {
  root.dataset.draft = String(draft);
  root.dataset.month = String(month);
  root.innerHTML = cashoutPickerContent(draft, month);
}

function closeCashoutPickers(except?: HTMLElement): void {
  app.querySelectorAll<HTMLElement>('[data-cashout-picker]').forEach((root) => {
    if (root !== except) root.hidden = true;
  });
}

function openCashoutPicker(scope: CashoutPickerScope): void {
  const root = pickerRoot(scope);
  if (!root) return;

  const draft = cashoutCycle().last ?? Date.now();
  refreshPicker(root, draft);
  closeCashoutPickers(root);
  root.hidden = false;
}

function selectPickerDay(root: HTMLElement, dayTimestamp: number): void {
  const selected = new Date(dayTimestamp);
  const draft = new Date(pickerDraft(root));
  draft.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());

  if (draft.getTime() > Date.now() + 60_000) {
    const now = new Date();
    draft.setHours(now.getHours(), now.getMinutes(), 0, 0);
  }

  refreshPicker(root, draft.getTime(), cashoutMonthStart(selected.getTime()));
}

function updatePickerTime(root: HTMLElement): void {
  const hourInput = root.querySelector<HTMLInputElement>('[data-cashout-picker-hour]');
  const minuteInput = root.querySelector<HTMLInputElement>('[data-cashout-picker-minute]');
  const activeMeridiem = root.querySelector<HTMLButtonElement>('[data-cashout-picker-meridiem].active');
  if (!hourInput || !minuteInput || !activeMeridiem) return;

  const hour12 = clamp(Math.floor(Number(hourInput.value)), 1, 12);
  const minute = clamp(Math.floor(Number(minuteInput.value)), 0, 59);
  const isPm = activeMeridiem.dataset.cashoutPickerMeridiem === 'PM';
  const hour24 = (hour12 % 12) + (isPm ? 12 : 0);
  const draft = new Date(pickerDraft(root));
  draft.setHours(hour24, minute, 0, 0);
  refreshPicker(root, draft.getTime(), pickerMonth(root));
}

function eventPathContainsCashoutControl(event: Event): boolean {
  return event.composedPath().some((node) => {
    if (!(node instanceof Element)) return false;
    return node.hasAttribute('data-cashout-picker') || node.hasAttribute('data-cashout-picker-open');
  });
}

app.addEventListener('input', (event: Event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;

  if (input.hasAttribute('data-cashout-picker-hour') || input.hasAttribute('data-cashout-picker-minute')) {
    return;
  }

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

  if (input.hasAttribute('data-cashout-picker-hour') || input.hasAttribute('data-cashout-picker-minute')) {
    const root = input.closest<HTMLElement>('[data-cashout-picker]');
    if (root) updatePickerTime(root);
    return;
  }

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

  if (button.dataset.addPlannerQn) {
    store.state.planner.extraQns = Math.max(0, Math.floor(number(store.state.planner.extraQns))) + Math.max(0, Number(button.dataset.addPlannerQn));
    render();
    return;
  }

  if (button.hasAttribute('data-clear-planner-qn')) {
    store.state.planner.extraQns = 0;
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
    render();
    return;
  }

  if (button.dataset.cashoutPickerOpen === 'header' || button.dataset.cashoutPickerOpen === 'settings') {
    openCashoutPicker(button.dataset.cashoutPickerOpen);
    return;
  }

  if (button.hasAttribute('data-cashout-settings')) {
    store.state.activeTab = 'settings';
    render();
    return;
  }

  if (button.hasAttribute('data-cashout-picker-close')) {
    const root = button.closest<HTMLElement>('[data-cashout-picker]');
    if (root) root.hidden = true;
    return;
  }

  if (button.dataset.cashoutPickerMonth) {
    const root = button.closest<HTMLElement>('[data-cashout-picker]');
    if (!root) return;
    const month = new Date(pickerMonth(root));
    month.setMonth(month.getMonth() + Number(button.dataset.cashoutPickerMonth));
    refreshPicker(root, pickerDraft(root), cashoutMonthStart(month.getTime()));
    return;
  }

  if (button.dataset.cashoutPickerDay) {
    const root = button.closest<HTMLElement>('[data-cashout-picker]');
    if (root) selectPickerDay(root, Number(button.dataset.cashoutPickerDay));
    return;
  }

  if (button.dataset.cashoutPickerMeridiem) {
    const root = button.closest<HTMLElement>('[data-cashout-picker]');
    if (!root) return;
    root.querySelectorAll<HTMLButtonElement>('[data-cashout-picker-meridiem]').forEach((item) => {
      item.classList.toggle('active', item === button);
    });
    updatePickerTime(root);
    return;
  }

  if (button.hasAttribute('data-cashout-picker-now')) {
    const root = button.closest<HTMLElement>('[data-cashout-picker]');
    if (root) refreshPicker(root, Date.now());
    return;
  }

  if (button.hasAttribute('data-cashout-picker-save')) {
    const root = button.closest<HTMLElement>('[data-cashout-picker]');
    if (!root) return;
    if (setLastWithdrawal(pickerDraft(root))) render();
    return;
  }

  if (button.hasAttribute('data-cashout-clear')) {
    clearCashoutCycle();
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

document.addEventListener('click', (event: MouseEvent) => {
  // Use the original event path instead of querying the live DOM. Calendar actions
  // rebuild their inner markup during the same click, which detaches event.target.
  // composedPath() remains stable and correctly identifies the click as internal.
  if (eventPathContainsCashoutControl(event)) return;
  closeCashoutPickers();
});

document.addEventListener('keydown', (event: KeyboardEvent) => {
  if (event.key === 'Escape') closeCashoutPickers();
});

setInterval(() => {
  const remaining = cashoutRemainingSeconds();
  app.querySelectorAll<HTMLElement>('[data-live-cashout]').forEach((node) => {
    node.textContent = remaining !== null ? duration(remaining) : 'NOT SET';
  });
}, 1000);

render();
