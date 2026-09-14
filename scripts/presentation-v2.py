from pathlib import Path


def between_replace(text: str, start_marker: str, end_marker: str, replacement: str, label: str) -> str:
    start = text.find(start_marker)
    if start < 0:
        raise SystemExit(f'missing start marker: {label}')
    end = text.find(end_marker, start)
    if end < 0:
        raise SystemExit(f'missing end marker: {label}')
    return text[:start] + replacement + text[end:]


# Deck Simulator
deck_path = Path('src/app/views/deck.ts')
deck = deck_path.read_text()
deck = deck.replace('  CompareRow,\n', '')
deck = deck.replace('  compareRows,\n', '')

old_current_buffs = """  )}${panel(
    '2 // CURRENT BUFFS',
    'Permanent production and refinery effects currently active on the deck.',
    `${buffsUi(store.deck.buffs, 'deck')}
    ${stakingNodeRow(store.deck.buffs, 'deck')}`,
    `×${multiplier(store.deck.buffs).toFixed(2)}`,
  )}${panel("""
new_current_buffs = """  )}${panel(
    '2 // CURRENT BUFFS',
    'Set the permanent buffs that are active on the current deck.',
    `${buffsUi(store.deck.buffs, 'deck')}
    ${stakingNodeRow(store.deck.buffs, 'deck')}`,
  )}${panel("""
if old_current_buffs not in deck:
    raise SystemExit('missing deck current buffs panel')
deck = deck.replace(old_current_buffs, new_current_buffs, 1)

deck = deck.replace("""  const simulatedAverage = hasProjectionWindow
    ? scenario.progress!.mined / scenario.cashoutLeft!
    : null;
""", '', 1)

deck = between_replace(
    deck,
    '  const netSimulatedDayGrind =',
    '\n\n  const vialEconomics',
    """  const next = nextCashoutAt(scenario.cycle);
  const currentNode = stakingNode(scenario.currentBuffs.stakingNode);
  const simulatedNode = stakingNode(scenario.simulatedBuffs.stakingNode);
  const permanentDayDelta = sustainableCurrentGrind !== null && sustainableSimulatedGrind !== null
    ? sustainableSimulatedGrind - sustainableCurrentGrind
    : null;
  const temporaryBoostGain = simulatedDayGrind !== null && sustainableSimulatedGrind !== null
    ? Math.max(0, simulatedDayGrind - sustainableSimulatedGrind)
    : null;
  const nodeChangeText = currentNode.id === simulatedNode.id
    ? simulatedNode.label
    : `${currentNode.label} → ${simulatedNode.label}`;
  const boostSources = [
    scenario.existingOverclock > 0 ? `${duration(scenario.existingOverclock, { ready: false })} current overclock` : '',
    scenario.nodeBoostSeconds > 0 ? `${duration(scenario.nodeBoostSeconds, { ready: false })} Node/day` : '',
    vialHours > 0 ? `${vialHours}h vial` : '',
  ].filter(Boolean).join(' + ');
""",
    'deck result variables',
)

