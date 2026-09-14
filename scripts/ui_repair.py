from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'missing replacement target: {label}')
    return text.replace(old, new, 1)


deck_path = Path('src/app/views/deck.ts')
deck = deck_path.read_text()
deck = replace_once(deck, """import {
  dailyNodeBoostToggle,
  permanentMathSummary,
  productionMultiplierText,
  simulatedNodeRow,
  stakingNodeRow,
} from '../ui/staking';""", """import {
  dailyNodeBoostToggle,
  simulatedNodeRow,
  stakingNodeRow,
} from '../ui/staking';""", 'deck staking imports')
deck = replace_once(deck, """  const baseRefine = Math.max(0, number(store.state.settings.refineRate));
  const currentMath = permanentMathSummary(baseRefine, scenario.currentBuffs);
  const simulatedMath = permanentMathSummary(baseRefine, scenario.simulatedBuffs);
  const currentBreakdown = productionMultiplierText(scenario.currentBuffs);
  const simulatedBreakdown = productionMultiplierText(scenario.simulatedBuffs);
""", "", 'deck setup math helpers')
deck = replace_once(deck, """    `${buffsUi(store.deck.buffs, 'deck')}
    ${stakingNodeRow(store.deck.buffs, 'deck')}
    <div class=\"staking-breakdown\">
      ${metric('PERMANENT BUILD MULTIPLIER', `×${multiplier(store.deck.buffs).toFixed(3)}`, '', `Base ${compact(scenario.currentStats.base)}/s · ${currentBreakdown}`)}
      ${metric('PERMANENT REFINERY', `${compact(currentMath.refineRate)} GRIT / $GRIND`, '', `${currentMath.refineText}${currentMath.nodeRefinePct ? ` · ${currentMath.nodeLabel} refine −${currentMath.nodeRefinePct}%` : ''}`)}
    </div>`,""", """    `${buffsUi(store.deck.buffs, 'deck')}
    ${stakingNodeRow(store.deck.buffs, 'deck')}`,""", 'deck current buffs breakdown')
deck = replace_once(deck, """    ${dailyNodeBoostToggle(scenario.simulatedBuffs.stakingNode, store.deck.includeDailyNodeBoost)}
    <div class=\"staking-breakdown\">
      ${metric('SIMULATED BUILD MULTIPLIER', `×${multiplier(scenario.simulatedBuffs).toFixed(3)}`, '', `Base ${compact(scenario.fullStats.base)}/s · ${simulatedBreakdown}`)}
      ${metric('SIMULATED REFINERY', `${compact(simulatedMath.refineRate)} GRIT / $GRIND`, '', simulatedMath.nodeRefinePct ? `${simulatedMath.refineText} · ${simulatedMath.nodeLabel} compounds −${simulatedMath.nodeRefinePct}% refine.` : simulatedMath.refineText)}
    </div>
    ${choiceRow('ADD VIAL', vialButtons, 'Added after current overclock. Vial time and the first daily Node boost form the initial temporary 2× window; the Node boost repeats every 24 hours in multi-day funding and ROI projections.')}
    ${choiceRow('COSTING', vialCostControl, hasSelectedVial ? `Uses the editable ${store.deck.vialHours}H vial market reference.` : 'Select a vial first. Acquisition costing cannot affect output without a simulated vial.')}`,""", """    ${dailyNodeBoostToggle(scenario.simulatedBuffs.stakingNode, store.deck.includeDailyNodeBoost)}
    ${choiceRow('ADD VIAL', vialButtons, 'Extra one-time 2× time. Daily Node boost remains a separate recurring perk.')}
    ${choiceRow('COSTING', vialCostControl, hasSelectedVial ? `Optional vial purchase cost · ${store.deck.vialHours}H market reference.` : 'Select a vial to enable acquisition costing.')}`,""", 'deck simulation breakdown')
