import { DAY, HOUR } from '../config/economy';
import { TIER_OPTIONS, VIAL_OPTIONS } from '../config/game';
import {
  cashoutCycle,
  cashoutRemainingSeconds,
  deviceTimezone,
  formatLocalTime,
  nextCashoutAt,
} from '../core/cashout';
import { production } from '../core/calculations';
import { clamp, compact, duration, number } from '../core/format';
import { holderTierRefineDiscountPct, holderTierRefineRate } from '../core/refine-discounts';
import { store } from '../core/state';
import { chip, choiceRow, field, intro, metric, pageStack, panel } from '../ui/components';

export function renderPotentialView(): string {
  const cycle = cashoutCycle();
  const next = nextCashoutAt(cycle);
  const remaining = cashoutRemainingSeconds(cycle);
  const ready = remaining !== null && remaining <= 0;
  const rate = Math.max(0, number(store.state.reset.finalRate));
  const vialHours = clamp(number(store.state.reset.vialHours), 0, 24);
  const currentRefine = Math.max(0, number(store.state.settings.refineRate));
  const tier = number(store.state.reset.tier, 1);
  const tierPct = holderTierRefineDiscountPct(tier);
  const refine = holderTierRefineRate(currentRefine, tier);
  const windowProjection = remaining !== null
    ? production(rate, remaining, vialHours * HOUR)
    : null;
  const fullDay = production(rate, DAY, vialHours * HOUR);
  const grind = (grit: number): number | null => refine >= 1000 ? grit / refine : null;
  const cashoutGrind = windowProjection ? grind(windowProjection.grit) : null;
  const fullDayGrind = grind(fullDay.grit);

  const vialButtons = VIAL_OPTIONS.map((hours) => chip(
    hours ? `⚡ ${hours}H` : 'NO VIAL',
    vialHours === hours,
    `data-potential-vial="${hours}"`,
    hours ? 'orange' : '',
  )).join('');

  const tierChoices = TIER_OPTIONS.map((option) => {
    const label = option.refinePct ? `${option.label} · −${option.refinePct}% REFINE` : option.label;
    return `<label class="chip ${Math.abs(tier - option.mult) < 1e-9 ? 'active' : ''}">
      <input type="radio" hidden name="potential-holder-tier" data-path="state.reset.tier" value="${option.mult}" ${Math.abs(tier - option.mult) < 1e-9 ? 'checked' : ''}>
      ${label}
    </label>`;
  }).join('');

  return pageStack(
    intro(
      'POTENTIAL EARNING',
      'Project production until your personal rolling cashout becomes available using the current game refine rate and selected holder-tier refinery discount.',
    ),
    panel(
      '1 // CASHOUT WINDOW',
      'Your next eligibility is exactly 24 elapsed hours after the last withdrawal.',
      `<div class="result-hero-pair">
        <div class="result-hero ${ready ? 'simulated' : ''}">
          <small>NEXT CASHOUT</small>
          <strong>${next !== null ? duration(remaining) : 'NOT SET'}</strong>
          <p>${next !== null ? formatLocalTime(next) : 'Set your last withdrawal to activate this window.'}</p>
        </div>
        <div class="result-hero">
          <small>LAST WITHDRAWAL</small>
          <strong>${cycle.last !== null ? formatLocalTime(cycle.last) : '—'}</strong>
          <p>${deviceTimezone()} · current device timezone</p>
        </div>
      </div>
      <div class="page-actions">
        <button type="button" class="chip active" data-cashout-mark>WITHDRAWN</button>
        <button type="button" class="chip" data-cashout-settings>${cycle.last !== null ? 'EDIT IN SETTINGS' : 'SET IN SETTINGS'}</button>
      </div>`,
      next !== null ? duration(remaining) : 'NOT SET',
    ),
    panel(
      '2 // PRODUCTION INPUT',
      'Use your expected normal production rate, holder tier, and optional overclock vial.',
      `<div class="input-section">
        ${field('state.reset.finalRate', 'NORMAL GRIT / SECOND', rate)}
        ${choiceRow(
          'HOLDER TIER',
          tierChoices,
          'This changes GRIT → $GRIND conversion only. Enter NORMAL GRIT / SECOND as your already-final normal production rate so the tier hash multiplier is not double-counted.',
        )}
        ${choiceRow('OVERCLOCK', vialButtons, 'Vial hours run at 2× from now.')}
      </div>`,
    ),
    panel(
      '3 // CASHOUT PROJECTION',
      ready
        ? 'Cashout is already available. The current-window incremental projection is zero; the 24H benchmark remains useful.'
        : 'Additional production from now until your next eligible cashout.',
      `<div class="result-hero-pair">
        <div class="result-hero simulated">
          <small>BY NEXT CASHOUT</small>
          <strong>${windowProjection ? `${compact(windowProjection.grit)}<em> GRIT</em>` : '—'}</strong>
          <p>${windowProjection ? `${duration(windowProjection.overclock, { ready: false })} at 2× · ${duration(windowProjection.normal, { ready: false })} normal` : 'Set last withdrawal to calculate.'}</p>
        </div>
        <div class="result-hero">
          <small>FULL 24H PROJECTION</small>
          <strong>${compact(fullDay.grit)}<em> GRIT</em></strong>
          <p>${compact(fullDay.average)}/s effective · ${fullDayGrind !== null ? `${compact(fullDayGrind)} $GRIND` : 'set refine rate'}</p>
        </div>
      </div>
      <div class="metric-grid">
        ${metric('NORMAL RATE', `${compact(rate)}/s`)}
        ${metric('2× RATE', `${compact(rate * 2)}/s`, 'orange')}
        ${metric('HOLDER REFINE', refine >= 1000 ? `${compact(refine)} GRIT` : '—', tierPct ? 'green' : '', tierPct ? `${compact(currentRefine)} current rate − ${tierPct}% holder discount.` : 'Current game refine rate; no holder discount on this tier.')}
        ${metric('EST. $GRIND BY NEXT CASHOUT', cashoutGrind !== null ? compact(cashoutGrind) : '—', 'green')}
      </div>`,
      cashoutGrind !== null ? `${compact(cashoutGrind, 2)} $GRIND` : '',
    ),
  );
}