deck = between_replace(
    deck,
    '  const vialEconomics',
    '  const pricing = qnPricing();',
    """  const vialEconomics = hasVial ? `<div class=\"node-value-panel\">
    <h3>VIAL VALUE · ${vialHours}H</h3>
    <div class=\"result-data-grid\">
      <div class=\"result-data-card\"><small>VIAL-ONLY GAIN / 24H</small><strong class=\"positive\">${vialAddedGrind !== null ? `+${compact(vialAddedGrind)} $GRIND` : '—'}</strong><span>Extra output from the vial only.</span></div>
      <div class=\"result-data-card\"><small>ACQUISITION COST</small><strong>${includeVialCost ? `−${compact(vialCharge)} $GRIND` : 'NOT DEDUCTED'}</strong><span>${includeVialCost ? 'One-time market cost is included.' : `${compact(vialPrice)} $GRIND market reference.`}</span></div>
      <div class=\"result-data-card\"><small>NET VIAL VALUE</small><strong class=\"${netVialImpact !== null && netVialImpact >= 0 ? 'positive' : ''}\">${netVialImpact !== null ? signed(netVialImpact, ' $GRIND') : '—'}</strong><span>${includeVialCost ? 'Vial-only gain minus purchase cost.' : 'Gross vial gain because cost is excluded.'}</span></div>
    </div>
  </div>` : '';

  const outputPanel = panel(
    '4 // OUTPUT',
    'Permanent 24H output is the main comparison. Temporary boosts and cashout timing are shown separately.',
    `${!scenario.fullFitsCap ? `<div class=\"warning\">Simulated build requires ${compact(scenario.fullStats.slots)} slots but the configured maximum is ${compact(scenario.slotCap)}.</div>` : ''}
    <div class=\"result-focus-grid\">
      <div class=\"result-focus-card\">
        <small>CURRENT · SUSTAINABLE / 24H</small>
        <strong>${sustainableCurrentGrind !== null ? `${compact(sustainableCurrentGrind)} $GRIND` : '—'}</strong>
        <p>${scenario.currentQns} QNs · ${compact(scenario.currentRate)}/s · ${compact(scenario.currentRefine)} GRIT/$GRIND</p>
      </div>
      <div class=\"result-focus-card simulated\">
        <small>SIMULATED · SUSTAINABLE / 24H</small>
        <strong>${sustainableSimulatedGrind !== null ? `${compact(sustainableSimulatedGrind)} $GRIND` : '—'}</strong>
        <p>${scenario.targetQns} QNs · ${compact(scenario.fullRate)}/s · ${compact(scenario.simulatedRefine)} GRIT/$GRIND</p>
      </div>
    </div>
    <div class=\"result-delta-bar\">
      <span>Permanent change · ${nodeChangeText}</span>
      <strong>${permanentDayDelta !== null ? signed(permanentDayDelta, ' $GRIND / 24H') : '—'}</strong>
    </div>
    ${scenario.simulatedOverclock > 0 ? `<div class=\"boost-summary\">
      <div class=\"boost-summary-head\">
        <div><small>SIMULATED · WITH TEMPORARY BOOST</small><strong>${simulatedDayGrind !== null ? `${compact(simulatedDayGrind)} $GRIND / 24H` : '—'}</strong></div>
        <span>${temporaryBoostGain !== null ? `+${compact(temporaryBoostGain)} $GRIND over sustainable` : ''}${boostSources ? `<br>${boostSources}` : ''}</span>
      </div>
    </div>` : ''}
    <div class=\"result-section-label\">WHAT CHANGED</div>
    <div class=\"result-data-grid\">
      <div class=\"result-data-card\"><small>QUANTUM NODES</small><strong>${scenario.currentQns} → ${scenario.targetQns}</strong><span>${scenario.addedQns ? `+${scenario.addedQns} QNs` : 'No QNs added'}</span></div>
      <div class=\"result-data-card\"><small>NORMAL HASHPOWER</small><strong>${compact(scenario.currentRate)}/s → ${compact(scenario.fullRate)}/s</strong><span>${signed(scenario.fullRate - scenario.currentRate, '/s')}</span></div>
      <div class=\"result-data-card\"><small>REFINE RATE</small><strong>${compact(scenario.currentRefine)} → ${compact(scenario.simulatedRefine)}</strong><span>GRIT required per $GRIND</span></div>
      <div class=\"result-data-card\"><small>DECK SLOTS</small><strong>${compact(scenario.currentStats.slots)} → ${compact(scenario.fullStats.slots)}</strong><span>${scenario.fullFitsCap ? 'Fits configured cap' : 'Above configured cap'}</span></div>
    </div>
    ${configured ? `<div class=\"result-section-label\">NEXT CASHOUT</div>
    <div class=\"result-data-grid\">
      <div class=\"result-data-card\"><small>CURRENT BY CASHOUT</small><strong>${currentGrind !== null ? `${compact(currentGrind)} $GRIND` : '—'}</strong><span>Current deck + active overclock.</span></div>
      <div class=\"result-data-card\"><small>SIMULATED BY CASHOUT</small><strong class=\"positive\">${simulatedGrind !== null ? `${compact(simulatedGrind)} $GRIND` : '—'}</strong><span>${currentGrind !== null && simulatedGrind !== null ? signed(simulatedGrind - currentGrind, ' $GRIND') : '—'} vs current</span></div>
      <div class=\"result-data-card\"><small>QNs ACTIVE BY CASHOUT</small><strong>${scenario.progress!.qns} / ${scenario.targetQns}</strong><span>Sequential QN funding.</span></div>
      <div class=\"result-data-card\"><small>FULL BUILD READY</small><strong>${duration(scenario.fullBuildTime)}</strong><span>${next !== null ? `Cashout eligible ${formatLocalTime(next, false)}` : ''}</span></div>
    </div>` : `${info('Set a cashout time to see funding-aware output and how many simulated QNs become active before cashout.')}`}
    ${vialEconomics}`,
    sustainableSimulatedGrind !== null ? `${compact(sustainableSimulatedGrind, 2)} $GRIND / 24H` : 'SET REFINE RATE',
  );

""",
    'deck output presentation',
)

