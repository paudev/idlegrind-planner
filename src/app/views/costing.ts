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
import { clamp, compact, number } from '../core/format';
import { store } from '../core/state';
import { intro, pageStack, panel, table } from '../ui/components';

interface ReferenceRows {
  coolant: string[];
  rack: string[];
  rackCount: number;
  pages: number;
  start: number;
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

export function renderCostingView(): string {
  const rows = referenceRows();
  const coolant = store.costingReference.coolantLevel;
  const rackSlots = store.costingReference.rackSlots;

  const coolantControls = `<div class="stepper">
    <span>CURRENT</span>
    <button data-cost-ref="cool:-1" ${coolant <= 0 ? 'disabled' : ''}>−</button>
    <strong>${coolant ? `LEVEL ${coolant} · +${coolant * 10}%` : 'OFF'}</strong>
    <button data-cost-ref="cool:1" ${coolant >= 10 ? 'disabled' : ''}>+</button>
    <button data-cost-ref="cool:reset">RESET</button>
  </div>`;

  const rackControls = `<div class="stepper">
    <span>CURRENT</span>
    <button data-cost-ref="rack:-1" ${rackSlots <= RACK_BASE_SLOTS ? 'disabled' : ''}>−6</button>
    <strong>${rackSlots} SLOTS</strong>
    <button data-cost-ref="rack:1" ${rackSlots >= RACK_DISPLAY_LIMIT ? 'disabled' : ''}>+6</button>
    <button data-cost-ref="rack:reset">BASE</button>
  </div>`;

  return pageStack(
    intro(
      'COSTING',
      'Interactive reference only. Set what you already have; remaining upgrades and cumulative cost recalculate from that point.',
    ),
    panel(
      'COOLANT',
      'Only levels above your current selection are shown.',
      `${coolantControls}${table(['LEVEL', 'PRICE', 'CUMULATIVE FROM CURRENT'], rows.coolant, 'reference-table')}`,
    ),
    panel(
      'RACK SLOT EXPANSION',
      '12 base slots; every upgrade adds +6. The reference extends through the last valid step below 350: 348 slots.',
      `${rackControls}
      ${table(['UPGRADE', 'CAPACITY', 'PRICE', 'CUMULATIVE FROM CURRENT'], rows.rack, 'reference-table')}
      ${rows.pages > 1 ? `<div class="pagination">
        <button data-rack-page="${store.ui.rackPage - 1}" ${store.ui.rackPage <= 1 ? 'disabled' : ''}>PREVIOUS</button>
        <span>PAGE <b>${store.ui.rackPage}</b> / ${rows.pages}</span>
        <button data-rack-page="${store.ui.rackPage + 1}" ${store.ui.rackPage >= rows.pages ? 'disabled' : ''}>NEXT</button>
        <small>ROWS ${rows.start + 1}–${Math.min(rows.start + ROWS_PER_PAGE, rows.rackCount)} OF ${rows.rackCount}</small>
      </div>` : ''}`,
    ),
    panel(
      'FORGE',
      'Known forge fees used by planner costing.',
      table(
        ['FORGE', 'PRICE', 'NOTE'],
        FORGE_ROWS.map(([name, cost, note]) => `<tr><th>${name}</th><td>${compact(cost)} $GRIND</td><td>${note}</td></tr>`),
        'reference-table',
      ),
    ),
  );
}
