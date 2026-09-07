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

function keyLabel(key: RefineDiscountKey): string {
  if (key === 'daily') return 'DAILY';
  if (key === 'weekly') return 'WEEKLY';
  return 'PASS';
}

function activePath(key: RefineDiscountKey): string {
  return `state.settings.refineDiscounts.${key}Active`;
}

function isActive(key: RefineDiscountKey): boolean {
  const settings = store.state.settings.refineDiscounts;
  if (key === 'daily') return number(settings.dailyActive) >= 0.5;
  if (key === 'weekly') return number(settings.weeklyActive) >= 0.5;
  return number(settings.passActive) >= 0.5;
}

function activeChoice(key: RefineDiscountKey): string {
  const active = isActive(key);
  const name = `refine-discount-${key}`;
  return `<div class="discount-active-choice" role="group" aria-label="${key} discount current ROI stack state">
    <span>CURRENT STACK</span>
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

function comparisonRates(
  key: RefineDiscountKey,
  withoutRate: number,
  withRate: number,
): { active: boolean; currentRate: number; alternativeRate: number; alternativeLabel: string } {
  const active = isActive(key);
  return {
    active,
    currentRate: active ? withRate : withoutRate,
    alternativeRate: active ? withoutRate : withRate,
    alternativeLabel: active ? `WITHOUT ${keyLabel(key)}` : `WITH ${keyLabel(key)}`,
  };
}

function rateComparison(
  key: RefineDiscountKey,
  withoutRate: number,
  withRate: number,
): string {
  const comparison = comparisonRates(key, withoutRate, withRate);
  const currentClass = comparison.active ? 'with' : '';
  const alternativeClass = comparison.active ? '' : 'with';

  return `<div class="discount-rate-line">
    <span class="${currentClass}"><small>CURRENT STACK</small><b>${comparison.currentRate > 0 ? `${compact(comparison.currentRate)} GRIT / $GRIND` : '—'}</b></span>
    <span class="${alternativeClass}"><small>${comparison.alternativeLabel}</small><b>${comparison.alternativeRate > 0 ? `${compact(comparison.alternativeRate)} GRIT / $GRIND` : '—'}</b></span>
  </div>`;
}

function requiredRateMetric(
  scope: Scope,
  key: RefineDiscountKey,
  withoutRate: number,
  withRate: number,
): string {
  if (scope !== 'planner') return '';
  const target = Math.max(0, number(store.state.planner.targetGrindPerDay));
  const comparison = comparisonRates(key, withoutRate, withRate);
  if (!(target > 0) || !(comparison.currentRate > 0) || !(comparison.alternativeRate > 0)) return '';

  const current = target * comparison.currentRate / DAY;
  const alternative = target * comparison.alternativeRate / DAY;
  const difference = Math.abs(alternative - current);
  const pct = current > 0 ? difference / current * 100 : 0;
  const copy = comparison.active
    ? `Removing ${keyLabel(key)} would require ${compact(difference)}/s more mining rate (${pct.toFixed(2)}%).`
    : `Adding ${keyLabel(key)} would require ${compact(difference)}/s less mining rate (${pct.toFixed(2)}%).`;

  return `<div>
    <small>REQUIRED RATE FOR ${compact(target)} $GRIND / 24H</small>
    <b>${compact(current)}/s → <span class="${alternative < current ? 'positive' : ''}">${compact(alternative)}/s</span></b>
    <span>${copy}</span>
  </div>`;
}

function revenueMetric(
  key: RefineDiscountKey,
  period: DiscountPeriod,
  projectedGrit: number,
  withoutRate: number,
  withRate: number,
): string {
  const comparison = comparisonRates(key, withoutRate, withRate);
  const current = comparison.currentRate > 0 ? projectedGrit / comparison.currentRate : 0;
  const alternative = comparison.alternativeRate > 0 ? projectedGrit / comparison.alternativeRate : 0;
  const difference = Math.abs(alternative - current);
  const copy = comparison.active
    ? `Removing ${keyLabel(key)} would reduce revenue by ${compact(difference)} $GRIND over ${period.label}.`
    : `Adding ${keyLabel(key)} would increase revenue by ${compact(difference)} $GRIND over ${period.label}.`;

  return `<div>
    <small>${period.earningLabel} REVENUE</small>
    <b>${compact(current)} → <span class="${alternative > current ? 'positive' : ''}">${compact(alternative)} $GRIND</span></b>
    <span>${copy}</span>
  </div>`;
}

function dailyCapacityMetric(
  key: RefineDiscountKey,
  projectedDailyGrit: number,
  withoutRate: number,
  withRate: number,
): string {
  const comparison = comparisonRates(key, withoutRate, withRate);
  if (!(projectedDailyGrit > 0) || !(comparison.currentRate > 0) || !(comparison.alternativeRate > 0)) return '';
  const current = projectedDailyGrit / comparison.currentRate;
  const alternative = projectedDailyGrit / comparison.alternativeRate;
  const difference = Math.abs(alternative - current);
  const copy = comparison.active
    ? `Removing ${keyLabel(key)} would lose ${compact(difference)} $GRIND of 24H conversion capacity.`
    : `Adding ${keyLabel(key)} would add ${compact(difference)} $GRIND of 24H conversion capacity.`;

  return `<div>
    <small>24H CONVERSION CAPACITY</small>
    <b>${compact(current)} → <span class="${alternative > current ? 'positive' : ''}">${compact(alternative)} $GRIND</span></b>
    <span>${copy}</span>
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
  const active = isActive(key);
  const label = key === 'daily' ? 'DAILY TASKS' : 'WEEKLY TASKS';
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
    ${rateComparison(key, result.withoutRate, result.withRate)}
    <div class="discount-roi-metrics">
      ${requiredRateMetric(scope, key, result.withoutRate, result.withRate)}
      ${key === 'weekly' ? dailyCapacityMetric(key, projectedDailyGrit, result.withoutRate, result.withRate) : ''}
      ${revenueMetric(key, period, projectedGrit, result.withoutRate, result.withRate)}
      <div>
        <small>DISCOUNT REVENUE</small>
        <b class="positive">${result.available ? `+${compact(result.grossGain)} $GRIND` : '—'}</b>
        <span>${key === 'weekly' ? `+${compact(averageDailyGain)} $GRIND/day average. ` : ''}Value created by having this discount; also the maximum task cost before refinery savings alone stop paying back.</span>
      </div>
      <div>
        <small>CURRENT TASK COST</small>
        <b class="${grindCost > 0 ? 'negative' : ''}">${grindCost > 0 ? `−${compact(grindCost)} $GRIND` : '0 $GRIND'}</b>
        <span>User-entered current completion cost.</span>
      </div>
      <div>
        <small>NET BENEFIT</small>
        <b class="${result.netGain >= 0 ? 'positive' : 'negative'}">${result.available ? `${result.netGain >= 0 ? '+' : '−'}${compact(Math.abs(result.netGain))} $GRIND` : '—'}</b>
        <span>Value of having the discount minus the current task cost.</span>
      </div>
    </div>
    ${taskCostInputs(scope, key)}
    <div class="discount-card-foot">
      <span>${active ? `ACTIVE IN CURRENT STACK · this card shows the impact of removing ${keyLabel(key)}.` : `NOT IN CURRENT STACK · this card shows the marginal value of adding ${keyLabel(key)}.`}</span>
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
  const active = isActive('pass');
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
    ${rateComparison('pass', result.withoutRate, result.withRate)}
    <div class="discount-roi-metrics">
      ${requiredRateMetric(scope, 'pass', result.withoutRate, result.withRate)}
      ${dailyCapacityMetric('pass', projectedDailyGrit, result.withoutRate, result.withRate)}
      ${revenueMetric('pass', period, projectedGrit, result.withoutRate, result.withRate)}
      <div>
        <small>REFINERY REVENUE GAIN</small>
        <b class="positive">${result.available ? `+${compact(result.grossGain)} $GRIND / 7D` : '—'}</b>
        <span>Marginal $GRIND value created by the Pass refinery discount.</span>
      </div>
      <div>
        <small>AVG DAILY GAIN</small>
        <b class="positive">${result.available ? `+${compact(averageDailyGain)} $GRIND` : '—'}</b>
        <span>Average refinery-only value per day across the 7D projection.</span>
      </div>
      <div>
        <small>SAME-GRIT UPLIFT</small>
        <b class="positive">${result.available ? `+${sameGritUplift.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}%` : '—'}</b>
        <span>Extra $GRIND from the same GRIT attributable to the Pass discount.</span>
      </div>
    </div>
    <p class="discount-cost-caption">Revenue view only. Seasonal Pass crates and other rewards are intentionally excluded, so no worth-it verdict or Pass-price deduction is shown here.</p>
    <div class="discount-card-foot">
      <span>${active ? 'ACTIVE IN CURRENT STACK · this card shows the refinery value lost if the Pass discount is removed.' : 'NOT IN CURRENT STACK · this card shows the marginal refinery value of adding the Pass discount.'}</span>
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
    'Isolated conversion analysis. Every card is anchored to the same current discount stack; Daily and Weekly compare task cost against discount revenue, while Seasonal Pass reports refinery value only.',
    `<div class="discount-stack-summary">
      <div><small>BASE REFINE RATE</small><strong>${compact(baseRate)}</strong><span>GRIT / $GRIND</span></div>
      <div class="effective"><small>CURRENT ROI STACK</small><strong>${compact(effectiveRate)}</strong><span>${combinedPct > 0 ? `${combinedPct.toFixed(2)}% cheaper after compounding` : 'no active ROI discounts'}</span></div>
      <p>${target > 0 ? `${compact(target)} $GRIND / 24H needs ${compact(targetRate)}/s at the current ROI stack. ` : ''}${projectionNote} A card that is OFF shows the gain from adding it; a card that is ON shows what is lost by removing it. All cards share the same current stack.</p>
    </div>
    <div class="discount-roi-grid">
      ${taskCard(scope, 'daily', dailyGrit, dailyGrit, dailyPeriod)}
      ${taskCard(scope, 'weekly', weeklyGrit, dailyGrit, weeklyPeriod)}
      ${passCard(scope, passGrit, dailyGrit, passPeriod)}
    </div>`,
  );
}
