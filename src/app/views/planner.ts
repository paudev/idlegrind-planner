import {
  DAY,
  HOUR,
  MARKET_DEFAULTS,
  RACK_BASE_SLOTS,
} from '../config/economy';
import {
  coolantUpgradeCost,
  multiplier,
  productionWithDailyBoost,
  qnTotalCost,
  rackExpansion,
  rigStats,
  solveMinimumBuild,
} from '../core/calculations';
import { clamp, compact, duration, escapeHtml, number, signed } from '../core/format';
import { holderTierRefineDiscountPct } from '../core/refine-discounts';
import {
  permanentRefineRate,
  stakingDailyBoostHours,
  stakingNode,
  withStakingNode,
} from '../core/staking';
import { getQuantumNodePreset, store } from '../core/state';
import type { CostRow, FundingRow, RigStats } from '../types';
import {
  buffsUi,
  costRows,
  field,
  intro,
  metric,
  panel,
  quantumNodeReference,
  rigButtons,
  rigList,
  subTabs,
} from '../ui/components';
import { renderQnReadiness } from '../ui/readiness';
import { renderRefineDiscountRoi } from '../ui/refine-discount-roi';
import { stakingNodeRow } from '../ui/staking';

interface BuildFundingResult {
  time: number;
  timeline: FundingRow[];
  startingRate: number;
}

interface BuildResult {
  computable: boolean;
  ok: boolean;
  reason: string;
  qns: number | null;
  stats: RigStats | null;
  normal: number;
  overclock: number;
  average: number;
  grind: number;
  multiplier: number;
  requiredRate: number;
  rateAtReady: number;
  productionFactorAtReady: 1 | 2;
  funding: BuildFundingResult;
}

function qnPricing(): { base: number; growth: number } {
  return {
    base: Math.max(0, number(store.state.settings.qnBasePrice)),
    growth: Math.max(1, number(store.state.settings.qnPriceGrowth, 1.15)),
  };
}

function plannerRefineRate(): number {
  return permanentRefineRate(
    Math.max(0, number(store.state.settings.refineRate)),
    store.state.planner.buffs,
  );
}

function nodeBoostHours(): number {
  return stakingDailyBoostHours(store.state.planner.buffs.stakingNode);
}

function selectedTemporaryBoostHours(): number {
  return clamp(number(store.state.planner.vialHours) + nodeBoostHours(), 0, 24);
}

function invalidBuild(reason: string, buildMultiplier = 0): BuildResult {
  return {
    computable: false,
    ok: false,
    reason,
    qns: null,
    stats: null,
    normal: 0,
    overclock: 0,
    average: 0,
    grind: 0,
    multiplier: buildMultiplier,
    requiredRate: 0,
    rateAtReady: 0,
    productionFactorAtReady: 1,
    funding: { time: Number.POSITIVE_INFINITY, timeline: [], startingRate: 0 },
  };
}

function solveOfficialMinimum(vialHours: number) {
  const pricing = qnPricing();
  return solveMinimumBuild({
    targetGrindPerDay: Math.max(0, number(store.state.planner.targetGrindPerDay)),
    refineRate: plannerRefineRate(),
    vialHours: clamp(vialHours, 0, 24),
    dailyBoostHours: nodeBoostHours(),
    rigs: store.state.planner.rigs,
    buffs: store.state.planner.buffs,
    quantumNode: getQuantumNodePreset(),
    qnBasePrice: pricing.base,
    qnPriceGrowth: pricing.growth,
    allowVialToReduceMinimum: false,
  });
}

