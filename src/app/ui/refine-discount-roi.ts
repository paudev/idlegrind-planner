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

interface DiscountPeriod {
  seconds: number;
  label: string;
  earningLabel: string;
}

function periodFor(key: RefineDiscountKey): DiscountPeriod {
  if (key === 'daily') {
    return { seconds: DAY, label: '24H', earningLabel: 'DAILY' };
  }
  return { seconds: WEEK, label: '7D', earningLabel: key === 'weekly' ? 'WEEKLY' : 'SEASON' };
}

function activePath(key: RefineDiscountKey): string {
  return `state.settings.refineDiscounts.${key}Active`;
}

function activeChoice(key: RefineDiscountKey): string {
  const settings = store.state.settings.refineDiscounts;
  const active = key === 'daily'
    ? number(settings.dailyActive) >= 0.5
    : key === 'weekly'
      ? number(settings.weeklyActive) >= 0.5
      : number(settings.passActive) >= 0.5;
  const name = `refine-discount-${key}`;
  return `<div class="discount-active-choice" role="group" aria-label="${key} discount ROI baseline state">
    <span>ROI BASELINE</span>
    <label class="${!active ? 'active' : ''}">
      <input type="radio" name="${name}" data-path="${activePath(key)}" value="0" ${!active ? 'checked' : ''}>
      OFF
    </label>
    <label class="${active ? 'active' : ''}">
      <input type="radio" name="${name}" data-path="${activePath(key)}" value="1" ${active ? 'checked' : ''}>
      ON
    </label>
  </div>`;
}

function scopeCosts(scope: Scope): RefineDiscountCosts {
  return scope === 'planner' ? store.state.planner.discountCosts : store.deck.discountCosts;
}

function taskCostInputs(scope: Scope, key: 'daily' | 'weekly'): string {
  const costs = scopeCosts(scope);
  const prefix = scope === 'planner' ? 'state.planner.discountCosts' : 'deck.discountCosts';
  const grind = key === 'daily' ? costs.dailyGrind : costs.weeklyGrind;
  const grindKey = key === 'daily' ? 'dailyGrind' : 'weeklyGrind';

  return `<div class="discount-cost-grid single">
    <label>
      <span>CURRENT COST · $GRIND</span>
      <input data-path="${prefix}.${grindKey}" data-num value="${inputText(grind)}">
    </label>
  </div>
  <p class="discount-cost-caption">Enter the current $GRIND cost to complete this task set. No GRIT cost is used in ROI.</p>`;
}

function taskVerdict(
  pct: number,
  netGain: number,
  taskEnabled: boolean,
): { label: string; tone: string } {
  if (!taskEnabled) return { label: 'TASKS DISABLED', tone: 'muted' };
  if (!(pct > 0)) return { label: 'DISCOUNT UNAVAILABLE', tone: 'muted' };
  if (netGain > 0.5) return { label: 'WORTH IT', tone: 'positive' };
  if (netGain < -0.5) return { label: 'NOT WORTH IT', tone: 'negative' };
  return { label: 'BREAK EVEN', tone: 'neutral' };
}

function requiredRateMetric(scope: Scope, withoutRate: number, withRate: number): string {
  if (scope !== 'planner') return '';
  const target = Math.max(0, number(store.state.planner.targetGrindPerDay));
  if (!(target > 0) || !(withoutRate > 0) || !(withRate > 0)) return '';

  const before = target * withoutRate / DAY;
  const after = target * withRate / DAY;
  const relief = Math.max(0, before - after);
  const reliefPct = before > 0 ? relief / before * 100 : 0;

  return `<div>
    <small>REQUIRED RATE FOR ${compact(target)} $GRIND / 24H</small>
    <b>${compact(before)}/s → <span class="positive">${compact(after)}/s</span></b>
    <span>Same target needs ${compact(relief)}/s less mining rate (${reliefPct.toFixed(2)}% relief).</span>
  </div>`;
}

function revenueMetric(
  period: DiscountPeriod,
  withoutGrind: number,
  withGrind: number,
): string {
  return `<div>
    <small>${period.earningLabel} REVENUE</small>
    <b>${compact(withoutGrind)} → <span class="positive">${compact(withGrind)} $GRIND</span></b>
    <span>Same projected GRIT over ${period.label}, before versus after this discount.</span>
  </div>`;
}

function dailyCapacityMetric(projectedDailyGrit: number, withoutRate: number, withRate: number): string {
  if (!(projectedDailyGrit > 0) || !(withoutRate > 0) || !(withRate > 0)) return '';
  const before = projectedDailyGrit / withoutRate;
  const after = projectedDailyGrit / withRate;
  const gain = Math.max(0, after - before);

  return `<div>
    <small>24H CONVERSION CAPACITY</small>
    <b>${compact(before)} → <span class="positive">${compact(after)} $GRIND</span></b>
    <span>+${compact(gain)} $GRIND from the same projected 24H GRIT.</span>
  </div>`;
}

