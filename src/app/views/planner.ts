import {
  DAY,
  HOUR,
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

function optimizeBuild(): BuildResult {
  const target = Math.max(0, number(store.state.planner.targetGrindPerDay));
  const refine = Math.max(0, number(store.state.settings.refineRate));

  if (target <= 0) return invalidBuild('Set a $GRIND / 24H target above 0.');
  if (refine < 1000) return invalidBuild('Set a valid refinery rate under Settings.');

  const quantumNode = getQuantumNodePreset();
  const buildMultiplier = multiplier(store.state.planner.buffs);
  const vialHours = clamp(number(store.state.planner.vialHours), 0, 24);
  const pricing = qnPricing();
  const solution = solveMinimumBuild({
    targetGrindPerDay: target,
    refineRate: refine,
    vialHours,
    rigs: store.state.planner.rigs,
    buffs: store.state.planner.buffs,
    quantumNode,
    qnBasePrice: pricing.base,
    qnPriceGrowth: pricing.growth,
    allowVialToReduceMinimum: false,
  });

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
    'Build from 0 QNs and 0 GRIT. Minimum QNs are always sized from the normal 1× rate required by the target. A selected vial changes funding speed and production estimates, not the official minimum.',
  )}${panel(
    '1 // DAILY TARGET',
    'Set the $GRIND / 24H target the minimum build must sustain at normal production.',
    `<div class="module-grid two planner-target-grid">
      ${field('state.planner.targetGrindPerDay', '$GRIND / 24H TARGET', store.state.planner.targetGrindPerDay)}
      <div class="hero-output compact">
        <small>BUILD MULTIPLIER</small>
        <strong>×${buildMultiplier.toFixed(3)}</strong>
        <p>The target and official minimum QNs do not move when vial duration changes. Vials only accelerate funding and increase the selected-vial production estimate.</p>
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
    return panel('4 // MINIMUM BUILD', 'Minimum QNs and setup time for the selected target.', `<div class="warning">${escapeHtml(result.reason)}</div>`);
  }

  const funding = result.funding;
  const vialHours = clamp(number(store.state.planner.vialHours), 0, 24);
  const hasVial = vialHours > 0;
  const normalHours = 24 - vialHours;
  const dayFactor = 1 + vialHours / 24;
  const refine = Math.max(0, number(store.state.settings.refineRate));
  const targetGrind = Math.max(0, number(store.state.planner.targetGrindPerDay));
  const targetGrit = targetGrind * refine;
  const pricing = qnPricing();
  const qn = getQuantumNodePreset();
  const qnSlots = Math.max(0, Math.floor(number(qn.slots, 1)));
  const qnCost = qnTotalCost(0, result.qns, pricing.base, pricing.growth);
  const noVialTotalGrit = result.normal * DAY;
  const noVialGrind = refine >= 1000 ? noVialTotalGrit / refine : 0;
  const selectedVialTotalGrit = result.average * DAY;
  const selectedVialGrind = result.grind;
  const overclockExtraGrit = selectedVialTotalGrit - noVialTotalGrit;
  const vialGainGrind = selectedVialGrind - noVialGrind;
  const vialCoversFunding = hasVial
    && Number.isFinite(funding.time)
    && funding.time <= vialHours * HOUR + 1e-6;
  const setupNote = Number.isFinite(funding.time)
    ? hasVial
      ? vialCoversFunding
        ? `Starts from 0 QNs and 0 GRIT. The ${vialHours}H vial covers the full funding path at 2×; minimum QNs stay fixed at the normal target requirement.`
        : `Starts from 0 QNs and 0 GRIT. The ${vialHours}H vial accelerates only the portion of funding before it expires; minimum QNs stay fixed.`
      : 'Starts from 0 QNs and 0 GRIT. QNs are funded sequentially at normal production.'
    : 'Setup time is unreachable from 0 GRIT with the current references. Add a producing fixed rig so QN 1 can be funded.';

  const showAssisted = hasVial && Boolean(store.state.planner.showVialAssistedMinimum);
  const assisted = showAssisted ? solveMinimumBuild({
    targetGrindPerDay: targetGrind,
    refineRate: refine,
    vialHours,
    rigs: store.state.planner.rigs,
    buffs: store.state.planner.buffs,
    quantumNode: qn,
    qnBasePrice: pricing.base,
    qnPriceGrowth: pricing.growth,
    allowVialToReduceMinimum: true,
  }) : null;
  const assistedQns = assisted?.qns ?? result.qns;
  const assistedSavings = Math.max(0, result.qns - assistedQns);
  const assistedStats = showAssisted ? rigStats(store.state.planner.rigs, assistedQns, qn) : null;
  const assistedCost = showAssisted ? qnTotalCost(0, assistedQns, pricing.base, pricing.growth) : 0;

  const extraQns = Math.max(0, Math.floor(number(store.state.planner.extraQns)));
  const finalQns = result.qns + extraQns;
  const finalStats = rigStats(store.state.planner.rigs, finalQns, qn);
  const finalNormal = finalStats.base * result.multiplier;
  const finalNoVialGrit = finalNormal * DAY;
  const finalNoVialGrind = refine >= 1000 ? finalNoVialGrit / refine : 0;
  const finalAverage = finalNormal * dayFactor;
  const finalTotalGrit = finalAverage * DAY;
  const finalGrind = refine >= 1000 ? finalTotalGrit / refine : 0;
  const finalOverclockExtraGrit = finalTotalGrit - finalNoVialGrit;
  const extraQnCost = qnTotalCost(result.qns, extraQns, pricing.base, pricing.growth);
  const grindGain = finalGrind - result.grind;
  const rateGain = finalNormal - result.normal;
  const slotGain = finalStats.slots - result.stats.slots;
  const cap = Math.max(0, number(store.state.settings.maxRackSlots));
  const finalFits = !(cap > 0 && finalStats.slots > cap);

  const assistedBlock = `<div class="sim-card final-qn-control">
    <div class="field-title">VIAL-ASSISTED MINIMUM · OPTIONAL WHAT-IF</div>
    <div class="quickadd qn-quick">
      <button type="button" class="chip ${showAssisted ? 'active' : ''}" data-toggle-planner-vial-assisted ${hasVial ? '' : 'disabled'}>${showAssisted ? 'ON' : 'OFF'}</button>
    </div>
    <p>${hasVial
      ? `The official minimum remains ${result.qns.toLocaleString()} QNs. Turn this on only to see how low the build could go while the selected ${vialHours}H vial is still active.`
      : 'Select a vial under Buffs to compare an optional vial-assisted minimum. The official minimum never changes.'}</p>
  </div>
  ${showAssisted && assisted && assisted.qns !== null && assistedStats ? `<div class="metric-grid optimized-build-metrics">
    ${metric('OFFICIAL MINIMUM QNs', result.qns.toLocaleString())}
    ${metric('VIAL-ASSISTED QNs', assisted.qns.toLocaleString(), assistedSavings > 0 ? 'green' : '', assistedSavings > 0 ? `${assistedSavings} fewer QNs while overclock is active.` : 'Selected vial does not reduce the minimum for this setup.')}
    ${metric('VIAL-ASSISTED READY IN', duration(assisted.fundingTime))}
    ${metric('VIAL-ASSISTED QN COST', assistedCost > 0 ? `−${compact(assistedCost)} GRIT` : '—', assistedCost > 0 ? 'negative' : '')}
    ${metric('VIAL-ASSISTED SLOTS', compact(assistedStats.slots))}
  </div>` : ''}`;

  return `${panel(
    '4 // MINIMUM BUILD',
    'Official minimum hardware is based only on the normal 1× production required by the target. Vials affect funding time and production estimates separately.',
    `${!result.ok ? `<div class="warning">${escapeHtml(result.reason)}</div>` : ''}
    <div class="result-hero-pair optimized-build-heroes">
      <div class="result-hero current">
        <small>MINIMUM QNs REQUIRED</small>
        <strong>${result.qns.toLocaleString()}</strong>
        <p>Stable across NO VIAL / 3H / 6H / 8H / 12H / 24H. ${compact(result.stats.slots)} total slots.</p>
      </div>
      <div class="result-hero ready">
        <small>MINIMUM BUILD READY IN</small>
        <strong>${duration(funding.time)}</strong>
        <p>${setupNote}</p>
      </div>
    </div>
    ${!Number.isFinite(funding.time) && result.qns > 0 ? `<div class="warning optimized-build-warning">Add at least one fixed rig with base production, or reduce the target so the build does not require QNs. Build Planner never borrows GRIT or QNs from Deck Simulator.</div>` : ''}
    <div class="metric-grid optimized-build-metrics">
      ${metric('REQUIRED DECK SLOTS', compact(result.stats.slots))}
      ${metric('QN SLOTS', compact(result.qns * qnSlots))}
      ${metric('FIXED RIG SLOTS', compact(result.stats.fixedSlots))}
      ${metric('QN GRIT COST', qnCost > 0 ? `−${compact(qnCost)} GRIT` : '—', qnCost > 0 ? 'negative' : '')}
    </div>
    ${assistedBlock}
    <div class="final-performance minimum-performance">
      <div class="metric-grid final-performance-metrics">
        ${metric('TARGET $GRIND / 24H', `${compact(targetGrind)} $GRIND`, 'gold')}
        ${metric('TARGET GRIT / 24H', `${compact(targetGrit)} GRIT`)}
        ${metric('REQUIRED NORMAL RATE', `${compact(result.requiredRate)}/s`)}
        ${metric('MINIMUM NORMAL RATE', `${compact(result.normal)}/s`, result.normal + 1e-6 >= result.requiredRate ? 'green' : 'negative')}
      </div>
      <div class="result-hero-pair final-output-heroes">
        <div class="result-hero current">
          <small>NO-VIAL $GRIND / 24H</small>
          <strong>${compact(noVialGrind)}<em> $GRIND</em></strong>
          <p>${compact(noVialTotalGrit)} GRIT from the same ${result.qns.toLocaleString()}-QN minimum build at normal production.</p>
        </div>
        <div class="result-hero simulated">
          <small>${hasVial ? `${vialHours}H VIAL $GRIND / 24H` : 'SELECTED-VIAL $GRIND / 24H'}</small>
          <strong>${compact(selectedVialGrind)}<em> $GRIND</em></strong>
          <p>${hasVial ? `${compact(selectedVialTotalGrit)} GRIT · ${signed(vialGainGrind, ' $GRIND')} from the vial.` : 'No vial selected, so this matches the no-vial output.'}</p>
        </div>
      </div>
      <div class="metric-grid final-performance-metrics">
        ${metric('NO-VIAL 24H OUTPUT', `${compact(noVialTotalGrit)} GRIT`)}
        ${metric('SELECTED-VIAL 24H OUTPUT', `${compact(selectedVialTotalGrit)} GRIT`, hasVial ? 'green' : '')}
        ${metric('VIAL EXTRA OUTPUT', hasVial ? `+${compact(overclockExtraGrit)} GRIT` : '—', hasVial ? 'green' : '', hasVial ? `${vialHours}h at 2× on the same minimum hardware.` : 'No vial selected.')}
      </div>
      <div class="schedule">
        <span><b>${normalHours}h</b> normal production</span>
        <span class="orange"><b>${vialHours}h</b> 2× overclock</span>
      </div>
    </div>`,
  )}${panel(
    '5 // FINAL BUILD PERFORMANCE',
    'Add QNs above the stable minimum and compare the same build with and without the selected vial.',
    `<div class="sim-card final-qn-control">
      <div class="field-title">QNs ABOVE MINIMUM</div>
      <div class="quickadd qn-quick">
        ${[1, 5, 10].map((count) => `<button type="button" class="chip" data-add-planner-qn="${count}">+${count}</button>`).join('')}
        <button type="button" class="chip" data-add-planner-qn="-1" ${extraQns <= 0 ? 'disabled' : ''}>−1</button>
        <button type="button" class="chip" data-clear-planner-qn ${extraQns <= 0 ? 'disabled' : ''}>CLEAR</button>
      </div>
      <p><b>+${extraQns.toLocaleString()} QNs</b> above minimum · ${result.qns.toLocaleString()} minimum → ${finalQns.toLocaleString()} current build QNs.</p>
    </div>
    ${!finalFits ? `<div class="warning">Current build needs ${compact(finalStats.slots)} slots, above the configured ${compact(cap)}-slot cap.</div>` : ''}
    <div class="final-performance">
      <div class="result-hero-pair final-output-heroes">
        <div class="result-hero current">
          <small>NO-VIAL $GRIND / 24H</small>
          <strong>${compact(finalNoVialGrind)}<em> $GRIND</em></strong>
          <p>${compact(finalNoVialGrit)} GRIT at the current ${finalQns.toLocaleString()}-QN build.</p>
        </div>
        <div class="result-hero simulated">
          <small>${hasVial ? `${vialHours}H VIAL $GRIND / 24H` : 'SELECTED-VIAL $GRIND / 24H'}</small>
          <strong>${compact(finalGrind)}<em> $GRIND</em></strong>
          <p>${hasVial ? `${signed(finalGrind - finalNoVialGrind, ' $GRIND')} from the selected vial.` : 'No vial selected.'}</p>
        </div>
      </div>
      <div class="metric-grid final-performance-metrics">
        ${metric('CURRENT BUILD QNs', finalQns.toLocaleString())}
        ${metric('NORMAL RATE', `${compact(finalNormal)}/s`, rateGain > 0 ? 'green' : '', rateGain > 0 ? `${signed(rateGain, '/s')} vs minimum` : 'Minimum build rate')}
        ${metric('SELECTED-VIAL 24H OUTPUT', `${compact(finalTotalGrit)} GRIT`)}
        ${metric('EXTRA $GRIND VS MINIMUM', grindGain > 0 ? signed(grindGain, ' $GRIND') : '—', grindGain > 0 ? 'green' : '')}
        ${metric('EXTRA QN GRIT COST', extraQnCost > 0 ? `−${compact(extraQnCost)} GRIT` : '—', extraQnCost > 0 ? 'negative' : '', extraQns ? `Cost from QN ${result.qns + 1} through ${finalQns}.` : 'No QNs added above minimum.')}
        ${metric('VIAL EXTRA OUTPUT', hasVial ? `+${compact(finalOverclockExtraGrit)} GRIT` : '—', hasVial ? 'green' : '', hasVial ? `${vialHours}h at 2× on this same build.` : 'No vial selected.')}
      </div>
      <div class="schedule">
        <span><b>${normalHours}h</b> normal production</span>
        <span class="orange"><b>${vialHours}h</b> 2× overclock</span>
      </div>
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
    'Known investment for the stable official minimum build from scratch. The optional vial-assisted what-if does not alter these costs.',
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
