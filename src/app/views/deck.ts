import {
  DAY,
  HOUR,
  RACK_BASE_SLOTS,
  RACK_SLOT_STEP,
} from '../config/economy';
import { VIAL_OPTIONS } from '../config/game';
import {
  cashoutCycle,
  cashoutRemainingSeconds,
  formatLocalTime,
  nextCashoutAt,
} from '../core/cashout';
import {
  fundingHorizon,
  fundingTimeline,
  multiplier,
  production,
  qnPrice,
  qnTotalCost,
  rackExpansion,
  rateFactory,
  rigStats,
} from '../core/calculations';
import { clamp, compact, duration, money, number, signed } from '../core/format';
import {
  permanentRefineRate,
  stakingDailyBoostHours,
  stakingNode,
  withStakingNode,
} from '../core/staking';
import { getQuantumNodePreset, store } from '../core/state';
import type {
  BuffState,
  CashoutCycle,
  CostRow,
  FundingProgress,
  FundingRow,
  ProductionResult,
  RigStats,
} from '../types';
import {
  buffMultiplierSummary,
  buffsUi,
  chip,
  choiceRow,
  costRows,
  field,
  info,
  intro,
  metric,
  panel,
  rigButtons,
  rigList,
  subTabs,
  table,
} from '../ui/components';
import { renderQnReadiness } from '../ui/readiness';
import { renderRefineDiscountRoi } from '../ui/refine-discount-roi';
import {
  dailyNodeBoostToggle,
  simulatedNodeRow,
  stakingNodeRow,
} from '../ui/staking';

interface DeckScenario {
  cycle: CashoutCycle;
  cashoutLeft: number | null;
  currentQns: number;
  addedQns: number;
  targetQns: number;
  rateForQns: (qns: number) => number;
  currentRate: number;
  fullRate: number;
  existingOverclock: number;
  nodeBoostSeconds: number;
  simulatedOverclock: number;
  currentGrit: number;
  currentStats: RigStats;
  fullStats: RigStats;
  slotCap: number;
  currentFitsCap: boolean;
  fullFitsCap: boolean;
  currentProjection: ProductionResult | null;
  progress: FundingProgress | null;
  timeline: FundingRow[];
  fullBuildTime: number;
  currentRefine: number;
  simulatedRefine: number;
  currentBuffs: BuffState;
  simulatedBuffs: BuffState;
}

function qnPricing(): { base: number; growth: number } {
  return {
    base: Math.max(0, number(store.state.settings.qnBasePrice)),
    growth: Math.max(1, number(store.state.settings.qnPriceGrowth, 1.15)),
  };
}

function deckRefineRate(buffs: BuffState): number {
  return permanentRefineRate(
    Math.max(0, number(store.state.settings.refineRate)),
    buffs,
  );
}

function simulatedBuffs(): BuffState {
  const current = stakingNode(store.deck.buffs.stakingNode).id;
  const raw = number(store.deck.simulatedNode, -1);
  const selected = raw >= 0 && raw <= 4 ? Math.floor(raw) : current;
  return withStakingNode(store.deck.buffs, selected);
}

