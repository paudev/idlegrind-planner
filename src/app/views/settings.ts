import { MARKET_DEFAULTS, MARKET_LABELS, VIAL_DEFAULTS } from '../config/economy';
import {
  cashoutCycle,
  deviceTimezone,
  formatCashoutEditorValue,
  formatLocalTime,
  nextCashoutAt,
} from '../core/cashout';
import { escapeHtml, inputText } from '../core/format';
import { store } from '../core/state';
import { field, intro, pageStack, panel } from '../ui/components';

function rigPresetRows(): string {
  return Object.entries(store.state.settings.rigPresets).map(([id, rig]) => `
    <div class="settings-rig ${rig.optimizerFill ? 'optimizer-preset' : ''}">
      <div class="preset-name">
        <span class="rigdot ${escapeHtml(rig.accent || 'green')}"></span>
        <div>
          <b>${escapeHtml(rig.name)}</b>
          ${rig.optimizerFill ? '<small>AUTO-FILL / OPTIMIZED RIG</small>' : ''}
        </div>
      </div>
      <label><small>BASE /s</small><input data-preset="${id}:rate" data-num value="${inputText(rig.rate)}"></label>
      <label><small>+ / QN</small><input data-preset="${id}:synergy" data-num value="${inputText(rig.synergy)}"></label>
      <label><small>SLOTS</small><input data-preset="${id}:slots" data-num value="${inputText(rig.slots)}"></label>
    </div>`).join('');
}

function marketRows(): string {
  const rigPrices = Object.keys(MARKET_DEFAULTS).map((key) => `
    <tr>
      <th>${MARKET_LABELS[key] ?? key}</th>
      <td>
        <label class="price-input">
          <input data-market="${key}" data-num value="${inputText(store.market[key] ?? MARKET_DEFAULTS[key] ?? 0)}">
          <span>$GRIND</span>
        </label>
      </td>
    </tr>`);

  const vialPrices = Object.keys(VIAL_DEFAULTS).map((hours) => `
    <tr>
      <th>${hours}H OVERCLOCK VIAL</th>
      <td>
        <label class="price-input">
          <input data-vial-price="${hours}" data-num value="${inputText(store.vials[hours] ?? VIAL_DEFAULTS[hours] ?? 0)}">
          <span>$GRIND</span>
        </label>
      </td>
    </tr>`);

  return [...rigPrices, ...vialPrices].join('');
}

function cashoutTimingEditor(): string {
  const cycle = cashoutCycle();
  const editorTimestamp = cycle.last ?? Date.now();
  const next = nextCashoutAt(cycle);
  const previewNext = editorTimestamp + 24 * 60 * 60 * 1000;

  return `<div class="cashout-settings-row" data-cashout-settings-section>
    <div class="cashout-setting-status">
      <small>LAST WITHDRAWAL</small>
      <strong>${cycle.last !== null ? formatLocalTime(cycle.last) : 'NOT SET'}</strong>
      <span>${next !== null ? `Next · ${formatLocalTime(next)}` : 'No cashout window is active.'}</span>
    </div>

    <label class="cashout-entry">
      <span>SET LOCAL DATE & TIME</span>
      <div class="cashout-entry-control">
        <input
          type="text"
          inputmode="text"
          autocomplete="off"
          spellcheck="false"
          data-cashout-text
          value="${formatCashoutEditorValue(editorTimestamp)}"
          placeholder="09/02/2026 · 02:23 PM"
          aria-label="Last withdrawal local date and time"
        >
        <button type="button" class="chip" data-cashout-now>NOW</button>
      </div>
      <small>LOCAL · ${deviceTimezone()}</small>
    </label>

    <div class="cashout-preview compact">
      <small>NEXT CASHOUT</small>
      <strong data-cashout-preview>${formatLocalTime(previewNext)}</strong>
      <span data-cashout-editor-message>Exactly 24 elapsed hours after this withdrawal.</span>
    </div>

    <div class="editor-actions cashout-settings-actions">
      <button type="button" class="chip active" data-cashout-save>SAVE</button>
      ${cycle.last !== null ? '<button type="button" class="chip" data-cashout-clear>CLEAR</button>' : ''}
    </div>
  </div>`;
}

export function renderSettingsView(): string {
  return pageStack(
    intro(
      'SETTINGS',
      'Stable economy and rig configuration, personal cashout timing, and editable current market references.',
    ),
    panel(
      'ECONOMY',
      'Global values shared by every module.',
      `<div class="formgrid">
        ${field('state.settings.refineRate', 'GRIT PER 1 $GRIND · e.g. 96K', store.state.settings.refineRate)}
        ${field('state.settings.maxRackSlots', 'MAX DECK SLOTS · 0 = NO CAP', store.state.settings.maxRackSlots)}
      </div>`,
    ),
    panel(
      'CASHOUT TIMING',
      'Set or correct your personal rolling 24-hour cashout cycle. Time is interpreted in your current device timezone.',
      cashoutTimingEditor(),
    ),
    panel(
      'RIG PRESETS',
      'Rig production values used by Deck Simulator and Build Planner.',
      `<div class="settings-rigs">${rigPresetRows()}</div>`,
    ),
    panel(
      'MARKET PRICE REFERENCES',
      'Editable current prices used strictly by simulator/planner costing.',
      `<div class="table-scroll">
        <table class="market-table">
          <thead><tr><th>ITEM</th><th>CURRENT MARKET PRICE</th></tr></thead>
          <tbody>${marketRows()}</tbody>
        </table>
      </div>
      <div class="page-actions"><button type="button" class="chip" data-market-reset>RESET DEFAULTS</button></div>`,
    ),
    panel(
      'LOCAL DATA',
      'Saved only in this browser.',
      `<div class="local-data-row">
        <p>Resetting restores zeroed planner inputs and default game/market references.</p>
        <button type="button" class="dangerbtn" data-reset-all>RESET ALL PLANNER DATA</button>
      </div>`,
    ),
  );
}