function optimizeBuild(): BuildResult {
  const target = Math.max(0, number(store.state.planner.targetGrindPerDay));
  const refine = plannerRefineRate();

  if (target <= 0) return invalidBuild('Set a $GRIND / 24H target above 0.');
  if (refine < 1000) return invalidBuild('Set a valid refinery rate under Settings.');

  const quantumNode = getQuantumNodePreset();
  const buildMultiplier = multiplier(store.state.planner.buffs);
  const vialHours = clamp(number(store.state.planner.vialHours), 0, 24);
  const dailyBoostHours = nodeBoostHours();
  const solution = solveOfficialMinimum(vialHours);

  if (solution.qns === null) {
    return invalidBuild(
      'This target requires Quantum Nodes, but the configured QN base rate plus fixed-rig +/QN synergy is 0/s. Set a positive QN rate or +/QN synergy under Settings/Rig Setup.',
      buildMultiplier,
    );
  }

  const stats = rigStats(store.state.planner.rigs, solution.qns, quantumNode);
  const normal = stats.base * buildMultiplier;
  const projection = productionWithDailyBoost(
    normal,
    DAY,
    clamp(vialHours + dailyBoostHours, 0, 24) * HOUR,
    dailyBoostHours * HOUR,
  );
  const average = projection.average;
  const grind = projection.grit / refine;
  const cap = Math.max(0, number(store.state.settings.maxRackSlots));
  const fits = !(cap > 0 && stats.slots > cap);

  return {
    computable: true,
    ok: fits,
    reason: fits ? '' : `Needs ${stats.slots} slots, above the configured ${cap}-slot cap.`,
    qns: solution.qns,
    stats,
    normal,
    overclock: normal * 2,
    average,
    grind,
    multiplier: buildMultiplier,
    requiredRate: solution.requiredRate,
    rateAtReady: solution.rateAtReady,
    productionFactorAtReady: solution.productionFactorAtReady,
    funding: {
      time: solution.fundingTime,
      timeline: solution.timeline,
      startingRate: solution.startingRate,
    },
  };
}

