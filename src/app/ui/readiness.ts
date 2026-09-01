import { QN_BASE_PRICE, QN_PRICE_GROWTH, ROWS_PER_PAGE } from '../config/economy';
import { formatLocalTime } from '../core/cashout';
import { clamp, compact, duration, number } from '../core/format';
import { store } from '../core/state';
import type { FundingRow, Scope } from '../types';
import { chip, info, metric, panel, table } from './components';

interface ReadinessIssue {
  label: string;
  message: string;
}

interface ReadinessOptions {
  scope: Scope;
  requestedQns: number;
  startingGrit: number;
  startingRate: number;
  timeline: FundingRow[];
  fullBuildTime: number;
  subtitle: string;
  introText: string;
  rateLabel?: string;
  issues?: ReadinessIssue[];
  pricingNote?: string;
}

interface ReadinessGroup {
  first: number;
  last: number;
  count: number;
  cost: number;
  totalCost: number;
  wait: number;
  time: number;
  rate: number;
  overclock: boolean;
}

function setupRequired(scope: Scope, issues: ReadinessIssue[], introText: string): string {
  return `${panel(
    'QN READINESS',
    'Sequential Quantum Node purchase timing for this setup.',
    info(introText),
  )}${panel(
    'SETUP REQUIRED',
    'Set the items below and this view will populate automatically.',
    `<div class="setup-list">
      ${issues.map((issue) => `<div><small>${issue.label}</small><strong>${issue.message}</strong></div>`).join('')}
    </div>
    <button type="button" class="chip active" data-view-scope="${scope}" data-view="output">OPEN OUTPUT SETUP</button>`,
    `${issues.length} TO SET`,
  )}`;
}

export function renderQnReadiness(options: ReadinessOptions): string {
  const requestedQns = Math.max(0, Math.floor(number(options.requestedQns)));
  const issues = options.issues ?? [];

  if (issues.length) return setupRequired(options.scope, issues, options.introText);

  if (requestedQns <= 0) {
    return panel(
      'QN READINESS',
      options.subtitle,
      `${info(options.introText)}${info('This build does not require any Quantum Nodes, so there is no purchase timeline to display.')}`,
      '0 QNs',
    );
  }

  const groupSize = clamp(Math.floor(number(store.ui.readinessGroup, 1)), 1, 5);
  const groups: ReadinessGroup[] = [];

  for (let index = 0; index < options.timeline.length; index += groupSize) {
    const slice = options.timeline.slice(index, index + groupSize);
    const first = slice[0];
    const last = slice.at(-1);
    if (!first || !last || last.unreachable) break;

    const previousTime = index ? options.timeline[index - 1]?.time ?? 0 : 0;
    groups.push({
      first: first.to,
      last: last.to,
      count: slice.length,
      cost: slice.reduce((sum, row) => sum + row.cost, 0),
      totalCost: last.totalCost,
      wait: last.time - previousTime,
      time: last.time,
      rate: last.rateAfter,
      overclock: last.overclockActive,
    });
  }

  const pages = Math.max(1, Math.ceil(groups.length / ROWS_PER_PAGE));
  store.ui.readinessPage = clamp(Math.floor(number(store.ui.readinessPage, 1)), 1, pages);
  const start = (store.ui.readinessPage - 1) * ROWS_PER_PAGE;
  const visible = groups.slice(start, start + ROWS_PER_PAGE);

  const rows = visible.map((group) => `<tr>
    <th>${group.first === group.last ? `QN ${group.first}` : `QN ${group.first}–${group.last}`}<small>${group.count} QN${group.count === 1 ? '' : 's'} in this row</small></th>
    <td class="negative">−${compact(group.cost)} GRIT<small>Total to here: ${compact(group.totalCost)} GRIT</small></td>
    <td>${duration(group.wait)}<small>Since previous purchase group</small></td>
    <td>${duration(group.time)}<small>Total wait from now</small></td>
    <td>${formatLocalTime(Date.now() + group.time * 1000, false)}<small>Estimated local ready time</small></td>
    <td>${compact(group.rate)}/s<small>${group.overclock ? `2× ${compact(group.rate * 2)}/s while active` : 'Normal rate after purchase'}</small></td>
  </tr>`);

  const buyableNow = options.timeline.filter((row) => !row.unreachable && row.time <= 0.5).length;
  const pricingNote = options.pricingNote
    ?? `Pricing assumption: <b>${compact(QN_BASE_PRICE)} GRIT × ${QN_PRICE_GROWTH}^owned</b>. Purchases are sequential.`;

  const groupControls = `<div class="groupbar readiness-groupbar">
    <div>
      <small>GROUP TABLE ROWS BY</small>
      <span>Grouping changes display only. QNs are still purchased one at a time.</span>
    </div>
    <div class="choices">
      ${[1, 2, 3, 4, 5].map((count) => chip(`${count} QN${count === 1 ? '' : 's'}`, groupSize === count, `data-readiness-group="${count}"`)).join('')}
    </div>
  </div>`;

  const pagination = pages > 1 ? `<div class="pagination">
    <button type="button" data-readiness-page="${store.ui.readinessPage - 1}" ${store.ui.readinessPage <= 1 ? 'disabled' : ''}>PREVIOUS</button>
    <span>PAGE <b>${store.ui.readinessPage}</b> / ${pages}</span>
    <button type="button" data-readiness-page="${store.ui.readinessPage + 1}" ${store.ui.readinessPage >= pages ? 'disabled' : ''}>NEXT</button>
    <small>ROWS ${start + 1}–${Math.min(start + ROWS_PER_PAGE, groups.length)} OF ${groups.length}</small>
  </div>` : '';

  return `${panel(
    'QN READINESS',
    options.subtitle,
    `<div class="metric-grid readiness-summary-grid">
      ${metric('STARTING GRIT', `${compact(options.startingGrit)} GRIT`)}
      ${metric('BUYABLE NOW', `${buyableNow} / ${requestedQns}`, buyableNow > 0 ? 'green' : '')}
      ${metric(options.rateLabel ?? 'STARTING NORMAL RATE', `${compact(options.startingRate)}/s`)}
      ${metric(`ALL ${requestedQns} QNs READY`, duration(options.fullBuildTime))}
    </div>
    ${info(pricingNote)}`,
  )}${panel(
    'QN PURCHASE READINESS',
    `${ROWS_PER_PAGE} rows per page. Grouping controls apply directly to the table below.`,
    `${groupControls}
    ${table(['QN', 'GRIT COST', 'WAIT FROM PREVIOUS', 'CUMULATIVE WAIT', 'READY AT', 'NORMAL RATE AFTER'], rows, 'readiness-table')}
    ${pagination}`,
    `${groups.length} ROW${groups.length === 1 ? '' : 'S'}`,
  )}`;
}