function deckScenario(): DeckScenario {
  const cycle = cashoutCycle();
  const cashoutLeft = cashoutRemainingSeconds(cycle);
  const currentQns = Math.max(0, Math.floor(number(store.deck.qns)));
  const addedQns = Math.max(0, Math.floor(number(store.deck.addedQns)));
  const targetQns = currentQns + addedQns;
  const quantumNode = getQuantumNodePreset();
  const pricing = qnPricing();
  const currentBuffs = store.deck.buffs;
  const simulated = simulatedBuffs();
  const currentRateForQns = rateFactory(store.deck.rigs, currentBuffs, quantumNode);
  const rateForQns = rateFactory(store.deck.rigs, simulated, quantumNode);
  const currentRate = currentRateForQns(currentQns);
  const fullRate = rateForQns(targetQns);
  const existingOverclock = (
    Math.max(0, number(store.deck.currentOverclockHours)) * 60
    + clamp(number(store.deck.currentOverclockMinutes), 0, 59)
  ) * 60;
  const includeDailyNodeBoost = number(store.deck.includeDailyNodeBoost, 1) >= 0.5;
  const nodeBoostSeconds = includeDailyNodeBoost
    ? stakingDailyBoostHours(simulated.stakingNode) * HOUR
    : 0;
  const simulatedOverclock = existingOverclock
    + Math.max(0, number(store.deck.vialHours)) * HOUR
    + nodeBoostSeconds;
  const currentGrit = Math.max(0, number(store.deck.baseline.currentGrit));
  const currentStats = rigStats(store.deck.rigs, currentQns, quantumNode);
  const fullStats = rigStats(store.deck.rigs, targetQns, quantumNode);
  const slotCap = Math.max(0, Math.floor(number(store.state.settings.maxRackSlots)));
  const currentFitsCap = !(slotCap > 0 && currentStats.slots > slotCap);
  const fullFitsCap = !(slotCap > 0 && fullStats.slots > slotCap);
  const inferredRackCapacity = Math.max(
    RACK_BASE_SLOTS,
    RACK_BASE_SLOTS
      + Math.ceil(Math.max(0, currentStats.slots - RACK_BASE_SLOTS) / RACK_SLOT_STEP) * RACK_SLOT_STEP,
  );
  store.deck.baseline.currentDeckSlots = inferredRackCapacity;
  const currentProjection = cashoutLeft !== null
    ? production(currentRate, cashoutLeft, existingOverclock)
    : null;
  const progress = cashoutLeft !== null
    ? fundingHorizon({
      currentQns,
      targetQns,
      currentGrit,
      rateForQns,
      horizon: cashoutLeft,
      overclockSeconds: simulatedOverclock,
      dailyBoostSeconds: nodeBoostSeconds,
      qnBasePrice: pricing.base,
      qnPriceGrowth: pricing.growth,
    })
    : null;
  const timeline = fundingTimeline({
    currentQns,
    targetQns,
    currentGrit,
    rateForQns,
    overclockSeconds: simulatedOverclock,
    dailyBoostSeconds: nodeBoostSeconds,
    qnBasePrice: pricing.base,
    qnPriceGrowth: pricing.growth,
  });
  const finalRow = timeline.at(-1);
  const fullBuildTime = addedQns === 0
    ? 0
    : timeline.length === addedQns && finalRow && !finalRow.unreachable
      ? finalRow.time
      : Number.POSITIVE_INFINITY;

  return {
    cycle,
    cashoutLeft,
    currentQns,
    addedQns,
    targetQns,
    rateForQns,
    currentRate,
    fullRate,
    existingOverclock,
    nodeBoostSeconds,
    simulatedOverclock,
    currentGrit,
    currentStats,
    fullStats,
    slotCap,
    currentFitsCap,
    fullFitsCap,
    currentProjection,
    progress,
    timeline,
    fullBuildTime,
    currentRefine: deckRefineRate(currentBuffs),
    simulatedRefine: deckRefineRate(simulated),
    currentBuffs,
    simulatedBuffs: simulated,
  };
}