deck_path.write_text(deck)


# Build Planner
planner_path = Path('src/app/views/planner.ts')
planner = planner_path.read_text()

setup_start = planner.find('function setupPanels(): string {')
setup_end = planner.find('\nfunction outputView', setup_start)
if setup_start < 0 or setup_end < 0:
    raise SystemExit('missing planner setup function')
new_setup = """function setupPanels(): string {
  const baseRefine = Math.max(0, number(store.state.settings.refineRate));
  const refine = plannerRefineRate();
  const target = Math.max(0, number(store.state.planner.targetGrindPerDay));
  const targetGrit = target * refine;
  const tierRefinePct = holderTierRefineDiscountPct(store.state.planner.buffs.tier);
  const node = stakingNode(store.state.planner.buffs.stakingNode);

  return `${intro(
    'BUILD PLANNER',
    'Find the smallest permanent build that sustains your daily $GRIND target. Temporary boosts never reduce the official minimum.',
  )}${panel(
    '1 // DAILY TARGET',
    'Choose the sustainable $GRIND / 24H target.',
    `<div class=\"module-grid two planner-target-grid\">
      ${field('state.planner.targetGrindPerDay', '$GRIND / 24H TARGET', store.state.planner.targetGrindPerDay)}
      <div class=\"hero-output compact\">
        <small>GRIT REQUIRED / 24H</small>
        <strong>${compact(targetGrit)} GRIT</strong>
        <p>${compact(refine)} GRIT / $GRIND after permanent holder${tierRefinePct ? ` −${tierRefinePct}%` : ''}${node.refinePct ? ` + ${node.label} −${node.refinePct}%` : ''} refine.</p>
      </div>
    </div>`,
  )}${panel(
    '2 // BUFFS',
    'Set the permanent buffs the planned build will use. Vial and Node daily boost remain temporary.',
    `${buffsUi(store.state.planner.buffs, 'planner', {
      withVial: true,
      vialHours: store.state.planner.vialHours,
    })}
    ${stakingNodeRow(store.state.planner.buffs, 'planner')}`,
  )}${panel(
    '3 // RIG SETUP',
    'Quantum Node is auto-filled; add the fixed rigs that belong in the target build.',
    `${quantumNodeReference()}
    <div class=\"rig-select-label\"><b>SELECT A RIG</b><span>Click to add it to the target build.</span></div>
    <div class=\"quickadd\">${rigButtons('planner')}</div>
    <div class=\"righead\"><span>RIG</span><span>QTY</span><span>BASE /s</span><span>+ / QN</span><span>SLOTS</span><span></span></div>
    ${rigList(store.state.planner.rigs, 'planner')}`,
  )}`;
}
"""
planner = planner[:setup_start] + new_setup + planner[setup_end:]

old_node_calc_start = planner.find('  const noNodeBuffs = withStakingNode')
old_node_calc_end = planner.find('\n\n  const extraQns =', old_node_calc_start)
if old_node_calc_start < 0 or old_node_calc_end < 0:
    raise SystemExit('missing planner node calc block')
new_node_calc = """  const noNodeBuffs = withStakingNode(store.state.planner.buffs, 0);
  const noNodeRefine = permanentRefineRate(Math.max(0, number(store.state.settings.refineRate)), noNodeBuffs);
  const noNodeSolution = solveMinimumBuild({
    targetGrindPerDay: targetGrind,
    refineRate: noNodeRefine,
    vialHours: 0,
    dailyBoostHours: 0,
    rigs: store.state.planner.rigs,
    buffs: noNodeBuffs,
    quantumNode: qn,
    qnBasePrice: pricing.base,
    qnPriceGrowth: pricing.growth,
    allowVialToReduceMinimum: false,
  });
  const nodeQnsSaved = noNodeSolution.qns !== null
    ? Math.max(0, noNodeSolution.qns - result.qns)
    : 0;
  const nodeDailyGain = Math.max(0, nodeBoostGrind - sustainableGrind);
  const nodeRefineSaved = Math.max(0, noNodeRefine - refine);
"""
planner = planner[:old_node_calc_start] + new_node_calc + planner[old_node_calc_end:]

