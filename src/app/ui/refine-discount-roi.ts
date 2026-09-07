import { DAY } from '../config/economy';
import {
  activeDiscountPct,
  discountPct,
  effectiveRefineRate,
  refineDiscountRoi,
} from '../core/refine-discounts';
import { compact, duration, inputText, number } from '../core/format';
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
  return `<div class="discount-active-choice" role="group" aria-label="${key} discount active state">
    <span>APPLY TO OUTPUT</span>
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

function passPriceInput(): string {
  const price = Math.max(0, number(store.state.settings.refineDiscounts.passPrice));
  return `<div class="discount-cost-grid single">
    <label>
      <span>CURRENT SEASON PASS PRICE · $GRIND</span>
      <input data-path="state.settings.refineDiscounts.passPrice" data-num value="${inputText(price)}">
    </label>
  </div>
  <p class="discount-cost-caption">Only the user-entered $GRIND purchase price is charged here. Other Season Pass rewards are excluded from refinery ROI.</p>`;
}

function verdict(
  key: RefineDiscountKey,
  pct: number,
  netGain: number,
  passPrice: number,
  taskEnabled: boolean,
): { label: string; tone: string } {
  if ((key === 'daily' || key === 'weekly') && !taskEnabled) return { label: 'TASKS DISABLED', tone: 'muted' };
  if (!(pct > 0)) return { label: 'DISCOUNT UNAVAILABLE', tone: 'muted' };
  if (key === 'pass' && !(passPrice > 0)) return { label: 'SET PASS PRICE', tone: 'muted' };
  if (netGain > 0.5) return { label: 'WORTH IT', tone: 'positive' };
  if (netGain < -0.5) return { label: 'NOT WORTH IT', tone: 'negative' };
  return { label: 'BREAK EVEN', tone: 'neutral' };
}

function discountCard(
  scope: Scope,
  key: RefineDiscountKey,
  projectedGrit: number,
  period: DiscountPeriod,
): string {
  const settings = store.state.settings.refineDiscounts;
  const costs = scopeCosts(scope);
  const taskEnabled = number(settings.taskDiscountsEnabled) >= 0.5;
  const pct = discountPct(settings, key);
  const grindCost = key === 'daily' ? costs.dailyGrind : key === 'weekly' ? costs.weeklyGrind : settings.passPrice;
  const result = refineDiscountRoi({
    candidate: key,
    baseRefineRate: store.state.settings.refineRate,
    settings,
    projectedGrit,
    grindCost,
    horizonSeconds: period.seconds,
  });
  const status = verdict(key, pct, result.netGain, Math.max(0, number(settings.passPrice)), taskEnabled);
  const active = key === 'daily'
    ? number(settings.dailyActive) >= 0.5
    : key === 'weekly'
      ? number(settings.weeklyActive) >= 0.5
      : number(settings.passActive) >= 0.5;
  const label = key === 'daily' ? 'DAILY TASKS' : key === 'weekly' ? 'WEEKLY TASKS' : 'SEASONAL PASS';
  const breakEvenTime = Number.isFinite(result.breakEvenSeconds)
    ? result.breakEvenSeconds <= period.seconds
      ? duration(result.breakEvenSeconds)
      : `>${period.label}`
    : '—';
  const costCopy = key === 'pass'
    ? `${compact(Math.max(0, number(settings.passPrice)))} $GRIND user-entered Season Pass price.`
    : `${compact(Math.max(0, number(grindCost)))} $GRIND current completion cost.`;

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
      <div>
        <small>${period.earningLabel} PROJECTED EARNINGS</small>
        <b>${result.withoutRate > 0 ? `${compact(result.withoutGrind)} $GRIND` : '—'}</b>
        <span>${compact(projectedGrit)} GRIT projected over ${period.label}, before applying this candidate discount.</span>
      </div>
      <div>
        <small>DISCOUNT VALUE</small>
        <b class="positive">${result.available ? `+${compact(result.grossGain)} $GRIND` : '—'}</b>
        <span>Extra $GRIND from the cheaper conversion over the same ${period.label} production.</span>
      </div>
      <div>
        <small>NET AFTER CURRENT COST</small>
        <b class="${result.netGain >= 0 ? 'positive' : 'negative'}">${result.available ? `${result.netGain >= 0 ? '+' : '−'}${compact(Math.abs(result.netGain))} $GRIND` : '—'}</b>
        <span>${costCopy}</span>
      </div>
      <div>
        <small>BREAK-EVEN</small>
        <b>${Number.isFinite(result.breakEvenGrind) ? `${compact(result.breakEvenGrind)} $GRIND` : '—'}</b>
        <span>${Number.isFinite(result.breakEvenGrit) ? `${compact(result.breakEvenGrit)} GRIT · est. ${breakEvenTime}` : 'Set a valid candidate cost first.'}</span>
      </div>
    </div>
    ${key === 'daily' || key === 'weekly' ? taskCostInputs(scope, key) : passPriceInput()}
    <div class="discount-card-foot">
      <span>${active ? 'ACTIVE NOW · included in Build Planner and Deck Simulator $GRIND output.' : 'WHAT-IF ONLY · does not change output until switched ON.'}</span>
      <time>${period.label} ROI window</time>
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

  return panel(
    `${panelNumber} // REFINE DISCOUNT ROI`,
    'Compare the current $GRIND cost to earn each discount against the production window it actually helps: 24H for Daily Tasks and 7D for Weekly Tasks / Seasonal Pass.',
    `<div class="discount-stack-summary">
      <div><small>BASE REFINE RATE</small><strong>${compact(baseRate)}</strong><span>GRIT / $GRIND</span></div>
      <div class="effective"><small>ACTIVE-STACK RATE</small><strong>${compact(effectiveRate)}</strong><span>${combinedPct > 0 ? `${combinedPct.toFixed(2)}% cheaper after compounding` : 'no active discount'}</span></div>
      <p>${projectionNote} Daily = 24H; Weekly = 7D; Seasonal Pass = 7D. Every ROI cost input is $GRIND only.</p>
    </div>
    <div class="discount-roi-grid">
      ${discountCard(scope, 'daily', dailyGrit, dailyPeriod)}
      ${discountCard(scope, 'weekly', weeklyGrit, weeklyPeriod)}
      ${discountCard(scope, 'pass', passGrit, passPeriod)}
    </div>`,
  );
}
