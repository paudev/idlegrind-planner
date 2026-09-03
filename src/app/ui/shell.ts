import {
  cashoutCycle,
  cashoutRemainingSeconds,
  formatLocalTime,
  nextCashoutAt,
} from '../core/cashout';
import { compact, duration, number } from '../core/format';
import { store } from '../core/state';
import type { ActiveTab } from '../types';
import { cashoutPickerPopover } from './cashout-picker';

export function header(): string {
  const cycle = cashoutCycle();
  const next = nextCashoutAt(cycle);
  const remaining = cashoutRemainingSeconds(cycle);
  const ready = remaining !== null && remaining <= 0;
  const refine = number(store.state.settings.refineRate) > 0
    ? `${compact(store.state.settings.refineRate, 1)} / $GRIND`
    : 'NOT SET';
  const pickerTimestamp = cycle.last ?? Date.now();

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
          <span class="cashout-meta">
            <span class="cashout-date">${next !== null ? `${formatLocalTime(next, false)} · local` : 'Set your last cashout to start the 24h cycle'}</span>
            <span class="cashout-mobile-refine"><b>REFINE</b>${refine}</span>
          </span>
        </div>
        <div class="cashout-actions">
          <button type="button" class="cashout-withdrawn-action" data-cashout-mark>WITHDRAW</button>
          <button type="button" class="cashout-icon-action" data-cashout-picker-open="header" aria-label="${next !== null ? 'Edit cashout timing' : 'Set cashout timing'}" title="${next !== null ? 'Edit cashout timing' : 'Set cashout timing'}">
            <svg class="cashout-action-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.25" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M12 7.5v5l3.25 2" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span class="cashout-action-label">${next !== null ? 'EDIT' : 'SET'}</span>
          </button>
          ${next !== null ? '<button type="button" class="cashout-icon-action" data-cashout-clear aria-label="Clear cashout timing" title="Clear cashout timing"><svg class="cashout-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 7.5l9 9m0-9l-9 9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><span class="cashout-action-label">CLEAR</span></button>' : ''}
        </div>
        ${cashoutPickerPopover('header', pickerTimestamp)}
      </div>
    </div>
  </header>`;
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