planner = planner.replace("""  const activeGainVsMinimum = temporaryBoostHours > 0 ? finalBoostedGainVsMinimum : finalSustainableGainVsMinimum;
  const gainPerAddedQn = extraQns > 0 ? activeGainVsMinimum / extraQns : 0;
""", '', 1)

min_start = planner.find('  const minimumPanel = panel(')
final_start = planner.find('  const finalPanel = panel(', min_start)
if min_start < 0 or final_start < 0:
    raise SystemExit('missing planner minimum/final panel markers')
new_minimum = """  const minimumPanel = panel(
    '4 // MINIMUM BUILD',
    'The smallest permanent build that sustains the target. Temporary boost value is separated below.',
    `${!result.ok ? `<div class=\"warning\">${escapeHtml(result.reason)}</div>` : ''}
    <div class=\"planner-primary-grid\">
      <div class=\"planner-primary-card main\"><small>MINIMUM QUANTUM NODES</small><strong>${result.qns.toLocaleString()} QNs</strong><p>${compact(result.stats.slots)} slots total · ${compact(result.stats.fixedSlots)} fixed-rig slots</p></div>
      <div class=\"planner-primary-card\"><small>SUSTAINABLE / 24H</small><strong>${compact(sustainableGrind)} $GRIND</strong><p>${targetHeadroom > 0 ? `+${compact(targetHeadroom)} headroom (${targetHeadroomPct.toFixed(2)}%)` : 'Meets the target'} · no temporary 2× time</p></div>
      <div class=\"planner-primary-card\"><small>SETUP FROM 0</small><strong>${duration(selectedSetup)}</strong><p>Sequentially funds ${result.qns.toLocaleString()} QNs from 0 GRIT${hasVial ? ' with selected vial' : ''}.</p></div>
    </div>
    <div class=\"result-data-grid\">
      <div class=\"result-data-card\"><small>NORMAL HASHPOWER</small><strong>${compact(result.normal)}/s</strong><span>${compact(result.requiredRate)}/s required for target</span></div>
      <div class=\"result-data-card\"><small>PERMANENT REFINE</small><strong>${compact(refine)} GRIT</strong><span>Required per $GRIND</span></div>
      <div class=\"result-data-card\"><small>USED SLOTS</small><strong>${compact(result.stats.slots)}</strong><span>${result.ok ? 'Fits configured cap' : 'Above configured cap'}</span></div>
      <div class=\"result-data-card\"><small>QN GRIT COST</small><strong>${compact(qnCost)} GRIT</strong><span>Total QN purchase cost from 0</span></div>
    </div>
    ${node.id ? `<div class=\"node-value-panel\">
      <h3>${node.label.toUpperCase()} VALUE</h3>
      <div class=\"result-data-grid\">
        <div class=\"result-data-card\"><small>QNs SAVED VS NO NODE</small><strong class=\"positive\">${nodeQnsSaved ? `−${nodeQnsSaved} QNs` : '0 QNs'}</strong><span>${noNodeSolution.qns !== null ? `No Node minimum: ${noNodeSolution.qns} QNs` : 'No-Node minimum unavailable'}</span></div>
        <div class=\"result-data-card\"><small>HASH BONUS</small><strong>${node.hashPct ? `+${node.hashPct}%` : 'NONE'}</strong><span>Permanent hashpower multiplier</span></div>
        <div class=\"result-data-card\"><small>REFINE SAVED</small><strong class=\"positive\">${nodeRefineSaved > 0 ? `${compact(nodeRefineSaved)} GRIT` : '0 GRIT'}</strong><span>Saved per $GRIND vs same holder tier</span></div>
        <div class=\"result-data-card\"><small>DAILY BOOST VALUE</small><strong class=\"${nodeDailyGain > 0 ? 'positive' : ''}\">${dailyNodeHours ? `+${compact(nodeDailyGain)} $GRIND` : 'NONE'}</strong><span>${dailyNodeHours ? `${dailyNodeHours}h/day at 2× · not used to lower minimum QNs` : 'This Node has no daily boost'}</span></div>
      </div>
    </div>` : ''}
    ${hasVial ? `<div class=\"boost-summary\">
      <div class=\"boost-summary-head\">
        <div><small>WITH SELECTED ${vialHours}H VIAL</small><strong>${compact(selectedBoostGrind)} $GRIND / 24H</strong></div>
        <span>Vial-only gain: +${compact(vialGainGrind)} $GRIND<br>Setup saved: ${duration(setupSaved)} (${setupSavedPct.toFixed(1)}%)</span>
      </div>
    </div>` : ''}
    ${!Number.isFinite(selectedSetup) && result.qns > 0 ? `<div class=\"warning optimized-build-warning\">Setup is unreachable from 0 GRIT with the current fixed rigs. Add a producing fixed rig so QN 1 can be funded.</div>` : ''}`,
  );

"""
planner = planner[:min_start] + new_minimum + planner[final_start:]

