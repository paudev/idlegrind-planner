import { DAY } from '../config/economy';
import {
  activeDiscountPct,
  discountPct,
  effectiveRefineRate,
  refineDiscountRoi,
} from '../core/refine-discounts';
import { compact, inputText, number } from '../core/format';
import { store } from '../core/state';
import type { RefineDiscountCosts, RefineDiscountKey, Scope } from '../types';
import { panel } from './components';

const WEEK = DAY * 7;

interface RefineDiscountProjection {
  scope: Scope;
  panelNumber: number;
  projectGrit: (seconds: number) => number;
  projectionNote: string;
}

function keyLabel(key: RefineDiscountKey): string {
  if (key === 'daily') return 'DAILY';
  if (key === 'weekly') return 'WEEKLY';
  return 'SEASON PASS';
}

function isActive(key: RefineDiscountKey): boolean {
  const settings = store.state.settings.refineDiscounts;
  if (key === 'daily') return number(settings.dailyActive) >= 0.5;
  if (key === 'weekly') return number(settings.weeklyActive) >= 0.5;
  return number(settings.passActive) >= 0.5;
}

function activePath(key: RefineDiscountKey): string {
  return `state.settings.refineDiscounts.${key}Active`;
}

function stackCheckbox(key: RefineDiscountKey): string {
  const settings = store.state.settings.refineDiscounts;
  const taskEnabled = number(settings.taskDiscountsEnabled) >= 0.5;
  const available = key === 'pass' || taskEnabled;
  const active = available && isActive(key);
  const pct = discountPct(settings, key);

  return `<label class="discount-stack-checkbox ${active ? 'active' : ''} ${!available ? 'disabled' : ''}">
    <input type="checkbox" data-path="${activePath(key)}" ${active ? 'checked' : ''} ${!available ? 'disabled' : ''}>
    <span class="discount-check" aria-hidden="true">✓</span>
    <span class="discount-check-copy">
      <strong>${keyLabel(key)}</strong>
      <small>${available ? `${pct.toFixed(2).replace(/\.00$/, '')}% cheaper` : 'task discounts disabled'}</small>
    </span>
  </label>`;
}

function scopeCosts(scope: Scope): RefineDiscountCosts {
  return scope === 'planner' ? store.state.planner.discountCosts : store.deck.discountCosts;
}

function taskCostInput(scope: Scope, key: 'daily' | 'weekly'): string {
  const costs = scopeCosts(scope);
  const prefix = scope === 'planner' ? 'state.planner.discountCosts' : 'deck.discountCosts';
  const grind = key === 'daily' ? costs.dailyGrind : costs.weeklyGrind;
  const grindKey = key === 'daily' ? 'dailyGrind' : 'weeklyGrind';

  return `<label class="discount-task-cost">
    <span>CURRENT ${keyLabel(key)} COST · $GRIND</span>
    <input data-path="${prefix}.${grindKey}" data-num value="${inputText(grind)}">
  </label>`;
}

function taskDecision(scope: Scope, key: 'daily' | 'weekly', projectedGrit: number): string {
  const settings = store.state.settings.refineDiscounts;
  if (!isActive(key)) return '';

  const costs = scopeCosts(scope);
  const grindCost = key === 'daily' ? costs.dailyGrind : costs.weeklyGrind;
  const horizon = key === 'daily' ? DAY : WEEK;
  const result = refineDiscountRoi({
    candidate: key,
    baseRefineRate: store.state.settings.refineRate,
    settings,
    projectedGrit,
    grindCost,
    horizonSeconds: horizon,
  });
  const net = result.netGain;
  const verdict = net > 0.5 ? 'WORTH IT' : net < -0.5 ? 'NOT WORTH IT' : 'BREAK EVEN';
  const tone = net > 0.5 ? 'positive' : net < -0.5 ? 'negative' : 'neutral';
  const periodLabel = key === 'daily' ? '24H' : '7D';

  return `<article class="discount-breakdown-card ${tone}">
    <div class="discount-breakdown-head">
      <div><small>${keyLabel(key)} CONTRIBUTION</small><strong>${periodLabel} TASK ROI</strong></div>
      <span class="discount-verdict ${tone}">${verdict}</span>
    </div>
    <div class="discount-breakdown-metrics">
      <div><small>DISCOUNT VALUE</small><b class="positive">+${compact(result.grossGain)} $GRIND</b><span>Marginal refinery value while every other checked discount remains active.</span></div>
      <div><small>TASK COST</small><b class="${grindCost > 0 ? 'negative' : ''}">${grindCost > 0 ? `−${compact(grindCost)}` : '0'} $GRIND</b><span>User-entered current completion cost.</span></div>
      <div><small>NET BENEFIT</small><b class="${tone}">${net >= 0 ? '+' : '−'}${compact(Math.abs(net))} $GRIND</b><span>Discount value minus task cost.</span></div>
    </div>
    ${taskCostInput(scope, key)}
  </article>`;
}