function setupPanels(): string {
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
    `<div class="module-grid two planner-target-grid">
      ${field('state.planner.targetGrindPerDay', '$GRIND / 24H TARGET', store.state.planner.targetGrindPerDay)}
      <div class="hero-output compact">
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
    <div class="rig-select-label"><b>SELECT A RIG</b><span>Click to add it to the target build.</span></div>
    <div class="quickadd">${rigButtons('planner')}</div>
    <div class="righead"><span>RIG</span><span>QTY</span><span>BASE /s</span><span>+ / QN</span><span>SLOTS</span><span></span></div>
    ${rigList(store.state.planner.rigs, 'planner')}`,
  )}`;
}

function outputView(result: BuildResult): string {
  if (!result.computable || result.qns === null || !result.stats) {
    return panel('4 // MINIMUM BUILD', 'Minimum QNs, setup time, and earnings for the selected target.', `<div class="warning">${escapeHtml(result.reason)}</div>`);
  }

  const vialHours = clamp(number(store.state.planner.vialHours), 0, 24);
  const hasVial = vialHours > 0;
  const dailyNodeHours = nodeBoostHours();
  const temporaryBoostHours = selectedTemporaryBoostHours();
  const refine = plannerRefineRate();
  const targetGrind = Math.max(0, number(store.state.planner.targetGrindPerDay));
  const targetGrit = targetGrind * refine;
  const pricing = qnPricing();
  const qn = getQuantumNodePreset();
  const node = stakingNode(store.state.planner.buffs.stakingNode);
  const qnCost = qnTotalCost(0, result.qns, pricing.base, pricing.growth);

  const nodeOnlySolution = solveOfficialMinimum(0);
  const nodeOnlySetup = nodeOnlySolution.fundingTime;
  const selectedSetup = result.funding.time;
  const setupSaved = Number.isFinite(nodeOnlySetup) && Number.isFinite(selectedSetup)
    ? Math.max(0, nodeOnlySetup - selectedSetup)
    : 0;
  const setupSavedPct = Number.isFinite(nodeOnlySetup) && nodeOnlySetup > 0 && Number.isFinite(selectedSetup)
    ? setupSaved / nodeOnlySetup * 100
    : 0;

  const sustainableTotalGrit = result.normal * DAY;
  const sustainableGrind = refine >= 1000 ? sustainableTotalGrit / refine : 0;
  const nodeBoostProjection = productionWithDailyBoost(
    result.normal,
    DAY,
    dailyNodeHours * HOUR,
    dailyNodeHours * HOUR,
  );
  const nodeBoostGrind = refine >= 1000 ? nodeBoostProjection.grit / refine : 0;
  const selectedBoostProjection = productionWithDailyBoost(
    result.normal,
    DAY,
    temporaryBoostHours * HOUR,
    dailyNodeHours * HOUR,
  );
  const selectedBoostGrind = refine >= 1000 ? selectedBoostProjection.grit / refine : 0;
  const vialGainGrind = Math.max(0, selectedBoostGrind - nodeBoostGrind);
  const vialGainGrit = Math.max(0, selectedBoostProjection.grit - nodeBoostProjection.grit);
  const targetHeadroom = Math.max(0, sustainableGrind - targetGrind);
  const targetHeadroomPct = targetGrind > 0 ? targetHeadroom / targetGrind * 100 : 0;

  const noNodeBuffs = withStakingNode(store.state.planner.buffs, 0);
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


  const extraQns = Math.max(0, Math.floor(number(store.state.planner.extraQns)));
  const finalQns = result.qns + extraQns;
  const finalStats = rigStats(store.state.planner.rigs, finalQns, qn);
  const finalNormal = finalStats.base * result.multiplier;
  const finalSustainableGrit = finalNormal * DAY;
  const finalSustainableGrind = refine >= 1000 ? finalSustainableGrit / refine : 0;
  const finalNodeBoost = productionWithDailyBoost(
    finalNormal,
    DAY,
    dailyNodeHours * HOUR,
    dailyNodeHours * HOUR,
  );
  const finalNodeBoostGrind = refine >= 1000 ? finalNodeBoost.grit / refine : 0;
  const finalSelectedBoost = productionWithDailyBoost(
    finalNormal,
    DAY,
    temporaryBoostHours * HOUR,
    dailyNodeHours * HOUR,
  );
  const finalSelectedGrind = refine >= 1000 ? finalSelectedBoost.grit / refine : 0;
  const finalVialGain = Math.max(0, finalSelectedGrind - finalNodeBoostGrind);
  const extraQnCost = qnTotalCost(result.qns, extraQns, pricing.base, pricing.growth);
  const finalRateGain = Math.max(0, finalNormal - result.normal);
  const finalSustainableGainVsMinimum = Math.max(0, finalSustainableGrind - sustainableGrind);
  const finalBoostedGainVsMinimum = Math.max(0, finalSelectedGrind - selectedBoostGrind);
  const sustainableGainPerAddedQn = extraQns > 0 ? finalSustainableGainVsMinimum / extraQns : 0;
  const cap = Math.max(0, number(store.state.settings.maxRackSlots));
  const finalFits = !(cap > 0 && finalStats.slots > cap);

  const minimumPanel = panel(
    '4 // MINIMUM BUILD',
    'The smallest permanent build that sustains the target. Temporary boost value is separated below.',
    `${!result.ok ? `<div class="warning">${escapeHtml(result.reason)}</div>` : ''}
    <div class="planner-primary-grid">
      <div class="planner-primary-card main"><small>MINIMUM QUANTUM NODES</small><strong>${result.qns.toLocaleString()} QNs</strong><p>${compact(result.stats.slots)} slots total · ${compact(result.stats.fixedSlots)} fixed-rig slots</p></div>
      <div class="planner-primary-card"><small>SUSTAINABLE / 24H</small><strong>${compact(sustainableGrind)} $GRIND</strong><p>${targetHeadroom > 0 ? `+${compact(targetHeadroom)} headroom (${targetHeadroomPct.toFixed(2)}%)` : 'Meets the target'} · no temporary 2× time</p></div>
      <div class="planner-primary-card"><small>SETUP FROM 0</small><strong>${duration(selectedSetup)}</strong><p>Sequentially funds ${result.qns.toLocaleString()} QNs from 0 GRIT${hasVial ? ' with selected vial' : ''}.</p></div>
    </div>
    <div class="result-data-grid">
      <div class="result-data-card"><small>NORMAL HASHPOWER</small><strong>${compact(result.normal)}/s</strong><span>${compact(result.requiredRate)}/s required for target</span></div>
      <div class="result-data-card"><small>PERMANENT REFINE</small><strong>${compact(refine)} GRIT</strong><span>Required per $GRIND</span></div>
      <div class="result-data-card"><small>USED SLOTS</small><strong>${compact(result.stats.slots)}</strong><span>${result.ok ? 'Fits configured cap' : 'Above configured cap'}</span></div>
      <div class="result-data-card"><small>QN GRIT COST</small><strong>${compact(qnCost)} GRIT</strong><span>Total QN purchase cost from 0</span></div>
    </div>
    ${node.id ? `<div class="node-value-panel">
      <h3>${node.label.toUpperCase()} VALUE</h3>
      <div class="result-data-grid">
        <div class="result-data-card"><small>QNs SAVED VS NO NODE</small><strong class="positive">${nodeQnsSaved ? `−${nodeQnsSaved} QNs` : '0 QNs'}</strong><span>${noNodeSolution.qns !== null ? `No Node minimum: ${noNodeSolution.qns} QNs` : 'No-Node minimum unavailable'}</span></div>
        <div class="result-data-card"><small>HASH BONUS</small><strong>${node.hashPct ? `+${node.hashPct}%` : 'NONE'}</strong><span>Permanent hashpower multiplier</span></div>
        <div class="result-data-card"><small>REFINE SAVED</small><strong class="positive">${nodeRefineSaved > 0 ? `${compact(nodeRefineSaved)} GRIT` : '0 GRIT'}</strong><span>Saved per $GRIND vs same holder tier</span></div>
        <div class="result-data-card"><small>DAILY BOOST VALUE</small><strong class="${nodeDailyGain > 0 ? 'positive' : ''}">${dailyNodeHours ? `+${compact(nodeDailyGain)} $GRIND` : 'NONE'}</strong><span>${dailyNodeHours ? `${dailyNodeHours}h/day at 2× · not used to lower minimum QNs` : 'This Node has no daily boost'}</span></div>
      </div>
    </div>` : ''}
    ${hasVial ? `<div class="boost-summary">
      <div class="boost-summary-head">
        <div><small>WITH SELECTED ${vialHours}H VIAL</small><strong>${compact(selectedBoostGrind)} $GRIND / 24H</strong></div>
        <span>Vial-only gain: +${compact(vialGainGrind)} $GRIND<br>Setup saved: ${duration(setupSaved)} (${setupSavedPct.toFixed(1)}%)</span>
      </div>
    </div>` : ''}
    ${!Number.isFinite(selectedSetup) && result.qns > 0 ? `<div class="warning optimized-build-warning">Setup is unreachable from 0 GRIT with the current fixed rigs. Add a producing fixed rig so QN 1 can be funded.</div>` : ''}`,
  );

  const finalPanel = panel(
    '5 // FINAL BUILD',
    'Add QNs above the minimum and see the permanent daily gain. Temporary boost is shown separately.',
    `<div class="sim-card final-qn-control">
      <div class="field-title">QNs ABOVE MINIMUM</div>
      <div class="quickadd qn-quick">
        ${[1, 5, 10].map((count) => `<button type="button" class="chip" data-add-planner-qn="${count}">+${count}</button>`).join('')}
        <button type="button" class="chip" data-add-planner-qn="-1" ${extraQns <= 0 ? 'disabled' : ''}>−1</button>
        <button type="button" class="chip" data-clear-planner-qn ${extraQns <= 0 ? 'disabled' : ''}>CLEAR</button>
      </div>
      <p>${result.qns.toLocaleString()} minimum → <b>${finalQns.toLocaleString()} total QNs</b>${extraQns ? ` · +${extraQns.toLocaleString()} added` : ''}.</p>
    </div>
    ${!finalFits ? `<div class="warning">Final build needs ${compact(finalStats.slots)} slots, above the configured ${compact(cap)}-slot cap.</div>` : ''}
    <div class="result-focus-grid">
      <div class="result-focus-card"><small>MINIMUM BUILD · SUSTAINABLE</small><strong>${compact(sustainableGrind)} $GRIND</strong><p>${result.qns.toLocaleString()} QNs · ${compact(result.normal)}/s</p></div>
      <div class="result-focus-card simulated"><small>FINAL BUILD · SUSTAINABLE</small><strong>${compact(finalSustainableGrind)} $GRIND</strong><p>${finalQns.toLocaleString()} QNs · ${compact(finalNormal)}/s · ${compact(finalStats.slots)} slots</p></div>
    </div>
    <div class="result-delta-bar"><span>Permanent gain from added QNs</span><strong>${signed(finalSustainableGainVsMinimum, ' $GRIND / 24H')}</strong></div>
    <div class="result-data-grid">
      <div class="result-data-card"><small>FINAL QNs</small><strong>${finalQns.toLocaleString()}</strong><span>${extraQns ? `+${extraQns} above minimum` : 'At minimum build'}</span></div>
      <div class="result-data-card"><small>NORMAL HASHPOWER</small><strong>${compact(finalNormal)}/s</strong><span>${finalRateGain > 0 ? `${signed(finalRateGain, '/s')} vs minimum` : 'Minimum rate'}</span></div>
      <div class="result-data-card"><small>EXTRA QN COST</small><strong>${extraQnCost > 0 ? `${compact(extraQnCost)} GRIT` : '—'}</strong><span>Cost of QNs above minimum</span></div>
      <div class="result-data-card"><small>GAIN / ADDED QN</small><strong class="${extraQns > 0 ? 'positive' : ''}">${extraQns > 0 ? `+${compact(sustainableGainPerAddedQn)} $GRIND` : '—'}</strong><span>Sustainable 24H gain per added QN</span></div>
    </div>
    ${temporaryBoostHours > 0 ? `<div class="boost-summary">
      <div class="boost-summary-head">
        <div><small>FINAL BUILD · WITH TEMPORARY BOOST</small><strong>${compact(finalSelectedGrind)} $GRIND / 24H</strong></div>
        <span>+${compact(finalSelectedGrind - finalSustainableGrind)} over sustainable${extraQns ? `<br>${signed(finalBoostedGainVsMinimum, ' $GRIND')} vs boosted minimum` : ''}${hasVial ? `<br>Vial-only gain: +${compact(finalVialGain)} $GRIND` : ''}</span>
      </div>
    </div>` : ''}`,
  );

  const discountRoi = renderRefineDiscountRoi({
    scope: 'planner',
    panelNumber: 6,
    projectGrit: (seconds) => productionWithDailyBoost(
      finalNormal,
      seconds,
      temporaryBoostHours * HOUR,
      dailyNodeHours * HOUR,
    ).grit,
    projectionNote: `Projection uses the current Final Build (${finalQns.toLocaleString()} QNs), permanent holder-tier + Node refinery baseline, ${vialHours}h selected vial time, and ${dailyNodeHours}h recurring daily Node boost. Daily/Weekly/Pass choices affect only this ROI section.`,
  });

  return `${minimumPanel}${finalPanel}${discountRoi}`;
}

function readinessView(result: BuildResult): string {
  if (!result.computable || result.qns === null || !result.stats) {
    return renderQnReadiness({
      scope: 'planner',
      requestedQns: 0,
      startingGrit: 0,
      startingRate: 0,
      timeline: [],
      fullBuildTime: Number.POSITIVE_INFINITY,
      subtitle: 'Sequential QN readiness for the minimum Build Planner configuration.',
      introText: 'This view uses only Build Planner target, buff, vial and fixed-rig references. It never reads Deck Simulator state.',
      issues: [{ label: 'BUILD TARGET', message: result.reason || 'Set a valid Build Planner target first.' }],
    });
  }

  const funding = result.funding;
  const issues: Array<{ label: string; message: string }> = [];
  const unreachable = funding.timeline.find((row) => row.unreachable);

  if (result.qns > 0 && unreachable) {
    issues.push({
      label: funding.startingRate > 0 ? 'FUNDING PATH' : 'STARTING MINING SOURCE',
      message: funding.startingRate > 0
        ? `QN ${unreachable.to} cannot be funded with the current build references.`
        : 'A from-scratch build starts with 0 GRIT. Add a fixed rig with base production so QN 1 can be mined and purchased.',
    });
  }

  const vialHours = clamp(number(store.state.planner.vialHours), 0, 24);
  const dailyNodeHours = nodeBoostHours();
  const temporaryBoostHours = selectedTemporaryBoostHours();
  const pricing = qnPricing();
  return `${intro(
    'BUILD PLANNER',
    'QN readiness for the stable official minimum. Permanent Node hash/refine can change the minimum; daily Node boost and vial time can speed this timeline but never reduce the required QN count.',
  )}${renderQnReadiness({
    scope: 'planner',
    requestedQns: result.qns,
    startingGrit: 0,
    startingRate: funding.startingRate,
    timeline: funding.timeline,
    fullBuildTime: funding.time,
    subtitle: 'When each official minimum Quantum Node becomes affordable while assembling the build from scratch.',
    introText: 'Starts from 0 QNs and 0 GRIT. Selected fixed rigs are available as the starting mining source; Deck Simulator values are not used.',
    rateLabel: 'STARTING FIXED-RIG RATE',
    issues,
    pricingNote: `QN pricing setting: <b>${compact(pricing.base)} GRIT × ${pricing.growth}^owned</b>. QNs are bought one at a time${temporaryBoostHours ? `; day one has up to ${temporaryBoostHours}h temporary 2× (${dailyNodeHours}h Node${vialHours ? ` + ${vialHours}h vial` : ''}) and the ${dailyNodeHours}h Node boost repeats every 24h` : ''}.`,
  })}`;
}

function marketRigCost(): { total: number; rows: CostRow[] } {
  const rows: CostRow[] = [];
  let total = 0;

  for (const rig of store.state.planner.rigs) {
    const key = rig.presetId ?? '';
    if (!(key in MARKET_DEFAULTS)) continue;

    const quantity = Math.max(0, Math.floor(number(rig.qty)));
    const unit = Math.max(0, number(store.market[key] ?? MARKET_DEFAULTS[key] ?? 0));
    if (!quantity) continue;

    const cost = quantity * unit;
    total += cost;
    rows.push({
      item: rig.name,
      detail: `${compact(quantity)} × ${compact(unit)} $GRIND`,
      grind: cost,
      note: 'Current market price reference · editable under Settings.',
    });
  }

  return { total, rows };
}

function costingView(result: BuildResult): string {
  if (!result.computable || result.qns === null || !result.stats) {
    return panel('4 // COSTING', 'Known investment for the official minimum build.', `<div class="warning">${escapeHtml(result.reason || 'Set a valid target and build setup first.')}</div>`);
  }

  const pricing = qnPricing();
  const cap = Math.max(0, number(store.state.settings.maxRackSlots));
  const rackTarget = cap > 0 ? Math.min(result.stats.slots, cap) : result.stats.slots;
  const qnCost = qnTotalCost(0, result.qns, pricing.base, pricing.growth);
  const rack = rackExpansion(RACK_BASE_SLOTS, rackTarget);
  const coolant = coolantUpgradeCost(0, store.state.planner.buffs.coolantLevel);
  const vial = store.state.planner.vialHours ? Math.max(0, number(store.vials[String(store.state.planner.vialHours)] ?? 0)) : 0;
  const rigs = marketRigCost();
  const frames: Array<[flag: 'bronze' | 'silver' | 'gold', marketKey: string, label: string]> = [
    ['bronze', 'bronze_frame', 'BRONZE FRAME'],
    ['silver', 'silver_frame', 'SILVER FRAME'],
    ['gold', 'gold_frame', 'GOLD FRAME'],
  ];
  let frameTotal = 0;
  const frameRows: CostRow[] = [];
  let hasUnknownFrameCost = false;

  if (store.state.planner.buffs.mixed) {
    hasUnknownFrameCost = true;
    frameRows.push({
      item: 'MIXED FRAME',
      detail: 'Selected build buff',
      note: 'No standalone Mixed Frame market reference is configured, so its acquisition cost is excluded from the total.',
    });
  } else {
    for (const [flag, marketKey, label] of frames) {
      if (!store.state.planner.buffs[flag]) continue;
      const cost = Math.max(0, number(store.market[marketKey] ?? MARKET_DEFAULTS[marketKey] ?? 0));
      frameTotal += cost;
      frameRows.push({
        item: label,
        detail: 'Selected build buff',
        grind: cost,
        note: 'Editable Marketplace Reference under Settings.',
      });
    }
  }

  const total = rack.total + coolant + vial + rigs.total + frameTotal;
  const rows: CostRow[] = [
    { item: 'QUANTUM NODES', detail: `${result.qns} to buy · 0 → ${result.qns}`, grit: qnCost, note: `QN pricing setting: ${compact(pricing.base)} × ${pricing.growth}^owned.` },
    { item: 'RACK SLOT EXPANSION', detail: rack.count ? `${rack.count} × +6 rack slots` : 'No expansion needed', grind: rack.total, note: result.ok ? 'Starts from the 12 base rack slots.' : `Costed only through the configured ${cap}-slot cap; the build itself needs ${result.stats.slots}.` },
    ...(!result.ok ? [{ item: 'DECK SLOT CAP', detail: `${result.stats.slots} needed · ${cap} maximum`, note: 'This build does not fit the configured maximum deck slots.' } as CostRow] : []),
    { item: 'COOLANT', detail: `Level 0 → ${Math.floor(number(store.state.planner.buffs.coolantLevel))}`, grind: coolant, note: 'Each level doubles in price from the 12K Level 1 reference.' },
    ...frameRows,
    { item: 'VIAL', detail: store.state.planner.vialHours ? `${store.state.planner.vialHours}H market reference` : 'No vial', grind: vial, note: 'Strictly uses Settings vial market reference.' },
    ...rigs.rows,
    { item: 'TOTAL KNOWN COST', grind: total, grit: qnCost, note: hasUnknownFrameCost ? 'Separate currencies. Mixed Frame acquisition cost is unknown and excluded. Staking lock is not treated as an acquisition cost.' : 'Separate currencies; unknown prerequisites are not silently estimated. Staking lock is not treated as an acquisition cost.', total: true },
  ];

  return panel(
    '4 // COSTING',
    'Known investment for the stable official minimum build from scratch.',
    `${!result.ok ? `<div class="warning">${escapeHtml(result.reason)}</div>` : ''}
    <div class="cost-badges">
      <div><small>$GRIND</small><strong class="${total ? 'negative' : ''}">${total ? `−${compact(total)}` : '0'}</strong></div>
      <div><small>GRIT</small><strong class="${qnCost ? 'negative' : ''}">${qnCost ? `−${compact(qnCost)}` : '0'}</strong></div>
    </div>${costRows(rows)}`,
  );
}

export function renderPlannerView(): string {
  const result = optimizeBuild();
  const tabs = subTabs('planner', store.state.planner.view, true);
  let content: string;

  if (store.state.planner.view === 'output') content = `${setupPanels()}${outputView(result)}`;
  else if (store.state.planner.view === 'cost') content = costingView(result);
  else content = readinessView(result);

  return `${tabs}<div class="planner-stack">${content}</div>`;
}
