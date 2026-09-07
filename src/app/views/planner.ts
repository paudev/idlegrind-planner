import {
  DAY,
  MARKET_DEFAULTS,
  RACK_BASE_SLOTS,
} from '../config/economy';
import {
  coolantUpgradeCost,
  multiplier,
  qnTotalCost,
  rackExpansion,
  rigStats,
  solveMinimumBuild,
} from '../core/calculations';
import { clamp, compact, duration, escapeHtml, number, signed } from '../core/format';
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
    refineRate: Math.max(0, number(store.state.settings.refineRate)),
    vialHours,
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
  const refine = Math.max(0, number(store.state.settings.refineRate));

  if (target <= 0) return invalidBuild('Set a $GRIND / 24H target above 0.');
  if (refine < 1000) return invalidBuild('Set a valid refinery rate under Settings.');

  const quantumNode = getQuantumNodePreset();
  const buildMultiplier = multiplier(store.state.planner.buffs);
  const vialHours = clamp(number(store.state.planner.vialHours), 0, 24);
  const solution = solveOfficialMinimum(vialHours);

  if (solution.qns === null) {
    return invalidBuild(
      'This target requires Quantum Nodes, but the configured QN base rate plus fixed-rig +/QN synergy is 0/s. Set a positive QN rate or +/QN synergy under Settings/Rig Setup.',
      buildMultiplier,
    );
  }

  const stats = rigStats(store.state.planner.rigs, solution.qns, quantumNode);
  const normal = stats.base * buildMultiplier;
  const dayFactor = 1 + vialHours / 24;
  const average = normal * dayFactor;
  const grind = average * DAY / refine;
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
  const buildMultiplier = multiplier(store.state.planner.buffs);

  return `${intro(
    'BUILD PLANNER',
    'Build from 0 QNs and 0 GRIT. Minimum QNs are fixed by the normal 1× production needed for the target; vial selection only changes setup speed and earnings.',
  )}${panel(
    '1 // DAILY TARGET',
    'Set the $GRIND / 24H target the minimum build must sustain at normal production.',
    `<div class="module-grid two planner-target-grid">
      ${field('state.planner.targetGrindPerDay', '$GRIND / 24H TARGET', store.state.planner.targetGrindPerDay)}
      <div class="hero-output compact">
        <small>BUILD MULTIPLIER</small>
        <strong>×${buildMultiplier.toFixed(3)}</strong>
        <p>Changing vial duration never changes the official minimum QN count.</p>
      </div>
    </div>`,
  )}${panel(
    '2 // BUFFS',
    'Reference buffs the planned build will use.',
    buffsUi(store.state.planner.buffs, 'planner', {
      withVial: true,
      vialHours: store.state.planner.vialHours,
    }),
    `×${buildMultiplier.toFixed(2)}`,
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
  const refine = Math.max(0, number(store.state.settings.refineRate));
  const targetGrind = Math.max(0, number(store.state.planner.targetGrindPerDay));
  const targetGrit = targetGrind * refine;
  const pricing = qnPricing();
  const qn = getQuantumNodePreset();
  const qnCost = qnTotalCost(0, result.qns, pricing.base, pricing.growth);

  const noVialSolution = solveOfficialMinimum(0);
  const noVialSetup = noVialSolution.fundingTime;
  const selectedSetup = result.funding.time;
  const setupSaved = Number.isFinite(noVialSetup) && Number.isFinite(selectedSetup)
    ? Math.max(0, noVialSetup - selectedSetup)
    : 0;
  const setupSavedPct = Number.isFinite(noVialSetup) && noVialSetup > 0 && Number.isFinite(selectedSetup)
    ? setupSaved / noVialSetup * 100
    : 0;

  const noVialTotalGrit = result.normal * DAY;
  const noVialGrind = refine >= 1000 ? noVialTotalGrit / refine : 0;
  const selectedVialTotalGrit = result.average * DAY;
  const selectedVialGrind = result.grind;
  const vialGainGrind = Math.max(0, selectedVialGrind - noVialGrind);
  const vialGainGrit = Math.max(0, selectedVialTotalGrit - noVialTotalGrit);
  const targetHeadroom = Math.max(0, noVialGrind - targetGrind);
  const targetHeadroomPct = targetGrind > 0 ? targetHeadroom / targetGrind * 100 : 0;

  const extraQns = Math.max(0, Math.floor(number(store.state.planner.extraQns)));
  const finalQns = result.qns + extraQns;
  const finalStats = rigStats(store.state.planner.rigs, finalQns, qn);
  const finalNormal = finalStats.base * result.multiplier;
  const finalNoVialGrit = finalNormal * DAY;
  const finalNoVialGrind = refine >= 1000 ? finalNoVialGrit / refine : 0;
  const finalDayFactor = 1 + vialHours / 24;
  const finalVialGrit = finalNormal * finalDayFactor * DAY;
  const finalVialGrind = refine >= 1000 ? finalVialGrit / refine : 0;
  const finalVialGain = Math.max(0, finalVialGrind - finalNoVialGrind);
  const extraQnCost = qnTotalCost(result.qns, extraQns, pricing.base, pricing.growth);
  const finalRateGain = Math.max(0, finalNormal - result.normal);
  const finalNoVialGainVsMinimum = Math.max(0, finalNoVialGrind - noVialGrind);
  const finalVialGainVsMinimum = Math.max(0, finalVialGrind - selectedVialGrind);
  const activeGainVsMinimum = hasVial ? finalVialGainVsMinimum : finalNoVialGainVsMinimum;
  const gainPerAddedQn = extraQns > 0 ? activeGainVsMinimum / extraQns : 0;
  const noVialGainPerAddedQn = extraQns > 0 ? finalNoVialGainVsMinimum / extraQns : 0;
  const cap = Math.max(0, number(store.state.settings.maxRackSlots));
  const finalFits = !(cap > 0 && finalStats.slots > cap);

  return `${panel(
    '4 // MINIMUM BUILD',
    'Stable minimum hardware, target coverage, and the setup/earnings impact of the selected vial.',
    `${!result.ok ? `<div class="warning">${escapeHtml(result.reason)}</div>` : ''}
    <div class="result-hero-pair optimized-build-heroes">
      <div class="result-hero current">
        <small>MINIMUM QNs</small>
        <strong>${result.qns.toLocaleString()}</strong>
        <p>${compact(result.stats.slots)} total slots · ${compact(result.stats.fixedSlots)} fixed-rig slots</p>
      </div>
      <div class="result-hero ready">
        <small>DAILY TARGET</small>
        <strong>${compact(targetGrind)}<em> $GRIND</em></strong>
        <p>${compact(targetGrit)} GRIT / 24H · ${compact(result.requiredRate)}/s required normal rate</p>
      </div>
    </div>
    <div class="metric-grid optimized-build-metrics">
      ${metric('MINIMUM NORMAL RATE', `${compact(result.normal)}/s`, result.normal + 1e-6 >= result.requiredRate ? 'green' : 'negative')}
      ${metric('TARGET HEADROOM', targetHeadroom > 0 ? `+${compact(targetHeadroom)} $GRIND` : 'ON TARGET', targetHeadroom > 0 ? 'green' : '', targetHeadroom > 0 ? `${targetHeadroomPct.toFixed(2)}% above target because QNs are whole units.` : 'Minimum output matches the target.')}
      ${metric('QN GRIT COST', qnCost > 0 ? `−${compact(qnCost)} GRIT` : '—', qnCost > 0 ? 'negative' : '')}
      ${metric('USED SLOTS', compact(result.stats.slots))}
    </div>
    ${!Number.isFinite(selectedSetup) && result.qns > 0 ? `<div class="warning optimized-build-warning">Setup is unreachable from 0 GRIT with the current fixed rigs. Add a producing fixed rig so QN 1 can be funded.</div>` : ''}
    <div class="result-hero-pair final-output-heroes">
      <div class="result-hero current">
        <small>NO VIAL</small>
        <strong>${duration(noVialSetup)}</strong>
        <p>setup time · ${compact(noVialGrind)} $GRIND / 24H</p>
      </div>
      <div class="result-hero simulated">
        <small>${hasVial ? `${vialHours}H VIAL` : 'VIAL PERFORMANCE'}</small>
        <strong>${hasVial ? duration(selectedSetup) : 'NOT SELECTED'}</strong>
        <p>${hasVial
          ? `setup time · ${compact(selectedVialGrind)} $GRIND / 24H`
          : 'Select a vial under Buffs to compare setup speed and earnings on the same minimum build.'}</p>
      </div>
    </div>
    <div class="metric-grid final-performance-metrics">
      ${metric('NO-VIAL 24H OUTPUT', `${compact(noVialTotalGrit)} GRIT`)}
      ${metric('SELECTED-VIAL 24H OUTPUT', hasVial ? `${compact(selectedVialTotalGrit)} GRIT` : '—', hasVial ? 'green' : '')}
      ${metric('SETUP TIME SAVED', hasVial ? duration(setupSaved) : '—', hasVial && setupSaved > 0 ? 'green' : '', hasVial ? `${setupSavedPct.toFixed(1)}% faster than the no-vial funding path.` : 'No vial selected.')}
      ${metric('VIAL DAILY GAIN', hasVial ? `+${compact(vialGainGrind)} $GRIND` : '—', hasVial ? 'green' : '', hasVial ? `+${compact(vialGainGrit)} GRIT from ${vialHours}h at 2×.` : 'No vial selected.')}
    </div>`,
  )}${panel(
    '5 // FINAL BUILD PERFORMANCE',
    'Add QNs above the minimum and see the added hardware, cost, and daily production gain.',
    `<div class="sim-card final-qn-control">
      <div class="field-title">QNs ABOVE MINIMUM</div>
      <div class="quickadd qn-quick">
        ${[1, 5, 10].map((count) => `<button type="button" class="chip" data-add-planner-qn="${count}">+${count}</button>`).join('')}
        <button type="button" class="chip" data-add-planner-qn="-1" ${extraQns <= 0 ? 'disabled' : ''}>−1</button>
        <button type="button" class="chip" data-clear-planner-qn ${extraQns <= 0 ? 'disabled' : ''}>CLEAR</button>
      </div>
      <p>${result.qns.toLocaleString()} minimum → <b>${finalQns.toLocaleString()} total QNs</b>${extraQns ? ` · +${extraQns.toLocaleString()} added` : ''}.</p>
    </div>
    ${!finalFits ? `<div class="warning">Current build needs ${compact(finalStats.slots)} slots, above the configured ${compact(cap)}-slot cap.</div>` : ''}
    <div class="result-hero-pair final-output-heroes">
      <div class="result-hero current">
        <small>NO VIAL</small>
        <strong>${compact(finalNoVialGrind)}<em> $GRIND</em></strong>
        <p>${compact(finalNoVialGrit)} GRIT / 24H · ${signed(finalNoVialGainVsMinimum, ' $GRIND')} vs minimum</p>
      </div>
      <div class="result-hero simulated">
        <small>${hasVial ? `${vialHours}H VIAL` : 'VIAL PERFORMANCE'}</small>
        <strong>${hasVial ? `${compact(finalVialGrind)}<em> $GRIND</em>` : 'NOT SELECTED'}</strong>
        <p>${hasVial ? `${compact(finalVialGrit)} GRIT / 24H · ${signed(finalVialGain, ' $GRIND')} vial-only gain` : 'Select a vial to compare the same final build.'}</p>
      </div>
    </div>
    <div class="metric-grid final-performance-metrics">
      ${metric('CURRENT BUILD QNs', finalQns.toLocaleString(), extraQns > 0 ? 'green' : '')}
      ${metric('USED SLOTS', compact(finalStats.slots))}
      ${metric('NORMAL RATE', `${compact(finalNormal)}/s`, finalRateGain > 0 ? 'green' : '', finalRateGain > 0 ? `${signed(finalRateGain, '/s')} above minimum.` : 'Minimum build rate.')}
      ${metric('EXTRA QN COST', extraQnCost > 0 ? `−${compact(extraQnCost)} GRIT` : '—', extraQnCost > 0 ? 'negative' : '')}
      ${metric(hasVial ? 'VIAL GAIN VS MINIMUM' : 'GAIN VS MINIMUM', activeGainVsMinimum > 0 ? `+${compact(activeGainVsMinimum)} $GRIND` : '—', activeGainVsMinimum > 0 ? 'green' : '', hasVial ? `No-vial gain: +${compact(finalNoVialGainVsMinimum)} $GRIND / 24H.` : 'Additional no-vial production from added QNs.')}
      ${metric('GAIN / ADDED QN', extraQns > 0 ? `+${compact(gainPerAddedQn)} $GRIND` : '—', extraQns > 0 ? 'green' : '', extraQns > 0 && hasVial ? `No-vial: +${compact(noVialGainPerAddedQn)} $GRIND per added QN.` : extraQns > 0 ? 'Daily gain per added QN.' : 'Add QNs to see marginal production.')}
    </div>`,
  )}`;
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
  const pricing = qnPricing();
  return `${intro(
    'BUILD PLANNER',
    'QN readiness for the stable official minimum. Vial selection can speed this timeline but never changes how many QNs are required here.',
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
    pricingNote: `QN pricing setting: <b>${compact(pricing.base)} GRIT × ${pricing.growth}^owned</b>. QNs are bought one at a time${vialHours ? `; the selected ${vialHours}H vial accelerates funding only while active` : ''}.`,
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
    { item: 'TOTAL KNOWN COST', grind: total, grit: qnCost, note: hasUnknownFrameCost ? 'Separate currencies. Mixed Frame acquisition cost is unknown and excluded.' : 'Separate currencies; unknown prerequisites are not silently estimated.', total: true },
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
