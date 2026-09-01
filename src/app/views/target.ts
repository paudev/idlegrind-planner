import { DAY } from '../config/economy';
import { compact, number } from '../core/format';
import { store } from '../core/state';
import { field, intro, metric, pageStack, panel } from '../ui/components';

export function renderTargetView(): string {
  const target = Math.max(0, number(store.state.target.grindPerDay));
  const refine = Math.max(0, number(store.state.settings.refineRate));
  const rate = target > 0 && refine > 0 ? target * refine / DAY : 0;

  return pageStack(
    intro(
      'TARGET RATE',
      'Convert a $GRIND / 24H target into the final GRIT/s rate you need. This page does not assume a deck composition.',
    ),
    panel(
      'TARGET RATE',
      'Rate requirement only.',
      `<div class="module-grid two balanced">
        ${field('state.target.grindPerDay', '$GRIND / 24H TARGET', target)}
        <div class="hero-output">
          <small>REQUIRED FINAL RATE</small>
          <strong>${target > 0 && refine < 1000 ? 'SET REFINE RATE' : `${compact(rate)}<em>/s</em>`}</strong>
          <p>${refine >= 1000 ? `At ${compact(refine, 1)} GRIT = 1 $GRIND` : 'Set refinery rate under Settings.'}</p>
        </div>
      </div>
      <div class="metric-grid">
        ${metric('GRIT / 24H', compact(target * refine), 'gold')}
        ${metric('GRIT / HOUR', compact(target * refine / 24))}
        ${metric('GRIT / MINUTE', compact(target * refine / 1440))}
        ${metric('$GRIND / 24H', compact(target), 'green')}
      </div>`,
    ),
  );
}