deck = replace_once(deck, """    ['SUSTAINABLE $GRIND / 24H', sustainableCurrentGrind !== null ? `${compact(sustainableCurrentGrind)} $GRIND` : '—', sustainableSimulatedGrind !== null ? `${compact(sustainableSimulatedGrind)} $GRIND` : '—', sustainableCurrentGrind !== null && sustainableSimulatedGrind !== null ? signed(sustainableSimulatedGrind - sustainableCurrentGrind, ' $GRIND') : '—'],
    ['BOOSTED $GRIND / 24H', currentDayGrind !== null ? `${compact(currentDayGrind)} $GRIND` : '—', simulatedDayGrind !== null ? `${compact(simulatedDayGrind)} $GRIND` : '—', currentDayGrind !== null && simulatedDayGrind !== null ? signed(simulatedDayGrind - currentDayGrind, ' $GRIND') : '—'],
    ...(includeVialCost ? [[
      'NET BOOSTED $GRIND / 24H',
      currentDayGrind !== null ? `${compact(currentDayGrind)} $GRIND` : '—',
      netSimulatedDayGrind !== null ? `${compact(netSimulatedDayGrind)} $GRIND` : '—',
      netDayChange !== null ? signed(netDayChange, ' $GRIND') : '—',
    ] as CompareRow] : []),
""", "", 'deck duplicate 24h rows')
deck = replace_once(deck, """    ${compareRows(rows)}
    ${vialEconomics}""", """    <div class=\"projection-summary\">
      <div class=\"projection-card current\">
        <small>CURRENT · SUSTAINABLE 24H</small>
        <strong>${sustainableCurrentGrind !== null ? `${compact(sustainableCurrentGrind)} $GRIND` : '—'}</strong>
        <span>${currentDayGrind !== null && scenario.existingOverclock > 0 ? `With current overclock: ${compact(currentDayGrind)} $GRIND` : 'Permanent rate only · no temporary 2× time'}</span>
      </div>
      <div class=\"projection-card simulated\">
        <small>SIMULATED · SUSTAINABLE 24H</small>
        <strong>${sustainableSimulatedGrind !== null ? `${compact(sustainableSimulatedGrind)} $GRIND` : '—'}</strong>
        <span>${sustainableCurrentGrind !== null && sustainableSimulatedGrind !== null ? `${signed(sustainableSimulatedGrind - sustainableCurrentGrind, ' $GRIND')} vs current · permanent QN/Node changes only` : 'Permanent QN/Node changes only'}</span>
      </div>
      <div class=\"projection-card boosted\">
        <small>SIMULATED · BOOSTED 24H</small>
        <strong>${simulatedDayGrind !== null ? `${compact(simulatedDayGrind)} $GRIND` : '—'}</strong>
        <span>${scenario.simulatedOverclock > 0 ? `${duration(scenario.simulatedOverclock, { ready: false })} temporary 2× window${scenario.nodeBoostSeconds ? ' · Node portion repeats daily' : ''}` : 'No temporary boost selected'}</span>
      </div>
    </div>
    ${compareRows(rows)}
    ${vialEconomics}""", 'deck output summary')
deck_path.write_text(deck)

planner_path = Path('src/app/views/planner.ts')
planner = planner_path.read_text()
planner = replace_once(planner, """import {
  permanentMathSummary,
  productionMultiplierText,
  stakingNodeRow,
} from '../ui/staking';""", """import { stakingNodeRow } from '../ui/staking';""", 'planner staking imports')
planner = replace_once(planner, """  const math = permanentMathSummary(baseRefine, store.state.planner.buffs);
  const multiplierBreakdown = productionMultiplierText(store.state.planner.buffs);
""", "", 'planner setup math helpers')
planner = replace_once(planner, """        <small>PERMANENT BUILD MULTIPLIER</small>""", """        <small>BUILD MULTIPLIER</small>""", 'planner multiplier label')
planner = replace_once(planner, """    })}
    ${stakingNodeRow(store.state.planner.buffs, 'planner')}
    <div class=\"staking-breakdown\">
      ${metric('PERMANENT MULTIPLIER', `×${buildMultiplier.toFixed(3)}`, '', multiplierBreakdown)}
      ${metric('PERMANENT REFINERY', `${compact(math.refineRate)} GRIT / $GRIND`, '', node.refinePct ? `${node.label} compounds −${node.refinePct}% refine after holder tier.` : 'No Node refine discount.')}
      ${metric('DAILY NODE BOOST', node.dailyBoostHours ? `${node.dailyBoostHours}H @ 2× / DAY` : 'NONE', node.dailyBoostHours ? 'green' : '', 'Repeats every 24 hours in multi-day setup/ROI projections; never lowers the stable minimum QNs.')}
    </div>`,""", """    })}
    ${stakingNodeRow(store.state.planner.buffs, 'planner')}`,""", 'planner buffs breakdown')