final_start = planner.find('  const finalPanel = panel(')
roi_start = planner.find('  const discountRoi = renderRefineDiscountRoi', final_start)
if final_start < 0 or roi_start < 0:
    raise SystemExit('missing planner final panel markers')
new_final = """  const finalPanel = panel(
    '5 // FINAL BUILD',
    'Add QNs above the minimum and see the permanent daily gain. Temporary boost is shown separately.',
    `<div class=\"sim-card final-qn-control\">
      <div class=\"field-title\">QNs ABOVE MINIMUM</div>
      <div class=\"quickadd qn-quick\">
        ${[1, 5, 10].map((count) => `<button type=\"button\" class=\"chip\" data-add-planner-qn=\"${count}\">+${count}</button>`).join('')}
        <button type=\"button\" class=\"chip\" data-add-planner-qn=\"-1\" ${extraQns <= 0 ? 'disabled' : ''}>−1</button>
        <button type=\"button\" class=\"chip\" data-clear-planner-qn ${extraQns <= 0 ? 'disabled' : ''}>CLEAR</button>
      </div>
      <p>${result.qns.toLocaleString()} minimum → <b>${finalQns.toLocaleString()} total QNs</b>${extraQns ? ` · +${extraQns.toLocaleString()} added` : ''}.</p>
    </div>
    ${!finalFits ? `<div class=\"warning\">Final build needs ${compact(finalStats.slots)} slots, above the configured ${compact(cap)}-slot cap.</div>` : ''}
    <div class=\"result-focus-grid\">
      <div class=\"result-focus-card\"><small>MINIMUM BUILD · SUSTAINABLE</small><strong>${compact(sustainableGrind)} $GRIND</strong><p>${result.qns.toLocaleString()} QNs · ${compact(result.normal)}/s</p></div>
      <div class=\"result-focus-card simulated\"><small>FINAL BUILD · SUSTAINABLE</small><strong>${compact(finalSustainableGrind)} $GRIND</strong><p>${finalQns.toLocaleString()} QNs · ${compact(finalNormal)}/s · ${compact(finalStats.slots)} slots</p></div>
    </div>
    <div class=\"result-delta-bar\"><span>Permanent gain from added QNs</span><strong>${signed(finalSustainableGainVsMinimum, ' $GRIND / 24H')}</strong></div>
    <div class=\"result-data-grid\">
      <div class=\"result-data-card\"><small>FINAL QNs</small><strong>${finalQns.toLocaleString()}</strong><span>${extraQns ? `+${extraQns} above minimum` : 'At minimum build'}</span></div>
      <div class=\"result-data-card\"><small>NORMAL HASHPOWER</small><strong>${compact(finalNormal)}/s</strong><span>${finalRateGain > 0 ? `${signed(finalRateGain, '/s')} vs minimum` : 'Minimum rate'}</span></div>
      <div class=\"result-data-card\"><small>EXTRA QN COST</small><strong>${extraQnCost > 0 ? `${compact(extraQnCost)} GRIT` : '—'}</strong><span>Cost of QNs above minimum</span></div>
      <div class=\"result-data-card\"><small>GAIN / ADDED QN</small><strong class=\"${extraQns > 0 ? 'positive' : ''}\">${extraQns > 0 ? `+${compact(sustainableGainPerAddedQn)} $GRIND` : '—'}</strong><span>Sustainable 24H gain per added QN</span></div>
    </div>
    ${temporaryBoostHours > 0 ? `<div class=\"boost-summary\">
      <div class=\"boost-summary-head\">
        <div><small>FINAL BUILD · WITH TEMPORARY BOOST</small><strong>${compact(finalSelectedGrind)} $GRIND / 24H</strong></div>
        <span>+${compact(finalSelectedGrind - finalSustainableGrind)} over sustainable${extraQns ? `<br>${signed(finalBoostedGainVsMinimum, ' $GRIND')} vs boosted minimum` : ''}${hasVial ? `<br>Vial-only gain: +${compact(finalVialGain)} $GRIND` : ''}</span>
      </div>
    </div>` : ''}`,
  );

"""
planner = planner[:final_start] + new_final + planner[roi_start:]
planner_path.write_text(planner)