function taskCard(
  scope: Scope,
  key: 'daily' | 'weekly',
  projectedGrit: number,
  projectedDailyGrit: number,
  period: DiscountPeriod,
): string {
  const settings = store.state.settings.refineDiscounts;
  const costs = scopeCosts(scope);
  const taskEnabled = number(settings.taskDiscountsEnabled) >= 0.5;
  const pct = discountPct(settings, key);
  const grindCost = key === 'daily' ? costs.dailyGrind : costs.weeklyGrind;
  const result = refineDiscountRoi({
    candidate: key,
    baseRefineRate: store.state.settings.refineRate,
    settings,
    projectedGrit,
    grindCost,
    horizonSeconds: period.seconds,
  });
  const status = taskVerdict(pct, result.netGain, taskEnabled);
  const active = key === 'daily'
    ? number(settings.dailyActive) >= 0.5
    : number(settings.weeklyActive) >= 0.5;
  const label = key === 'daily' ? 'DAILY TASKS' : 'WEEKLY TASKS';
  const withRevenue = result.withRate > 0 ? projectedGrit / result.withRate : 0;
  const averageDailyGain = key === 'weekly' ? result.grossGain / 7 : 0;

  return `<article class="discount-roi-card ${status.tone}">
    <div class="discount-roi-head">
      <div>
        <small>${label}</small>
        <strong>${pct > 0 ? `${pct.toFixed(2).replace(/\.00$/, '')}% CHEAPER` : 'DISCOUNT UNAVAILABLE'}</strong>
      </div>
      <span class="discount-verdict ${status.tone}">${status.label}</span>
    </div>
    ${activeChoice(key)}
    <div class="discount-rate-line">
      <span><small>WITHOUT</small><b>${result.withoutRate > 0 ? `${compact(result.withoutRate)} GRIT / $GRIND` : '—'}</b></span>
      <span class="with"><small>WITH</small><b>${result.withRate > 0 ? `${compact(result.withRate)} GRIT / $GRIND` : '—'}</b></span>
    </div>
    <div class="discount-roi-metrics">
      ${requiredRateMetric(scope, result.withoutRate, result.withRate)}
      ${key === 'weekly' ? dailyCapacityMetric(projectedDailyGrit, result.withoutRate, result.withRate) : ''}
      ${revenueMetric(period, result.withoutGrind, withRevenue)}
      <div>
        <small>DISCOUNT REVENUE</small>
        <b class="positive">${result.available ? `+${compact(result.grossGain)} $GRIND` : '—'}</b>
        <span>${key === 'weekly' ? `+${compact(averageDailyGain)} $GRIND/day average. ` : ''}This is also the maximum task cost before the refinery discount alone stops paying back.</span>
      </div>
      <div>
        <small>CURRENT TASK COST</small>
        <b class="${grindCost > 0 ? 'negative' : ''}">${grindCost > 0 ? `−${compact(grindCost)} $GRIND` : '0 $GRIND'}</b>
        <span>User-entered current completion cost.</span>
      </div>
      <div>
        <small>NET BENEFIT</small>
        <b class="${result.netGain >= 0 ? 'positive' : 'negative'}">${result.available ? `${result.netGain >= 0 ? '+' : '−'}${compact(Math.abs(result.netGain))} $GRIND` : '—'}</b>
        <span>Discount revenue minus the current task cost.</span>
      </div>
    </div>
    ${taskCostInputs(scope, key)}
    <div class="discount-card-foot">
      <span>${active ? 'IN ROI BASELINE · compounds with other baseline discounts in this section only.' : 'OUT OF ROI BASELINE · evaluated only when this card tests the candidate discount.'}</span>
      <time>${period.label} ROI window</time>
    </div>
  </article>`;
}

