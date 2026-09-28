import {
  cashoutCycle,
  cashoutRemainingSeconds,
  formatLocalTime,
  nextCashoutAt,
} from '../core/cashout';
import { compact, duration, number } from '../core/format';
import { store } from '../core/state';
import { activeProfile } from '../core/profile';
import type { ActiveTab, PlannerProfile } from '../types';
import { cashoutPickerPopover } from './cashout-picker';

function profileGlyph(profile: PlannerProfile): string {
  return profile === 'solana'
    ? '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M5 3.5h17l-4 4H1zM2 10h17l3 4H5zM5 16.5h17l-4 4H1z"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M19.8 3.2c-7.8.1-12.5 4.7-13.2 10.9l-.3 3.4 3.2-1c5.9-1.8 9-6.2 10.3-13.3Z"/><path d="M4.2 20.6c3.2-4.4 6.7-8 11.6-11.6" fill="none" stroke="#0b120d" stroke-width="1.5" stroke-linecap="round"/></svg>';
}

export function header(): string {
  const cycle = cashoutCycle();
  const next = nextCashoutAt(cycle);
  const remaining = cashoutRemainingSeconds(cycle);
  const ready = remaining !== null && remaining <= 0;
  const refine = number(store.state.settings.refineRate) > 0
    ? `${compact(store.state.settings.refineRate, 1)} / $GRIND`
    : 'NOT SET';
  const pickerTimestamp = cycle.last ?? Date.now();
  const profile = activeProfile();

  return `<header class="topbar">
    <div class="brand">IDLE<span>//</span>GRIND</div>
    <div class="topfacts">
      <div class="refine-fact">
        <div class="refine-copy">
          <small>REFINE</small>
          <strong>${refine}</strong>
        </div>
      </div>
      <details class="profile-picker" data-profile-picker>
        <summary class="profile-trigger" aria-label="Current workspace: ${profile === 'solana' ? 'Solana' : 'Robinhood'}. Choose workspace">
          <span class="profile-glyph ${profile}" aria-hidden="true">${profileGlyph(profile)}</span>
          <span class="profile-name">${profile === 'solana' ? 'Solana' : 'Robinhood'}</span>
          <svg class="profile-chevron" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="m3.5 6 4.5 4 4.5-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </summary>
        <div class="profile-menu" role="group" aria-label="Choose planner workspace">
          <small class="profile-menu-title">SWITCH WORKSPACE</small>
          <button type="button" class="profile-option ${profile === 'solana' ? 'active' : ''}" data-profile="solana" aria-pressed="${profile === 'solana'}">
            <span class="profile-glyph solana" aria-hidden="true">${profileGlyph('solana')}</span>
            <span class="profile-option-copy"><strong>Solana</strong><small>${profile === 'solana' ? 'Current workspace' : 'Separate saved setup'}</small></span>
            <span class="profile-check" aria-hidden="true">✓</span>
          </button>
          <button type="button" class="profile-option ${profile === 'robinhood' ? 'active' : ''}" data-profile="robinhood" aria-pressed="${profile === 'robinhood'}">
            <span class="profile-glyph robinhood" aria-hidden="true">${profileGlyph('robinhood')}</span>
            <span class="profile-option-copy"><strong>Robinhood</strong><small>${profile === 'robinhood' ? 'Current workspace' : 'Separate saved setup'}</small></span>
            <span class="profile-check" aria-hidden="true">✓</span>
          </button>
        </div>
      </details>
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
          <button type="button" class="cashout-icon-action" data-cashout-picker-open="header" aria-label="${next !== null ? 'Edit cashout date and time' : 'Set cashout date and time'}" title="${next !== null ? 'Edit cashout date and time' : 'Set cashout date and time'}">
            <svg class="cashout-action-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4.25" y="5.5" width="15.5" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 3.75v3.5M16 3.75v3.5M4.5 9.25h15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            <span class="cashout-action-label">${next !== null ? 'EDIT' : 'SET'}</span>
          </button>
          ${next !== null ? '<button type="button" class="cashout-icon-action" data-cashout-clear aria-label="Clear cashout timing" title="Clear cashout timing"><svg class="cashout-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.75 6.75l10.5 10.5m0-10.5l-10.5 10.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span class="cashout-action-label">CLEAR</span></button>' : ''}
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
    <footer>LOCAL PLANNER · SOLANA AND ROBINHOOD SAVED SEPARATELY IN THIS BROWSER · NOT AFFILIATED WITH THE GAME</footer>
  </div>`;
}
