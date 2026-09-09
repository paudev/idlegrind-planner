import { DAY } from '../config/economy';
import { TIER_OPTIONS } from '../config/game';
import { compact, number } from '../core/format';
import { holderTierRefineDiscountPct, holderTierRefineRate } from '../core/refine-discounts';
import { store } from '../core/state';
import { choiceRow, field, intro, metric, pageStack, panel } from '../ui/components';

export function renderTargetView(): string {
  const target = Math.max(0, number(store.state.target.grindPerDay));
  const currentRefine = Math.max(0, number(store.state.settings.refineRate));
  const tier = number(store.state.target.tier, 1);
  const tierPct = holderTierRefineDiscountPct(tier);
  const refine = holderTierRefineRate(currentRefine, tier);
  const validRefine = refine >= 1000;
  const rate = target > 0 && validRefine ? target * refine / DAY : 0;
  const gritPerDay = validRefine ? target * refine : null;
  const tierChoices = TIER_OPTIONS.map((option) => {
    const label = option.refinePct ? `${option.label} · −${option.refinePct}% REFINE` : option.label;
    return `<label class="chip ${Math.abs(tier - option.mult) < 1e-9 ? 'active' : ''}">
      <input type="radio" hidden name="target-holder-tier" data-path="state.target.tier" value="${option.mult}" ${Math.abs(tier - option.mult) < 1e-9 ? 'checked' : ''}>
      ${label}
    </label>`;
  }).join('');

  return pageStack(
    intro(
      'TARGET RATE',
      'Convert a $GRIND / 24H target into the final GRIT/s rate you need using the current game refine rate and selected holder-tier refinery discount.',
    ),
    panel(
      'TARGET RATE',
      'Rate requirement only. Daily, Weekly, and Seasonal Pass discounts are not applied here.',
      `<div class="module-grid two balanced">
        ${field('state.target.grindPerDay', '$GRIND / 24H TARGET', target)}
        <div class="hero-output">
          <small>REQUIRED FINAL RATE</small>
          <strong>${target > 0 && !validRefine ? 'SET REFINE RATE' : `${compact(rate)}<em>/s</em>`}</strong>
          <p>${validRefine
            ? `${compact(currentRefine, 1)} current → ${compact(refine, 1)} GRIT / $GRIND${tierPct ? ` after ${tierPct}% holder discount` : ''}`
            : 'Set a valid current refinery rate under Settings.'}</p>
        </div>
      </div>
      ${choiceRow(
        'HOLDER TIER',
        tierChoices,
        'Applies the holder-tier refinery discount to the current game rate. The tier hash multiplier is not applied here because this page solves for the final required production rate.',
      )}
      <div class="metric-grid">
        ${metric('GRIT / 24H', gritPerDay !== null ? compact(gritPerDay) : '—', 'gold')}
        ${metric('GRIT / HOUR', gritPerDay !== null ? compact(gritPerDay / 24) : '—')}
        ${metric('GRIT / MINUTE', gritPerDay !== null ? compact(gritPerDay / 1440) : '—')}
        ${metric('$GRIND / 24H', compact(target), 'green')}
      </div>`,
    ),
  );
}