function setupPanels(scenario: DeckScenario): string {
  const qn = getQuantumNodePreset();
  const pricing = qnPricing();
  const vialButtons = VIAL_OPTIONS.map((hours) => chip(
    hours ? `⚡ ${hours}H` : 'NO VIAL',
    number(store.deck.vialHours) === hours,
    `data-deck-vial="${hours}"`,
    hours ? 'orange' : '',
  )).join('');
  const hasSelectedVial = Math.max(0, number(store.deck.vialHours)) > 0;
  const vialCostControl = hasSelectedVial
    ? chip('INCLUDE VIAL ACQUISITION', Boolean(store.deck.baseline.includeVialCost), 'data-toggle-vial-cost')
    : '<button type="button" class="chip" disabled aria-disabled="true" title="Select a vial first">INCLUDE VIAL ACQUISITION</button>';

  return `${panel(
    '1 // CURRENT DECK',
    'Enter the deck you have now.',
    `<div class="current-grid">
      ${field('deck.qns', 'CURRENT QUANTUM NODES', store.deck.qns)}
      ${field('deck.baseline.currentGrit', 'CURRENT GRIT BALANCE', store.deck.baseline.currentGrit)}
      <div class="auto-capacity-card">
        <small>CURRENT RACK CAPACITY</small>
        <strong>${compact(store.deck.baseline.currentDeckSlots)}</strong>
        <span>Auto from current QNs + rig slots · 12 base, then +6 slots.</span>
      </div>
    </div>
    ${!scenario.currentFitsCap ? `<div class="warning">Current deck uses ${compact(scenario.currentStats.slots)} slots, above the configured ${compact(scenario.slotCap)}-slot maximum.</div>` : ''}
    <div class="optimizer-rig">
      <div class="optimizer-copy">
        <span class="rigdot green"></span>
        <div>
          <small>PRIMARY RIG</small>
          <strong>${qn.name}</strong>
          <p>Each QN receives all +/QN synergy from fixed rigs.</p>
        </div>
      </div>
      <div class="optimizer-spec"><small>BASE /s</small><b>${compact(qn.rate)}</b></div>
      <div class="optimizer-spec"><small>SLOTS</small><b>${compact(qn.slots)}</b></div>
    </div>
    <div class="rig-select-label"><b>SELECT A RIG</b><span>Click to add it to the current deck.</span></div>
    <div class="quickadd">${rigButtons('deck')}</div>
    <div class="righead"><span>RIG</span><span>QTY</span><span>BASE /s</span><span>+ / QN</span><span>SLOTS</span><span></span></div>
    ${rigList(store.deck.rigs, 'deck')}`,
  )}${panel(
    '2 // CURRENT BUFFS',
    'Set the permanent buffs that are active on the current deck.',
    `${buffsUi(store.deck.buffs, 'deck')}
    ${stakingNodeRow(store.deck.buffs, 'deck')}`,
  )}${panel(
    '3 // SIMULATE CHANGES',
    'Add QNs, change the staking Node, and add temporary boost time without changing the current deck.',
    `<div class="sim-grid">
      <div class="sim-card">
        ${field('deck.addedQns', 'QUANTUM NODES TO ADD', store.deck.addedQns)}
        <div class="quickadd qn-quick">
          ${[1, 5, 10, 20, 50].map((count) => `<button type="button" class="chip" data-add-qn="${count}">+${count}</button>`).join('')}
          <button type="button" class="chip" data-clear-qn>CLEAR</button>
        </div>
        <p>Projected total QN cost: <b>${money(qnTotalCost(scenario.currentQns, scenario.addedQns, pricing.base, pricing.growth), 'GRIT')}</b></p>
      </div>
      <div class="sim-card">
        <div class="field-title">CURRENT OVERCLOCK LEFT</div>
        <div class="time-inputs">
          <label class="mini-input">HOURS <input data-path="deck.currentOverclockHours" data-num value="${number(store.deck.currentOverclockHours)}"></label>
          <label class="mini-input">MINUTES <input data-path="deck.currentOverclockMinutes" data-num value="${number(store.deck.currentOverclockMinutes)}"></label>
        </div>
        <p>Factual boost time already active now. It is kept separate from the forward-looking daily Node boost.</p>
      </div>
    </div>
    ${!scenario.fullFitsCap ? `<div class="warning">Simulated build uses ${compact(scenario.fullStats.slots)} slots, above the configured ${compact(scenario.slotCap)}-slot maximum. Output is shown for comparison, but the build does not fit.</div>` : ''}
    ${simulatedNodeRow(store.deck.buffs, store.deck.simulatedNode)}
    ${dailyNodeBoostToggle(scenario.simulatedBuffs.stakingNode, store.deck.includeDailyNodeBoost)}
    ${choiceRow('ADD VIAL', vialButtons, 'Extra one-time 2× time. Daily Node boost remains a separate recurring perk.')}
    ${buffMultiplierSummary(scenario.simulatedBuffs, store.deck.vialHours, 'SIMULATED MULTIPLIER')}
    ${choiceRow('COSTING', vialCostControl, hasSelectedVial ? `Optional vial purchase cost · ${store.deck.vialHours}H market reference.` : 'Select a vial to enable acquisition costing.')}`,
  )}`;
}

