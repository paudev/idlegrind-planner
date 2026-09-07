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

function taskDetail(scope: Scope, key: 'daily' | 'weekly', projectedGrit: number): string {
  if (!isActive(key)) return '';

  const settings = store.state.settings.refineDiscounts;
  const costs = scopeCosts(scope);
  const grindCost = key === 'daily' ? costs.dailyGrind : costs.weeklyGrind;
  const grindKey = key === 'daily' ? 'dailyGrind' : 'weeklyGrind';
  const prefix = scope === 'planner' ? 'state.planner.discountCosts' : 'deck.discountCosts';
  const horizon = key === 'daily' ? DAY : WEEK;
  const periodLabel = key === 'daily' ? '24H' : '7D';
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

  return `<div class="discount-detail-row ${tone}">
    <div class="discount-detail-title">
      <span><small>${keyLabel(key)}</small><strong>${periodLabel} TASK VALUE</strong></span>
      <b class="discount-verdict ${tone}">${verdict}</b>
    </div>
    <div class="discount-detail-values">
      <span><small>DISCOUNT VALUE</small><strong class="positive">+${compact(result.grossGain)}</strong></span>
      <span><small>TASK COST</small><strong class="${grindCost > 0 ? 'negative' : ''}">${grindCost > 0 ? `−${compact(grindCost)}` : '0'}</strong></span>
      <span><small>NET</small><strong class="${tone}">${net >= 0 ? '+' : '−'}${compact(Math.abs(net))}</strong></span>
      <label class="discount-detail-cost"><small>CURRENT COST · $GRIND</small><input data-path="${prefix}.${grindKey}" data-num value="${inputText(grindCost)}"></label>
    </div>
  </div>`;
}

function passDetail(projectedGrit: number): string {
  if (!isActive('pass')) return '';

  const settings = store.state.settings.refineDiscounts;
  const result = refineDiscountRoi({
    candidate: 'pass',
    baseRefineRate: store.state.settings.refineRate,
    settings,
    projectedGrit,
    grindCost: 0,
    horizonSeconds: WEEK,
  });

  return `<div class="discount-detail-row pass-value">
    <div class="discount-detail-title">
      <span><small>SEASON PASS</small><strong>7D REFINERY VALUE</strong></span>
      <b class="discount-verdict neutral">REVENUE ONLY</b>
    </div>
    <div class="discount-detail-values pass">
      <span><small>7D EXTRA</small><strong class="positive">+${compact(result.grossGain)}</strong></span>
      <span><small>AVG / DAY</small><strong class="positive">+${compact(result.grossGain / 7)}</strong></span>
      <p>Pass price and other rewards are excluded.</p>
    </div>
  </div>`;
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
  const sameGritUplift = baseRate > 0 && selectedRate > 0 ? (baseRate / selectedRate - 1) * 100 : 0;

  const costs = scopeCosts(scope);
  const dailyTaskCost7d = isActive('daily') ? Math.max(0, number(costs.dailyGrind)) * 7 : 0;
  const weeklyTaskCost7d = isActive('weekly') ? Math.max(0, number(costs.weeklyGrind)) : 0;
  const taskCost7d = dailyTaskCost7d + weeklyTaskCost7d;
  const netWeeklyGain = weeklyGain - taskCost7d;
  const netTone = netWeeklyGain >= 0 ? 'positive' : 'negative';

  const details = [
    taskDetail(scope, 'daily', dailyGrit),
    taskDetail(scope, 'weekly', weeklyGrit),
    passDetail(weeklyGrit),
  ].filter(Boolean).join('');

  return panel(
    `${panelNumber} // REFINE DISCOUNT ROI`,
    'Select the discounts to analyze together. The first row shows the combined $GRIND gain.',
    `<div class="discount-selector compact">
      <div class="discount-selector-head">
        <div><small>SELECT DISCOUNTS</small><strong>CONVERSION STACK</strong></div>
        <p>Compounds together · ROI section only</p>
      </div>
      <div class="discount-checkbox-grid">
        ${stackCheckbox('daily')}
        ${stackCheckbox('weekly')}
        ${stackCheckbox('pass')}
      </div>
    </div>

    <div class="discount-gain-summary">
      <div class="discount-gain-hero">
        <small>YOUR EXTRA $GRIND</small>
        <strong class="${selectedKeys.length ? 'positive' : ''}">${selectedKeys.length ? '+' : ''}${compact(dailyGain)} <span>/ 24H</span></strong>
        <p>${compact(baseDailyGrind)} → ${compact(selectedDailyGrind)} $GRIND/day · ${selectedLabel}</p>
      </div>
      <div class="discount-gain-metrics">
        <div><small>EXTRA / 7D</small><strong class="positive">+${compact(weeklyGain)}</strong></div>
        <div><small>TASK COST / 7D</small><strong class="${taskCost7d > 0 ? 'negative' : ''}">${taskCost7d > 0 ? `−${compact(taskCost7d)}` : '0'}</strong></div>
        <div><small>NET / 7D</small><strong class="${netTone}">${netWeeklyGain >= 0 ? '+' : '−'}${compact(Math.abs(netWeeklyGain))}</strong></div>
      </div>
    </div>

    <div class="discount-support-grid ${target > 0 ? '' : 'two'}">
      <div>
        <small>CONVERSION</small>
        <strong>${compact(baseRate)} <span>→</span> <b>${compact(selectedRate)}</b></strong>
        <p>GRIT / $GRIND · ${combinedPct.toFixed(2)}% cheaper</p>
      </div>
      ${target > 0 ? `<div>
        <small>RATE NEEDED FOR ${compact(target)} / 24H</small>
        <strong>${compact(baseRequiredRate)}/s <span>→</span> <b>${compact(selectedRequiredRate)}/s</b></strong>
        <p>−${compact(requiredRateSaved)}/s required</p>
      </div>` : ''}
      <div>
        <small>SAME-GRIT UPLIFT</small>
        <strong><b>+${sameGritUplift.toFixed(2)}%</b></strong>
        <p>More $GRIND from the same GRIT</p>
      </div>
    </div>

    ${details ? `<div class="discount-details">
      <div class="discount-details-head"><small>CHECKED BONUS DETAILS</small><span>Daily/Weekly include your entered task cost. Pass stays revenue-only.</span></div>
      ${details}
    </div>` : ''}

    <p class="discount-footer-note">${projectionNote} Daily cost is counted ×7 in the 7D net. Weekly cost is counted once. Seasonal Pass price is never deducted.</p>`,
  );
}
