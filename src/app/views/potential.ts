import { DAY, HOUR } from '../config/economy';
import { VIAL_OPTIONS } from '../config/game';
import {
  cashoutCycle,
  cashoutRemainingSeconds,
  deviceTimezone,
  formatLocalTime,
  nextCashoutAt,
} from '../core/cashout';
import { production } from '../core/calculations';
import { compact, duration, number } from '../core/format';
import { store } from '../core/state';
import { chip, choiceRow, field, intro, metric, pageStack, panel } from '../ui/components';

export function renderPotentialView(): string {
  const cycle = cashoutCycle();
  const next = nextCashoutAt(cycle);
  const remaining = cashoutRemainingSeconds(cycle);
  const ready = remaining !== null && remaining <= 0;
  const rate = Math.max(0, number(store.state.reset.finalRate));
  const vialHours = Math.max(0, number(store.state.reset.vialHours));
  const refine = Math.max(0, number(store.state.settings.refineRate));
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

  return pageStack(
    intro(
      'POTENTIAL EARNING',
      'Project production until your personal rolling cashout becomes available. The cashout window is 24 hours after your last withdrawal, not a server clock.',
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
        <button type="button" class="chip active" data-cashout-mark>MARK WITHDRAWN NOW</button>
        <button type="button" class="chip" data-cashout-edit>${cycle.last !== null ? 'EDIT LAST WITHDRAWAL' : 'SET LAST WITHDRAWAL'}</button>
      </div>`,
      next !== null ? duration(remaining) : 'NOT SET',
    ),
    panel(
      '2 // PRODUCTION INPUT',
      'Use your expected normal production rate and optional overclock vial.',
      `<div class="input-section">
        ${field('state.reset.finalRate', 'NORMAL GRIT / SECOND', rate)}
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
        ${metric('TIME TO CASHOUT', next !== null ? duration(remaining) : '—')}
        ${metric('EST. $GRIND BY NEXT CASHOUT', cashoutGrind !== null ? compact(cashoutGrind) : '—', 'green')}
      </div>`,
      cashoutGrind !== null ? `${compact(cashoutGrind, 2)} $GRIND` : '',
    ),
  );
}