function outputView(scenario: DeckScenario): string {
  const configured = scenario.cashoutLeft !== null && scenario.currentProjection !== null && scenario.progress !== null;
  const hasProjectionWindow = configured && (scenario.cashoutLeft ?? 0) > 0;
  const currentGrind = configured && scenario.currentRefine >= 1000
    ? scenario.currentProjection!.grit / scenario.currentRefine
    : null;
  const simulatedGrind = configured && scenario.simulatedRefine >= 1000
    ? scenario.progress!.mined / scenario.simulatedRefine
    : null;

  const sustainableCurrentProjection = scenario.currentRefine >= 1000
    ? production(scenario.currentRate, DAY, 0)
    : null;
  const sustainableSimulatedProjection = scenario.simulatedRefine >= 1000
    ? production(scenario.fullRate, DAY, 0)
    : null;
  const currentDayProjection = scenario.currentRefine >= 1000
    ? production(scenario.currentRate, DAY, scenario.existingOverclock)
    : null;
  const simulatedDayProjection = scenario.simulatedRefine >= 1000
    ? production(scenario.fullRate, DAY, scenario.simulatedOverclock)
    : null;
  const simulatedDayWithoutAddedVial = scenario.simulatedRefine >= 1000
    ? production(scenario.fullRate, DAY, scenario.existingOverclock + scenario.nodeBoostSeconds)
    : null;

  const sustainableCurrentGrind = sustainableCurrentProjection
    ? sustainableCurrentProjection.grit / scenario.currentRefine
    : null;
  const sustainableSimulatedGrind = sustainableSimulatedProjection
    ? sustainableSimulatedProjection.grit / scenario.simulatedRefine
    : null;
  const currentDayGrind = currentDayProjection
    ? currentDayProjection.grit / scenario.currentRefine
    : null;
  const simulatedDayGrind = simulatedDayProjection
    ? simulatedDayProjection.grit / scenario.simulatedRefine
    : null;
  const simulatedDayWithoutAddedVialGrind = simulatedDayWithoutAddedVial
    ? simulatedDayWithoutAddedVial.grit / scenario.simulatedRefine
    : null;
  const vialHours = Math.max(0, number(store.deck.vialHours));
  const hasVial = vialHours > 0;
  const includeVialCost = hasVial && Boolean(store.deck.baseline.includeVialCost);
  const vialPrice = hasVial ? Math.max(0, number(store.vials[String(vialHours)] ?? 0)) : 0;
  const vialCharge = includeVialCost ? vialPrice : 0;
  const vialAddedGrind = hasVial && simulatedDayGrind !== null && simulatedDayWithoutAddedVialGrind !== null
    ? Math.max(0, simulatedDayGrind - simulatedDayWithoutAddedVialGrind)
    : null;
  const netVialImpact = vialAddedGrind !== null
    ? vialAddedGrind - vialCharge
    : null;
  const next = nextCashoutAt(scenario.cycle);
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
  const refineDelta = scenario.simulatedRefine - scenario.currentRefine;
  const permanentChangeCards = [
    currentNode.id !== simulatedNode.id
      ? `<div class="result-data-card"><small>STAKING NODE</small><strong>${currentNode.label} → ${simulatedNode.label}</strong><span>Permanent Node effects only.</span></div>`
      : '',
    scenario.addedQns !== 0
      ? `<div class="result-data-card"><small>QUANTUM NODES</small><strong>${scenario.currentQns} → ${scenario.targetQns}</strong><span>+${scenario.addedQns} QNs</span></div>`
      : '',
    Math.abs(scenario.fullRate - scenario.currentRate) > 1e-6
      ? `<div class="result-data-card"><small>NORMAL HASHPOWER</small><strong>${compact(scenario.currentRate)}/s → ${compact(scenario.fullRate)}/s</strong><span>${signed(scenario.fullRate - scenario.currentRate, '/s')}</span></div>`
      : '',
    Math.abs(refineDelta) > 1e-6
      ? `<div class="result-data-card"><small>GRIT / $GRIND</small><strong>${compact(scenario.currentRefine)} → ${compact(scenario.simulatedRefine)}</strong><span>${refineDelta < 0 ? `${compact(Math.abs(refineDelta))} GRIT less per $GRIND` : `${compact(refineDelta)} GRIT more per $GRIND`} · lower is better</span></div>`
      : '',
    scenario.fullStats.slots !== scenario.currentStats.slots
      ? `<div class="result-data-card"><small>DECK SLOTS</small><strong>${compact(scenario.currentStats.slots)} → ${compact(scenario.fullStats.slots)}</strong><span>${scenario.fullFitsCap ? 'Fits configured cap' : 'Above configured cap'}</span></div>`
      : '',
  ].filter(Boolean).join('');


  const vialEconomics = hasVial ? `<div class="node-value-panel">
    <h3>VIAL VALUE · ${vialHours}H</h3>
    <div class="result-data-grid">
      <div class="result-data-card"><small>VIAL-ONLY GAIN / 24H</small><strong class="positive">${vialAddedGrind !== null ? `+${compact(vialAddedGrind)} $GRIND` : '—'}</strong><span>Extra output from the vial only.</span></div>
      <div class="result-data-card"><small>ACQUISITION COST</small><strong>${includeVialCost ? `−${compact(vialCharge)} $GRIND` : 'NOT DEDUCTED'}</strong><span>${includeVialCost ? 'One-time market cost is included.' : `${compact(vialPrice)} $GRIND market reference.`}</span></div>
      <div class="result-data-card"><small>NET VIAL VALUE</small><strong class="${netVialImpact !== null && netVialImpact >= 0 ? 'positive' : ''}">${netVialImpact !== null ? signed(netVialImpact, ' $GRIND') : '—'}</strong><span>${includeVialCost ? 'Vial-only gain minus purchase cost.' : 'Gross vial gain because cost is excluded.'}</span></div>
    </div>
  </div>` : '';

  const outputPanel = panel(
    '4 // OUTPUT',
    'Permanent 24H output is the main comparison. Temporary boosts and cashout timing are shown separately.',
    `${!scenario.fullFitsCap ? `<div class="warning">Simulated build requires ${compact(scenario.fullStats.slots)} slots but the configured maximum is ${compact(scenario.slotCap)}.</div>` : ''}
    <div class="result-focus-grid">
      <div class="result-focus-card">
        <small>CURRENT · SUSTAINABLE / 24H</small>
        <strong>${sustainableCurrentGrind !== null ? `${compact(sustainableCurrentGrind)} $GRIND` : '—'}</strong>
        <p>${scenario.currentQns} QNs · ${compact(scenario.currentRate)}/s · ${compact(scenario.currentRefine)} GRIT/$GRIND</p>
      </div>
      <div class="result-focus-card simulated">
        <small>SIMULATED · SUSTAINABLE / 24H</small>
        <strong>${sustainableSimulatedGrind !== null ? `${compact(sustainableSimulatedGrind)} $GRIND` : '—'}</strong>
        <p>${scenario.targetQns} QNs · ${compact(scenario.fullRate)}/s · ${compact(scenario.simulatedRefine)} GRIT/$GRIND</p>
      </div>
    </div>
    <div class="result-delta-bar">
      <span>Permanent change · ${nodeChangeText}</span>
      <strong>${permanentDayDelta !== null ? signed(permanentDayDelta, ' $GRIND / 24H') : '—'}</strong>
    </div>
    ${scenario.simulatedOverclock > 0 ? `<div class="boost-summary">
      <div class="boost-summary-head">
        <div><small>SIMULATED · WITH TEMPORARY BOOST</small><strong>${simulatedDayGrind !== null ? `${compact(simulatedDayGrind)} $GRIND / 24H` : '—'}</strong></div>
        <span>${temporaryBoostGain !== null ? `+${compact(temporaryBoostGain)} $GRIND over sustainable` : ''}${boostSources ? `<br>${boostSources}` : ''}</span>
      </div>
    </div>` : ''}
    ${permanentChangeCards ? `<div class="result-section-label">PERMANENT CHANGES</div>
    <div class="result-data-grid">${permanentChangeCards}</div>` : `<div class="info-line">No permanent deck changes selected. Temporary boost effects are shown separately.</div>`}
    ${configured ? `<div class="result-section-label">NEXT CASHOUT</div>
    <div class="result-data-grid">
      <div class="result-data-card"><small>CURRENT BY CASHOUT</small><strong>${currentGrind !== null ? `${compact(currentGrind)} $GRIND` : '—'}</strong><span>Current deck + active overclock.</span></div>
      <div class="result-data-card"><small>SIMULATED BY CASHOUT</small><strong class="positive">${simulatedGrind !== null ? `${compact(simulatedGrind)} $GRIND` : '—'}</strong><span>${currentGrind !== null && simulatedGrind !== null ? signed(simulatedGrind - currentGrind, ' $GRIND') : '—'} vs current</span></div>
      <div class="result-data-card"><small>QNs ACTIVE BY CASHOUT</small><strong>${scenario.progress!.qns} / ${scenario.targetQns}</strong><span>Sequential QN funding.</span></div>
      <div class="result-data-card"><small>FULL BUILD READY</small><strong>${duration(scenario.fullBuildTime)}</strong><span>${next !== null ? `Cashout eligible ${formatLocalTime(next, false)}` : ''}</span></div>
    </div>` : `${info('Set a cashout time to see funding-aware output and how many simulated QNs become active before cashout.')}`}
    ${vialEconomics}`,
    sustainableSimulatedGrind !== null ? `${compact(sustainableSimulatedGrind, 2)} $GRIND / 24H` : 'SET REFINE RATE',
  );

  const pricing = qnPricing();
  const discountRoi = renderRefineDiscountRoi({
    scope: 'deck',
    panelNumber: 5,
    projectGrit: (seconds) => fundingHorizon({
      currentQns: scenario.currentQns,
      targetQns: scenario.targetQns,
      currentGrit: scenario.currentGrit,
      rateForQns: scenario.rateForQns,
      horizon: seconds,
      overclockSeconds: scenario.simulatedOverclock,
      dailyBoostSeconds: scenario.nodeBoostSeconds,
      qnBasePrice: pricing.base,
      qnPriceGrowth: pricing.growth,
    }).balance,
    projectionNote: `Funding-aware projection starts with ${compact(scenario.currentGrit)} GRIT, buys the simulated ${scenario.addedQns} QNs sequentially, applies the selected initial temporary boost window, and repeats the daily Node boost every 24 hours. Holder-tier and Node refinery discounts are already in the ROI baseline; Daily/Weekly/Pass choices affect only this ROI section.`,
  });

  return `${intro(
    'DECK SIMULATOR',
    'Start with your current deck, optionally change the staking Node, add Quantum Nodes and/or vial time, then compare sustainable, boosted, and funding-aware output.',
  )}${setupPanels(scenario)}${outputPanel}${discountRoi}`;
}