function passContribution(projectedGrit: number): string {
  const settings = store.state.settings.refineDiscounts;
  if (!isActive('pass')) return '';

  const result = refineDiscountRoi({
    candidate: 'pass',
    baseRefineRate: store.state.settings.refineRate,
    settings,
    projectedGrit,
    grindCost: 0,
    horizonSeconds: WEEK,
  });

  return `<article class="discount-breakdown-card pass-value">
    <div class="discount-breakdown-head">
      <div><small>SEASON PASS CONTRIBUTION</small><strong>7D REFINERY VALUE</strong></div>
      <span class="discount-verdict neutral">NO VERDICT</span>
    </div>
    <div class="discount-breakdown-metrics">
      <div><small>7D REFINERY GAIN</small><b class="positive">+${compact(result.grossGain)} $GRIND</b><span>Marginal refinery value while the other checked discounts remain active.</span></div>
      <div><small>AVG DAILY GAIN</small><b class="positive">+${compact(result.grossGain / 7)} $GRIND</b><span>Average refinery-only value per day.</span></div>
    </div>
    <p class="discount-card-note">Pass price, crates, and other rewards are intentionally excluded. This section reports refinery revenue only.</p>
  </article>`;
}

export function renderRefineDiscountRoi({
  scope,
  panelNumber,
  projectGrit,
  projectionNote,
}: RefineDiscountProjection): string {
  const settings = store.state.settings.refineDiscounts;
  const baseRate = Math.max(0, number(store.state.settings.refineRate));
  const selectedRate = effectiveRefineRate(baseRate, settings);
  const combinedPct = activeDiscountPct(baseRate, settings);
  const dailyGrit = Math.max(0, number(projectGrit(DAY)));
  const weeklyGrit = Math.max(0, number(projectGrit(WEEK)));
  const baseDailyGrind = baseRate > 0 ? dailyGrit / baseRate : 0;
  const selectedDailyGrind = selectedRate > 0 ? dailyGrit / selectedRate : 0;
  const baseWeeklyGrind = baseRate > 0 ? weeklyGrit / baseRate : 0;
  const selectedWeeklyGrind = selectedRate > 0 ? weeklyGrit / selectedRate : 0;
  const dailyGain = Math.max(0, selectedDailyGrind - baseDailyGrind);
  const weeklyGain = Math.max(0, selectedWeeklyGrind - baseWeeklyGrind);
  const selectedKeys = (['daily', 'weekly', 'pass'] as RefineDiscountKey[]).filter(isActive);
  const selectedLabel = selectedKeys.length ? selectedKeys.map(keyLabel).join(' + ') : 'NO DISCOUNTS';
  const target = scope === 'planner' ? Math.max(0, number(store.state.planner.targetGrindPerDay)) : 0;
  const baseRequiredRate = target > 0 && baseRate > 0 ? target * baseRate / DAY : 0;
  const selectedRequiredRate = target > 0 && selectedRate > 0 ? target * selectedRate / DAY : 0;
  const requiredRateSaved = Math.max(0, baseRequiredRate - selectedRequiredRate);

  const breakdown = [
    taskDecision(scope, 'daily', dailyGrit),
    taskDecision(scope, 'weekly', weeklyGrit),
    passContribution(weeklyGrit),
  ].filter(Boolean).join('');

  return panel(
    `${panelNumber} // REFINE DISCOUNT ROI`,
    'Check the discounts you want to analyze together. Every number below uses exactly that selected combination.',
    `<div class="discount-selector">
      <div class="discount-selector-head">
        <div><small>SELECT DISCOUNTS</small><strong>BUILD YOUR CONVERSION STACK</strong></div>
        <p>Daily + Weekly + Pass compound. These checkboxes affect this ROI section only and never change Build Planner, Final Build, or Deck Simulator output.</p>
      </div>
      <div class="discount-checkbox-grid">
        ${stackCheckbox('daily')}
        ${stackCheckbox('weekly')}
        ${stackCheckbox('pass')}
      </div>
    </div>

    <div class="discount-stack-result">
      <div class="discount-stack-hero">
        <small>SELECTED STACK</small>
        <strong>${selectedLabel}</strong>
        <span>${combinedPct > 0 ? `${combinedPct.toFixed(2)}% cheaper after compounding` : 'Base conversion only'}</span>
      </div>
      <div class="discount-stack-rate">
        <div><small>BASE</small><strong>${compact(baseRate)}</strong><span>GRIT / $GRIND</span></div>
        <span aria-hidden="true">→</span>
        <div class="selected"><small>SELECTED</small><strong>${compact(selectedRate)}</strong><span>GRIT / $GRIND</span></div>
      </div>
    </div>

    <div class="discount-combined-grid">
      ${target > 0 ? `<div class="discount-combined-metric">
        <small>RATE NEEDED FOR ${compact(target)} $GRIND / 24H</small>
        <strong>${compact(selectedRequiredRate)}/s</strong>
        <span>${compact(baseRequiredRate)}/s at base · <b>−${compact(requiredRateSaved)}/s required</b></span>
      </div>` : ''}
      <div class="discount-combined-metric">
        <small>24H $GRIND EARNINGS</small>
        <strong>${compact(selectedDailyGrind)} $GRIND</strong>
        <span>${compact(baseDailyGrind)} at base · <b>+${compact(dailyGain)} from selected stack</b></span>
      </div>
      <div class="discount-combined-metric">
        <small>7D $GRIND EARNINGS</small>
        <strong>${compact(selectedWeeklyGrind)} $GRIND</strong>
        <span>${compact(baseWeeklyGrind)} at base · <b>+${compact(weeklyGain)} from selected stack</b></span>
      </div>
      <div class="discount-combined-metric">
        <small>SAME-GRIT UPLIFT</small>
        <strong>${baseRate > 0 && selectedRate > 0 ? `+${((baseRate / selectedRate - 1) * 100).toFixed(2)}%` : '—'}</strong>
        <span>Extra $GRIND from the same GRIT using the selected conversion stack.</span>
      </div>
    </div>

    <p class="discount-projection-note">${projectionNote} The 24H and 7D totals above use the full checked stack. If Daily is checked in the 7D view, it assumes the Daily discount is maintained each day.</p>

    <div class="discount-selected-breakdown">
      <div class="discount-selected-breakdown-head">
        <small>SELECTED BONUS VALUE</small>
        <strong>${selectedKeys.length ? 'WHAT EACH CHECKED BONUS CONTRIBUTES' : 'SELECT A DISCOUNT ABOVE'}</strong>
        <span>${selectedKeys.length ? 'Daily and Weekly keep their own task-cost ROI. Seasonal Pass remains revenue-only.' : 'The combined conversion, required rate, and earnings will update immediately.'}</span>
      </div>
      ${breakdown ? `<div class="discount-breakdown-grid">${breakdown}</div>` : ''}
    </div>`,
  );
}