planner = replace_once(planner, """    <div class=\"staking-breakdown\">
      ${metric('STAKING NODE', node.label, node.id ? 'green' : '', node.id ? `${node.hashPct ? `+${node.hashPct}% hash · ` : ''}−${node.refinePct}% refine${node.dailyBoostHours ? ` · ${node.dailyBoostHours}h daily 2×` : ''}` : 'No staking bonuses selected.')}
      ${metric('NODE PERMANENT GAIN', node.id ? `+${compact(nodePermanentGain)} $GRIND / 24H` : '—', nodePermanentGain > 0 ? 'green' : '', 'Same minimum hardware compared with Node disabled; includes Node hash + refine only.')}
      ${metric('NODE DAILY BOOST GAIN', dailyNodeHours ? `+${compact(nodeDailyGain)} $GRIND / 24H` : '—', nodeDailyGain > 0 ? 'green' : '', dailyNodeHours ? `${dailyNodeHours}h/day at 2×; excluded from the minimum-QN requirement.` : 'Selected Node has no daily boost.')}
      ${metric('NODE REFINE SAVED', nodeRefineSaved > 0 ? `${compact(nodeRefineSaved)} GRIT / $GRIND` : '—', nodeRefineSaved > 0 ? 'green' : '', 'Savings versus the same holder tier with Node disabled.')}
    </div>
""", """    ${node.id ? `<div class=\"staking-breakdown node-impact-strip\">
      ${metric('NODE EFFECT', node.label, 'green', `${node.hashPct ? `+${node.hashPct}% hash · ` : ''}−${node.refinePct}% refine${nodeRefineSaved > 0 ? ` · saves ${compact(nodeRefineSaved)} GRIT/$GRIND` : ''}`)}
      ${metric('PERMANENT OUTPUT GAIN', `+${compact(nodePermanentGain)} $GRIND / 24H`, nodePermanentGain > 0 ? 'green' : '', 'Same minimum hardware with Node disabled vs enabled.')}
      ${metric('DAILY BOOST GAIN', dailyNodeHours ? `+${compact(nodeDailyGain)} $GRIND / 24H` : 'NONE', nodeDailyGain > 0 ? 'green' : '', dailyNodeHours ? `${dailyNodeHours}h/day at 2× · never lowers minimum QNs.` : 'This Node has no daily boost.')}
    </div>` : ''}
""", 'planner node impact strip')
planner_path.write_text(planner)

css_path = Path('src/app/styles/staking.css')
css = css_path.read_text()
if '.projection-summary {' not in css:
    css += """

/* Clear 24H hierarchy for Deck Simulator output. */
.projection-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 12px 0;
}

.projection-card {
  min-width: 0;
  min-height: 92px;
  padding: 12px 13px;
  border: 1px solid #29362d;
  border-radius: 7px;
  background: #090e0a;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.projection-card small {
  color: #748078;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: .08em;
}

.projection-card strong {
  margin-top: 4px;
  color: #e0e7e1;
  font-size: 19px;
  line-height: 1.15;
}

.projection-card span {
  margin-top: 5px;
  color: #6f7c72;
  font-size: 10px;
  line-height: 1.4;
}

.projection-card.simulated {
  border-color: #31513f;
}

.projection-card.simulated strong {
  color: var(--green);
}

.projection-card.boosted {
  border-color: #60412e;
  background: rgba(255, 149, 103, .025);
}

.projection-card.boosted strong {
  color: var(--orange);
}

.node-impact-strip {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

@media (max-width: 800px) {
  .projection-summary,
  .node-impact-strip {
    grid-template-columns: 1fr;
  }
}
"""
css_path.write_text(css)
