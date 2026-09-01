import {
  cashoutCycle,
  cashoutRemainingSeconds,
  deviceTimezone,
  formatLocalTime,
  nextCashoutAt,
  toDatetimeLocal,
} from '../core/cashout';
import { compact, duration, number } from '../core/format';
import { store } from '../core/state';
import type { ActiveTab } from '../types';
import { info } from './components';

export function cashoutEditor(): string {
  const cycle = cashoutCycle();
  return `<div class="cashout-editor">
    <label class="field">
      <span>LAST WITHDRAWAL · ${deviceTimezone()}</span>
      <input type="datetime-local" data-cashout-datetime value="${toDatetimeLocal(cycle.last)}">
    </label>
    <div>${info('Entered time is interpreted in this device timezone, then stored as an absolute timestamp. Eligibility is exactly 24 elapsed hours.')}</div>
    <div class="editor-actions">
      <button type="button" class="chip active" data-cashout-save>SAVE</button>
      <button type="button" class="chip" data-cashout-cancel>CANCEL</button>
    </div>
  </div>`;
}

export function header(): string {
  const cycle = cashoutCycle();
  const next = nextCashoutAt(cycle);
  const remaining = cashoutRemainingSeconds(cycle);
  const ready = remaining !== null && remaining <= 0;
  const refine = number(store.state.settings.refineRate) > 0
    ? `${compact(store.state.settings.refineRate, 1)} / $GRIND`
    : 'NOT SET';

  return `<header class="topbar">
    <div class="brand">IDLE<span>//</span>GRIND</div>
    <div class="topfacts">
      <div class="refine-fact">
        <small>REFINE</small>
        <strong>${refine}</strong>
      </div>
      <div class="cashout-head ${ready ? 'ready' : ''}">
        <div class="cashout-copy">
          <small>${ready ? 'CASHOUT READY' : 'NEXT CASHOUT'}</small>
          <strong data-live-cashout>${next !== null ? duration(remaining) : 'NOT SET'}</strong>
          <span>${next !== null ? `${formatLocalTime(next, false)} · local` : 'Record your last withdrawal'}</span>
        </div>
        <div class="cashout-actions">
          <button type="button" data-cashout-mark>MARK WITHDRAWN</button>
          <button type="button" data-cashout-edit>${next !== null ? 'EDIT' : 'SET'}</button>
          ${cycle.previous !== null ? '<button type="button" data-cashout-undo>UNDO</button>' : ''}
        </div>
      </div>
    </div>
  </header>${store.ui.cashoutEditor ? cashoutEditor() : ''}`;
}

export function shell(body: string): string {
  const tabs: Array<[ActiveTab, string]> = [
    ['target', 'TARGET RATE'],
    ['reset', 'POTENTIAL EARNING'],
    ['current', 'DECK SIMULATOR'],
    ['planner', 'BUILD PLANNER'],
    ['costing', 'COSTING'],
    ['settings', 'SETTINGS'],
  ];

  return `<div class="rd-shell">
    ${header()}
    <nav class="tabs">
      ${tabs.map(([id, label]) => `<button type="button" class="navbtn ${store.state.activeTab === id ? 'active' : ''}" data-tab="${id}">${label}</button>`).join('')}
    </nav>
    <main>${body}</main>
    <footer>LOCAL PLANNER · VALUES ARE SAVED IN THIS BROWSER · NOT AFFILIATED WITH THE GAME</footer>
  </div>`;
}
