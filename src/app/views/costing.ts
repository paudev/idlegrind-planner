import {
  COOLANT_COSTS,
  FORGE_ROWS,
  RACK_BASE_SLOTS,
  RACK_DISPLAY_LIMIT,
  RACK_PRICE_STEP,
  RACK_SLOT_STEP,
  ROWS_PER_PAGE,
} from '../config/economy';
import { rackPackCount } from '../core/calculations';
import { clamp, compact, escapeHtml, number } from '../core/format';
import { store } from '../core/state';
import { intro, pageStack, panel } from '../ui/components';

interface ReferenceRows {
  coolant: string[];
  rack: string[];
  rackCount: number;
  pages: number;
  start: number;
}

function referenceTable(
  headers: string[],
  rows: string[],
  rowSlots: number,
  viewportClass: string,
  emptyMessage: string,
): string {
  const body = rows.length
    ? [...rows]
    : [`<tr class="reference-empty-row"><td colspan="${headers.length}">${escapeHtml(emptyMessage)}</td></tr>`];

  while (body.length < rowSlots) {
    body.push(`<tr class="reference-placeholder" aria-hidden="true"><td colspan="${headers.length}">&nbsp;</td></tr>`);
  }

  return `<div class="reference-table-scroll ${viewportClass}">
    <table class="interactive-ref-table">
      <thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead>
      <tbody>${body.join('')}</tbody>
    </table>
  </div>`;
}

function referenceRows(): ReferenceRows {
  const coolant: string[] = [];
  let running = 0;

  for (let level = store.costingReference.coolantLevel + 1; level <= 10; level += 1) {
    const cost = COOLANT_COSTS[level] ?? 0;
    running += cost;
    coolant.push(`<tr>
      <th>LEVEL ${level} · +${level * 10}%</th>
      <td>${compact(cost)} $GRIND</td>
      <td>${compact(running)} $GRIND</td>
    </tr>`);
  }

  const currentPacks = rackPackCount(store.costingReference.rackSlots);
  const rack: string[] = [];
  running = 0;

  for (let pack = currentPacks + 1; ; pack += 1) {
    const capacity = RACK_BASE_SLOTS + pack * RACK_SLOT_STEP;
    if (capacity > RACK_DISPLAY_LIMIT) break;

    const cost = RACK_PRICE_STEP * pack;
    running += cost;
    rack.push(`<tr>
      <th>+6 RACK SLOTS</th>
      <td>${capacity} slots</td>
      <td>${compact(cost)} $GRIND</td>
      <td>${compact(running)} $GRIND</td>
    </tr>`);
  }

  const pages = Math.max(1, Math.ceil(rack.length / ROWS_PER_PAGE));
  store.ui.rackPage = clamp(Math.floor(number(store.ui.rackPage, 1)), 1, pages);
  const start = (store.ui.rackPage - 1) * ROWS_PER_PAGE;

  return {
    coolant,
    rack: rack.slice(start, start + ROWS_PER_PAGE),
    rackCount: rack.length,
    pages,
    start,
  };
}

function coolantStepper(coolant: number): string {
  return `<div class="reference-stepper">
    <span class="reference-stepper-label">CURRENT</span>
    <div class="reference-stepper-control">
      <button type="button" class="reference-step-action" data-cost-ref="cool:-1" ${coolant <= 0 ? 'disabled' : ''} aria-label="Decrease coolant level">−</button>
      <strong>${coolant ? `LEVEL ${coolant} · +${coolant * 10}%` : 'OFF'}</strong>
      <button type="button" class="reference-step-action" data-cost-ref="cool:1" ${coolant >= 10 ? 'disabled' : ''} aria-label="Increase coolant level">+</button>
    </div>
    <button type="button" class="reference-reset" data-cost-ref="cool:reset">RESET</button>
  </div>`;
}

function rackStepper(rackSlots: number): string {
  return `<div class="reference-stepper">
    <span class="reference-stepper-label">CURRENT</span>
    <div class="reference-stepper-control">
      <button type="button" class="reference-step-action wide" data-cost-ref="rack:-1" ${rackSlots <= RACK_BASE_SLOTS ? 'disabled' : ''} aria-label="Remove six rack slots">−6</button>
      <strong>${rackSlots} SLOTS</strong>
      <button type="button" class="reference-step-action wide" data-cost-ref="rack:1" ${rackSlots >= RACK_DISPLAY_LIMIT ? 'disabled' : ''} aria-label="Add six rack slots">+6</button>
    </div>
    <button type="button" class="reference-reset" data-cost-ref="rack:reset">BASE</button>
  </div>`;
}

export function renderCostingView(): string {
  const rows = referenceRows();
  const coolant = store.costingReference.coolantLevel;
  const rackSlots = store.costingReference.rackSlots;

  const coolantTable = referenceTable(
    ['LEVEL', 'PRICE', 'CUMULATIVE FROM CURRENT'],
    rows.coolant,
    10,
    'coolant-reference-table',
    'All coolant levels are already included.',
  );

  const rackTable = referenceTable(
    ['UPGRADE', 'CAPACITY', 'PRICE', 'CUMULATIVE FROM CURRENT'],
    rows.rack,
    ROWS_PER_PAGE,
    'rack-reference-table',
    'No additional rack-slot upgrades remain in the reference range.',
  );

  const forgeTable = referenceTable(
    ['FORGE', 'PRICE', 'NOTE'],
    FORGE_ROWS.map(([name, cost, note]) => `<tr><th>${name}</th><td>${compact(cost)} $GRIND</td><td>${note}</td></tr>`),
    FORGE_ROWS.length,
    'forge-reference-table',
    'No forge references configured.',
  );

  return pageStack(
    intro(
      'COSTING',
      'Interactive reference only. Set what you already have; remaining upgrades and cumulative cost recalculate from that point.',
    ),
    panel(
      'COOLANT',
      'Only levels above your current selection are shown.',
      `${coolantStepper(coolant)}${coolantTable}`,
    ),
    panel(
      'RACK SLOT EXPANSION',
      '12 base slots; every upgrade adds +6. The reference extends through the last valid step below 350: 348 slots.',
      `${rackStepper(rackSlots)}
      ${rackTable}
      ${rows.pages > 1 ? `<div class="reference-pagination">
        <span class="reference-page-range">ROWS ${rows.start + 1}–${Math.min(rows.start + ROWS_PER_PAGE, rows.rackCount)} OF ${rows.rackCount}</span>
        <div class="reference-page-actions">
          <button type="button" data-rack-page="${store.ui.rackPage - 1}" ${store.ui.rackPage <= 1 ? 'disabled' : ''}>PREVIOUS</button>
          <strong>PAGE ${store.ui.rackPage} / ${rows.pages}</strong>
          <button type="button" data-rack-page="${store.ui.rackPage + 1}" ${store.ui.rackPage >= rows.pages ? 'disabled' : ''}>NEXT</button>
        </div>
      </div>` : ''}`,
    ),
    panel(
      'FORGE',
      'Known forge fees used by planner costing.',
      forgeTable,
    ),
  );
}