function passCard(
  scope: Scope,
  projectedGrit: number,
  projectedDailyGrit: number,
  period: DiscountPeriod,
): string {
  const settings = store.state.settings.refineDiscounts;
  const pct = discountPct(settings, 'pass');
  const result = refineDiscountRoi({
    candidate: 'pass',
    baseRefineRate: store.state.settings.refineRate,
    settings,
    projectedGrit,
    grindCost: 0,
    horizonSeconds: period.seconds,
  });
  const active = number(settings.passActive) >= 0.5;
  const withRevenue = result.withRate > 0 ? projectedGrit / result.withRate : 0;
  const averageDailyGain = result.grossGain / 7;
  const sameGritUplift = result.withoutRate > 0 && result.withRate > 0
    ? (result.withoutRate / result.withRate - 1) * 100
    : 0;

  return `<article class="discount-roi-card pass-value">
    <div class="discount-roi-head">
      <div>
        <small>SEASONAL PASS</small>
        <strong>${pct > 0 ? `${pct.toFixed(2).replace(/\.00$/, '')}% CHEAPER` : 'DISCOUNT UNAVAILABLE'}</strong>
      </div>
      <span class="discount-verdict neutral">REFINERY VALUE</span>
    </div>
    ${activeChoice('pass')}
    <div class="discount-rate-line">
      <span><small>WITHOUT</small><b>${result.withoutRate > 0 ? `${compact(result.withoutRate)} GRIT / $GRIND` : '—'}</b></span>
      <span class="with"><small>WITH</small><b>${result.withRate > 0 ? `${compact(result.withRate)} GRIT / $GRIND` : '—'}</b></span>
    </div>
    <div class="discount-roi-metrics">
      ${requiredRateMetric(scope, result.withoutRate, result.withRate)}
      ${dailyCapacityMetric(projectedDailyGrit, result.withoutRate, result.withRate)}
      ${revenueMetric(period, result.withoutGrind, withRevenue)}
      <div>
        <small>REFINERY REVENUE GAIN</small>
        <b class="positive">${result.available ? `+${compact(result.grossGain)} $GRIND / 7D` : '—'}</b>
        <span>Additional $GRIND created by the Pass refinery discount only.</span>
      </div>
      <div>
        <small>AVG DAILY GAIN</small>
        <b class="positive">${result.available ? `+${compact(averageDailyGain)} $GRIND` : '—'}</b>
        <span>Average refinery-only gain per day across the 7D projection.</span>
      </div>
      <div>
        <small>SAME-GRIT UPLIFT</small>
        <b class="positive">${result.available ? `+${sameGritUplift.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}%` : '—'}</b>
        <span>Extra $GRIND from the same GRIT when adding the Pass discount.</span>
      </div>
    </div>
    <p class="discount-cost-caption">Revenue view only. Seasonal Pass crates and other rewards are intentionally excluded, so no worth-it verdict or Pass-price deduction is shown here.</p>
    <div class="discount-card-foot">
      <span>${active ? 'IN ROI BASELINE · the Pass discount compounds with other baseline discounts in this section only.' : 'OUT OF ROI BASELINE · this card shows the marginal refinery value of adding the Pass discount.'}</span>
      <time>${period.label} value window</time>
    </div>
  </article>`;
}

export function renderRefineDiscountRoi({
  scope,
  panelNumber,
  projectGrit,
  projectionNote,
}: RefineDiscountProjection): string {
  const dailyPeriod = periodFor('daily');
  const weeklyPeriod = periodFor('weekly');
  const passPeriod = periodFor('pass');
  const dailyGrit = Math.max(0, number(projectGrit(dailyPeriod.seconds)));
  const weeklyGrit = Math.max(0, number(projectGrit(weeklyPeriod.seconds)));
  const passGrit = Math.max(0, number(projectGrit(passPeriod.seconds)));
  const settings = store.state.settings.refineDiscounts;
  const baseRate = Math.max(0, number(store.state.settings.refineRate));
  const effectiveRate = effectiveRefineRate(baseRate, settings);
  const combinedPct = activeDiscountPct(baseRate, settings);
  const target = scope === 'planner' ? Math.max(0, number(store.state.planner.targetGrindPerDay)) : 0;
  const targetRate = target > 0 && effectiveRate > 0 ? target * effectiveRate / DAY : 0;

  return panel(
    `${panelNumber} // REFINE DISCOUNT ROI`,
    'Isolated conversion analysis. Daily and Weekly compare their current $GRIND completion cost against discount revenue; Seasonal Pass reports refinery revenue only because its other rewards are outside this model.',
    `<div class="discount-stack-summary">
      <div><small>BASE REFINE RATE</small><strong>${compact(baseRate)}</strong><span>GRIT / $GRIND</span></div>
      <div class="effective"><small>ROI BASELINE RATE</small><strong>${compact(effectiveRate)}</strong><span>${combinedPct > 0 ? `${combinedPct.toFixed(2)}% cheaper after compounding` : 'no baseline discounts'}</span></div>
      <p>${target > 0 ? `${compact(target)} $GRIND / 24H needs ${compact(targetRate)}/s at the current ROI baseline. ` : ''}${projectionNote} Daily = 24H; Weekly = 7D; Seasonal Pass = 7D. Discount baseline selections affect only this ROI section.</p>
    </div>
    <div class="discount-roi-grid">
      ${taskCard(scope, 'daily', dailyGrit, dailyGrit, dailyPeriod)}
      ${taskCard(scope, 'weekly', weeklyGrit, dailyGrit, weeklyPeriod)}
      ${passCard(scope, passGrit, dailyGrit, passPeriod)}
    </div>`,
  );
}