function costingView(scenario: DeckScenario): string {
  const pricing = qnPricing();
  const qnCost = qnTotalCost(scenario.currentQns, scenario.addedQns, pricing.base, pricing.growth);
  const capacity = Math.max(RACK_BASE_SLOTS, number(store.deck.baseline.currentDeckSlots, RACK_BASE_SLOTS));
  const hasVial = Math.max(0, number(store.deck.vialHours)) > 0;
  const vialPrice = hasVial ? Math.max(0, number(store.vials[String(store.deck.vialHours)] ?? 0)) : 0;
  const vialCharge = hasVial && store.deck.baseline.includeVialCost ? vialPrice : 0;
  const rackTarget = scenario.slotCap > 0 ? Math.min(scenario.fullStats.slots, scenario.slotCap) : scenario.fullStats.slots;
  const rack = rackExpansion(capacity, rackTarget);
  const totalGrind = rack.total + vialCharge;
  const funding = scenario.progress;

  const summary = `<div class="cost-badges">
    <div><small>$GRIND</small><strong class="${totalGrind ? 'negative' : ''}">${totalGrind ? `−${compact(totalGrind)}` : '0'}</strong></div>
    <div><small>GRIT</small><strong class="${qnCost ? 'negative' : ''}">${qnCost ? `−${compact(qnCost)}` : '0'}</strong></div>
  </div>`;

  const rows: CostRow[] = [
    { item: 'QUANTUM NODES', detail: `+${scenario.addedQns} · ${scenario.currentQns} → ${scenario.targetQns}`, grit: qnCost, note: `QN pricing setting: ${compact(pricing.base)} × ${pricing.growth}^owned.` },
    { item: 'RACK SLOT EXPANSION', detail: rack.count ? `${rack.count} × +6 rack slots` : 'No expansion needed', grind: rack.total, note: scenario.fullFitsCap ? (rack.count ? `Starts from inferred ${capacity}-slot capacity; target uses ${scenario.fullStats.slots} slots.` : `Inferred ${capacity}-slot capacity fits the simulation.`) : `Costed only through the configured ${scenario.slotCap}-slot maximum; target uses ${scenario.fullStats.slots}.` },
    ...(!scenario.fullFitsCap ? [{ item: 'DECK SLOT CAP', detail: `${scenario.fullStats.slots} needed · ${scenario.slotCap} maximum`, note: 'The simulated build does not fit the configured maximum deck slots.' } as CostRow] : []),
    { item: 'VIAL ACQUISITION', detail: hasVial ? `${store.deck.vialHours}H market reference` : 'No vial', grind: vialCharge, note: hasVial ? (store.deck.baseline.includeVialCost ? 'Included using Settings market reference.' : 'Reference selected but not charged.') : 'No vial selected.' },
    { item: 'TOTAL KNOWN COST', grind: totalGrind, grit: qnCost, note: scenario.fullFitsCap ? 'Currencies remain separate. Staking lock is not treated as an acquisition cost.' : 'Currencies remain separate. Rack cost stops at the configured slot cap. Staking lock is not treated as an acquisition cost.', total: true },
  ];

  const fundingRows = [
    ['CURRENT GRIT', `${compact(scenario.currentGrit)} GRIT`, 'Starting balance'],
    ['TOTAL QN COST', qnCost ? `−${compact(qnCost)} GRIT` : '0 GRIT', 'Cost of every simulated QN'],
    ['QN COST PAID BY NEXT CASHOUT', funding ? (funding.spent ? `−${compact(funding.spent)} GRIT` : '0 GRIT') : '—', 'Only purchases funded before eligibility'],
    ['GRIT MINED BY NEXT CASHOUT', funding ? (funding.mined ? `+${compact(funding.mined)} GRIT` : '0 GRIT') : '—', 'Mining while QNs are progressively added'],
    ['PROJECTED GRIT AT NEXT CASHOUT', funding ? `${compact(funding.balance)} GRIT` : '—', 'No automatic withdrawal assumed'],
  ].map(([label, value, meaning]) => `<tr><th>${label}</th><td class="${String(value).startsWith('+') ? 'positive' : String(value).startsWith('−') ? 'negative' : ''}">${value}</td><td>${meaning}</td></tr>`);

  return panel(
    '4 // COSTING',
    'Known investment and funding impact for this exact simulation.',
    `${!scenario.fullFitsCap ? `<div class="warning">Simulated build requires ${compact(scenario.fullStats.slots)} slots, above the configured ${compact(scenario.slotCap)}-slot maximum.</div>` : ''}
    ${summary}
    ${scenario.addedQns ? info('QN purchases may exceed your current GRIT. That does not block the simulation; purchases are funded continuously as soon as they become affordable.') : ''}
    <div class="funding-grid">
      ${metric('QNs REQUESTED', scenario.addedQns)}
      ${metric('BUYABLE NOW', funding ? `${funding.buyableNow} / ${scenario.addedQns}` : '—', 'green')}
      ${metric('BOUGHT BY NEXT CASHOUT', funding ? `${funding.bought} / ${scenario.addedQns}` : '—')}
      ${metric('SIMULATED BUILD READY', duration(scenario.fullBuildTime), '', 'Continuous funding')}
    </div>
    ${costRows(rows)}
    <h3 class="section-label">FUNDING TIMELINE</h3>
    ${table(['METRIC', 'VALUE', 'MEANING'], fundingRows, 'funding-table')}`,
  );
}

