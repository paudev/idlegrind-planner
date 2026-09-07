import {
  activeDiscountPct,
  discountPct,
  effectiveRefineRate,
  nextDailyTaskReset,
  nextWeeklyTaskReset,
  refineDiscountRoi,
} from '../core/refine-discounts';
import { compact, duration, inputText, number } from '../core/format';
import { store } from '../core/state';
import type { RefineDiscountCosts, RefineDiscountKey, Scope } from '../types';
import { panel } from './components';

interface RefineDiscountProjection {
  scope: Scope;
  panelNumber: number;
  projectGrit: (seconds: number) => number;
  projectionNote: string;
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

function costInputs(scope: Scope, key: 'daily' | 'weekly'): string {
  const costs = scopeCosts(scope);
  const prefix = scope === 'planner' ? 'state.planner.discountCosts' : 'deck.discountCosts';
  const grit = key === 'daily' ? costs.dailyGrit : costs.weeklyGrit;
  const grind = key === 'daily' ? costs.dailyGrind : costs.weeklyGrind;
  const gritKey = key === 'daily' ? 'dailyGrit' : 'weeklyGrit';
  const grindKey = key === 'daily' ? 'dailyGrind' : 'weeklyGrind';

  return `<div class="discount-cost-grid">
    <label>
      <span>REMAINING GRIT COST</span>
      <input data-path="${prefix}.${gritKey}" data-num value="${inputText(grit)}">
    </label>
    <label>
      <span>REMAINING $GRIND COST</span>
      <input data-path="${prefix}.${grindKey}" data-num value="${inputText(grind)}">
    </label>
  </div>`;
}

function verdict(
  key: RefineDiscountKey,
  pct: number,
  netGain: number,
  passPrice: number,
  taskEnabled: boolean,
): { label: string; tone: string } {
  if ((key === 'daily' || key === 'weekly') && !taskEnabled) return { label: 'TASKS DISABLED', tone: 'muted' };
  if (!(pct > 0)) return { label: 'SET DISCOUNT %', tone: 'muted' };
  if (key === 'pass' && !(passPrice > 0)) return { label: 'SET PASS PRICE', tone: 'muted' };
  if (netGain > 0.5) return { label: 'WORTH IT', tone: 'positive' };
  if (netGain < -0.5) return { label: 'NOT WORTH IT', tone: 'negative' };
  return { label: 'BREAK EVEN', tone: 'neutral' };
}

function discountCard(
  scope: Scope,
  key: RefineDiscountKey,
  resetAt: number,
  projectedGrit: number,
  horizonSeconds: number,
): string {
  const settings = store.state.settings.refineDiscounts;
  const costs = scopeCosts(scope);
  const taskEnabled = number(settings.taskDiscountsEnabled) >= 0.5;
  const pct = discountPct(settings, key);
  const gritCost = key === 'daily' ? costs.dailyGrit : key === 'weekly' ? costs.weeklyGrit : 0;
  const grindCost = key === 'daily' ? costs.dailyGrind : key === 'weekly' ? costs.weeklyGrind : settings.passPrice;
  const result = refineDiscountRoi({
    candidate: key,
    baseRefineRate: store.state.settings.refineRate,
    settings,
    projectedGrit,
    gritCost,
    grindCost,
    horizonSeconds,
  });
  const status = verdict(key, pct, result.netGain, Math.max(0, number(settings.passPrice)), taskEnabled);
  const active = key === 'daily'
    ? number(settings.dailyActive) >= 0.5
    : key === 'weekly'
      ? number(settings.weeklyActive) >= 0.5
      : number(settings.passActive) >= 0.5;
  const label = key === 'daily' ? 'DAILY TASKS' : key === 'weekly' ? 'WEEKLY TASKS' : 'SEASONAL PASS';
  const resetLabel = key === 'daily' ? 'daily reset · 6:05 PM PT' : 'Sunday reset · 6:05 PM PT';
  const breakEvenTime = Number.isFinite(result.breakEvenSeconds)
    ? result.breakEvenSeconds <= horizonSeconds
      ? duration(result.breakEvenSeconds)
      : `>${duration(horizonSeconds, { ready: false })}`
    : '—';
  const costCopy = key === 'pass'
    ? `${compact(settings.passPrice)} $GRIND pass price · refinery discount only; other Pass rewards excluded.`
    : `${compact(Math.max(0, number(gritCost)))} GRIT + ${compact(Math.max(0, number(grindCost)))} $GRIND remaining task cost.`;

  return `<article class="discount-roi-card ${status.tone}">
    <div class="discount-roi-head">
      <div>
        <small>${label}</small>
        <strong>${pct > 0 ? `${pct.toFixed(2).replace(/\.00$/, '')}% CHEAPER` : 'DISCOUNT NOT SET'}</strong>
      </div>
      <span class="discount-verdict ${status.tone}">${status.label}</span>
    </div>
    ${activeChoice(key)}
    <div class="discount-rate-line">
      <span><small>WITHOUT</small><b>${result.withoutRate > 0 ? `${compact(result.withoutRate)} GRIT / $GRIND` : '—'}</b></span>
      <span class="with"><small>WITH</small><b>${result.withRate > 0 ? `${compact(result.withRate)} GRIT / $GRIND` : '—'}</b></span>
    </div>
    <div class="discount-roi-metrics">
      <div><small>PROJECTED GRIT</small><b>${compact(projectedGrit)}</b><span>${resetLabel} · ${duration(horizonSeconds, { ready: false })} left</span></div>
      <div><small>GROSS DISCOUNT GAIN</small><b class="positive">${result.available ? `+${compact(result.grossGain)} $GRIND` : '—'}</b><span>Before task/pass cost.</span></div>
      <div><small>NET BENEFIT</small><b class="${result.netGain >= 0 ? 'positive' : 'negative'}">${result.available ? `${result.netGain >= 0 ? '+' : '−'}${compact(Math.abs(result.netGain))} $GRIND` : '—'}</b><span>${costCopy}</span></div>
      <div><small>BREAK-EVEN</small><b>${Number.isFinite(result.breakEvenGrit) ? `${compact(result.breakEvenGrit)} GRIT` : '—'}</b><span>${Number.isFinite(result.breakEvenGrind) ? `${compact(result.breakEvenGrind)} baseline $GRIND · est. ${breakEvenTime}` : 'Set a valid discount first.'}</span></div>
    </div>
    ${key === 'daily' || key === 'weekly' ? costInputs(scope, key) : ''}
    <div class="discount-card-foot">
      <span>${active ? 'ACTIVE NOW · included in Build Planner and Deck Simulator $GRIND output.' : 'WHAT-IF ONLY · does not change output until switched ON.'}</span>
      <time datetime="${new Date(resetAt).toISOString()}">resets in ${duration(horizonSeconds, { ready: false })}</time>
    </div>
  </article>`;
}

export function renderRefineDiscountRoi({
  scope,
  panelNumber,
  projectGrit,
  projectionNote,
}: RefineDiscountProjection): string {
  const now = Date.now();
  const dailyReset = nextDailyTaskReset(now);
  const weeklyReset = nextWeeklyTaskReset(now);
  const dailySeconds = Math.max(0, (dailyReset - now) / 1000);
  const weeklySeconds = Math.max(0, (weeklyReset - now) / 1000);
  const dailyGrit = Math.max(0, number(projectGrit(dailySeconds)));
  const weeklyGrit = Math.max(0, number(projectGrit(weeklySeconds)));
  const settings = store.state.settings.refineDiscounts;
  const baseRate = Math.max(0, number(store.state.settings.refineRate));
  const effectiveRate = effectiveRefineRate(baseRate, settings);
  const combinedPct = activeDiscountPct(baseRate, settings);

  return panel(
    `${panelNumber} // REFINE DISCOUNT ROI`,
    'Decide whether Daily Tasks, Weekly Tasks, or the Seasonal Pass pays for itself from the refinery discount before it expires.',
    `<div class="discount-stack-summary">
      <div><small>BASE REFINE RATE</small><strong>${compact(baseRate)}</strong><span>GRIT / $GRIND</span></div>
      <div class="effective"><small>ACTIVE-STACK RATE</small><strong>${compact(effectiveRate)}</strong><span>${combinedPct > 0 ? `${combinedPct.toFixed(2)}% cheaper after compounding` : 'no active discount'}</span></div>
      <p>${projectionNote} Daily/weekly percentages are editable because the game frontend receives them from server state. Discounts compound rather than add.</p>
    </div>
    <div class="discount-roi-grid">
      ${discountCard(scope, 'daily', dailyReset, dailyGrit, dailySeconds)}
      ${discountCard(scope, 'weekly', weeklyReset, weeklyGrit, weeklySeconds)}
      ${discountCard(scope, 'pass', weeklyReset, weeklyGrit, weeklySeconds)}
    </div>`,
  );
}
