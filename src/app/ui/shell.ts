import {
  cashoutCycle,
  cashoutRemainingSeconds,
  deviceTimezone,
  formatLocalTime,
  nextCashoutAt,
  toLocalDateInput,
  toLocalTimeInput,
} from '../core/cashout';
import { compact, duration, number } from '../core/format';
import { store } from '../core/state';
import type { ActiveTab } from '../types';

export function cashoutEditor(): string {
  const cycle = cashoutCycle();
  const editorTimestamp = cycle.last ?? Date.now();
  const previewNext = editorTimestamp + 24 * 60 * 60 * 1000;

  return `<div class="cashout-editor">
    <div class="cashout-editor-head">
      <div>
        <small>LAST WITHDRAWAL</small>
        <strong>Set the local date and time</strong>
      </div>
      <span class="cashout-timezone">LOCAL · ${deviceTimezone()}</span>
    </div>
    <div class="cashout-editor-grid">
      <div class="cashout-datetime-grid">
        <label class="cashout-datetime-field">
          <span>DATE</span>
          <input type="date" data-cashout-date value="${toLocalDateInput(editorTimestamp)}">
        </label>
        <label class="cashout-datetime-field">
          <span>TIME</span>
          <input type="time" data-cashout-time value="${toLocalTimeInput(editorTimestamp)}" step="60">
        </label>
      </div>
      <div class="cashout-preview">
        <small>NEXT CASHOUT</small>
        <strong data-cashout-preview>${formatLocalTime(previewNext)}</strong>
        <span data-cashout-editor-message>Exactly 24 elapsed hours after this withdrawal.</span>
      </div>
      <div class="editor-actions">
        <button type="button" class="chip active" data-cashout-save>SAVE</button>
        <button type="button" class="chip" data-cashout-cancel>CANCEL</button>
      </div>
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
          <button type="button" data-cashout-mark>WITHDRAWN</button>
          <button type="button" data-cashout-edit>${next !== null ? 'EDIT' : 'SET'}</button>
          ${next !== null ? '<button type="button" data-cashout-clear>CLEAR</button>' : ''}
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