function readinessView(scenario: DeckScenario): string {
  const pricing = qnPricing();
  const issues: Array<{ label: string; message: string }> = [];

  if (scenario.addedQns <= 0) {
    issues.push({ label: 'QUANTUM NODES TO ADD', message: 'Set at least 1 under 3 // SIMULATE CHANGES.' });
  }

  if (scenario.addedQns > 0 && scenario.currentRate <= 0 && scenario.currentGrit < qnPrice(scenario.currentQns, pricing.base, pricing.growth)) {
    issues.push({ label: 'MINING SOURCE', message: 'Add a producing rig/current QN, or enough GRIT to buy the first simulated QN.' });
  }

  const unreachable = scenario.timeline.find((row) => row.unreachable);
  if (unreachable && !issues.some((issue) => issue.label === 'MINING SOURCE')) {
    issues.push({ label: 'FUNDING PATH', message: `QN ${unreachable.to} cannot be reached with the current setup.` });
  }

  const readiness = renderQnReadiness({
    scope: 'deck',
    requestedQns: scenario.addedQns,
    startingGrit: scenario.currentGrit,
    startingRate: scenario.currentRate,
    timeline: scenario.timeline,
    fullBuildTime: scenario.fullBuildTime,
    subtitle: 'When each simulated Quantum Node becomes affordable under continuous sequential purchasing.',
    introText: 'This view uses the Deck Simulator setup from OUTPUT.',
    rateLabel: 'CURRENT NORMAL RATE',
    issues,
    pricingNote: `QN pricing setting: <b>${compact(pricing.base)} GRIT × ${pricing.growth}^owned</b>. Current overclock, selected vial, and the first daily Node boost form the initial 2× window${scenario.nodeBoostSeconds ? '; the Node boost then repeats every 24h' : ''}.`,
  });

  return `${!scenario.fullFitsCap ? panel(
    'DECK SLOT CAP',
    'The funding timeline is still shown, but this simulated build does not fit the configured deck maximum.',
    `<div class="warning">${compact(scenario.fullStats.slots)} slots required · ${compact(scenario.slotCap)} slots maximum.</div>`,
  ) : ''}${readiness}`;
}

export function renderDeckView(): string {
  const scenario = deckScenario();
  const tabs = subTabs('deck', store.deck.view, true);
  let content: string;

  if (store.deck.view === 'output') content = outputView(scenario);
  else if (store.deck.view === 'cost') content = costingView(scenario);
  else content = readinessView(scenario);

  return `${tabs}<div class="planner-stack">${content}</div>`;
}
