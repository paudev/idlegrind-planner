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

  if (target <= 0) return invalidBuild('Set a $GRIND / 24H rate target above 0.');
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
    'Build from 0 QNs and 0 GRIT. The target is converted to a GRIT/s rate at build readiness; a vial can reduce minimum QNs only when it is still active when that build becomes ready.',
  )}${panel(
    '1 // RATE TARGET',
    'Set the $GRIND / 24H rate-equivalent the build should reach at readiness.',
    `<div class="module-grid two planner-target-grid">
      ${field('state.planner.targetGrindPerDay', '$GRIND / 24H RATE TARGET', store.state.planner.targetGrindPerDay)}
      <div class="hero-output compact">
        <small>BUILD MULTIPLIER</small>
        <strong>×${buildMultiplier.toFixed(3)}</strong>
        <p>Vials accelerate sequential GRIT funding. Extending a vial past build readiness does not lower the minimum QN count further.</p>
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
    return panel('4 // MINIMUM BUILD', 'Minimum QNs and setup time for the selected rate target.', `<div class="warning">${escapeHtml(result.reason)}</div>`);
  }

  const funding = result.funding;
  const vialHours = clamp(number(store.state.planner.vialHours), 0, 24);
  const normalHours = 24 - vialHours;
  const dayFactor = 1 + vialHours / 24;
  const refine = Math.max(0, number(store.state.settings.refineRate));
  const pricing = qnPricing();
  const qn = getQuantumNodePreset();
  const qnSlots = Math.max(0, Math.floor(number(qn.slots, 1)));
  const qnCost = qnTotalCost(0, result.qns, pricing.base, pricing.growth);
  const totalGrit = result.average * DAY;
  const overclockExtraGrit = result.normal * vialHours * HOUR;
  const setupNote = Number.isFinite(funding.time)
    ? result.productionFactorAtReady === 2
      ? `Starts from 0 QNs and 0 GRIT. The selected ${vialHours}H vial is still active when the build becomes ready, so longer vial durations do not reduce the minimum further.`
      : `Starts from 0 QNs and 0 GRIT. ${vialHours ? `The ${vialHours}H vial accelerates funding, but the minimum is sized for normal production because the vial is no longer active at readiness.` : 'QNs are funded sequentially at normal production.'}`
    : 'Setup time is unreachable from 0 GRIT with the current references. Add a producing fixed rig so QN 1 can be funded.';

  const extraQns = Math.max(0, Math.floor(number(store.state.planner.extraQns)));
  const finalQns = result.qns + extraQns;
  const finalStats = rigStats(store.state.planner.rigs, finalQns, qn);
  const finalNormal = finalStats.base * result.multiplier;
  const finalAverage = finalNormal * dayFactor;
  const finalTotalGrit = finalAverage * DAY;
  const finalGrind = refine >= 1000 ? finalTotalGrit / refine : 0;
  const finalOverclockExtraGrit = finalNormal * vialHours * HOUR;
  const extraQnCost = qnTotalCost(result.qns, extraQns, pricing.base, pricing.growth);
  const grindGain = finalGrind - result.grind;
  const rateGain = finalNormal - result.normal;
  const slotGain = finalStats.slots - result.stats.slots;
  const cap = Math.max(0, number(store.state.settings.maxRackSlots));
  const finalFits = !(cap > 0 && finalStats.slots > cap);

  return `${panel(
    '4 // MINIMUM BUILD',
    'Minimum Quantum Nodes from sequential GRIT funding and the production rate available at build readiness.',
    `${!result.ok ? `<div class="warning">${escapeHtml(result.reason)}</div>` : ''}
    <div class="result-hero-pair optimized-build-heroes">
      <div class="result-hero current">
        <small>MINIMUM QNs REQUIRED</small>
        <strong>${result.qns.toLocaleString()}</strong>
        <p>${compact(result.stats.slots)} total slots · ${compact(result.stats.fixedSlots)} fixed-rig slots</p>
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
    <div class="final-performance minimum-performance">
      <div class="result-hero-pair final-output-heroes">
        <div class="result-hero simulated">
          <small>COMPLETED-BUILD 24H BENCHMARK</small>
          <strong>${compact(totalGrit)}<em> GRIT</em></strong>
          <p>${compact(result.grind)} $GRIND with the selected vial schedule. This benchmark is separate from the readiness-rate solver.</p>
        </div>
        <div class="result-hero current">
          <small>RATE AT BUILD READY</small>
          <strong>${compact(result.rateAtReady)}<em>/s</em></strong>
          <p>${result.productionFactorAtReady === 2 ? '2× overclock is active at readiness.' : 'Normal production rate at readiness.'}</p>
        </div>
      </div>
      <div class="metric-grid final-performance-metrics">
        ${metric('TARGET RATE', `${compact(result.requiredRate)}/s`)}
        ${metric('RATE AT BUILD READY', `${compact(result.rateAtReady)}/s`, result.rateAtReady + 1e-6 >= result.requiredRate ? 'green' : 'negative')}
        ${metric('NORMAL RATE', `${compact(result.normal)}/s`)}
        ${metric('OVERCLOCK EXTRA OUTPUT', vialHours ? `+${compact(overclockExtraGrit)} GRIT` : '—', vialHours ? 'green' : '', vialHours ? `Extra GRIT contributed by ${vialHours}h at 2× in the completed-build benchmark.` : 'No vial selected.')}
        ${metric('SIMULATED $GRIND / 24H', `${compact(result.grind)} $GRIND`, 'gold')}
      </div>
      <div class="schedule">
        <span><b>${normalHours}h</b> normal production</span>
        <span class="orange"><b>${vialHours}h</b> 2× overclock</span>
      </div>
    </div>`,
  )}${panel(
    '5 // FINAL BUILD PERFORMANCE',
    'Add QNs above the minimum and see the completed-build 24H benchmark.',
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
        <div class="result-hero simulated">
          <small>CURRENT BUILD $GRIND / 24H</small>
          <strong>${compact(finalGrind)}<em> $GRIND</em></strong>
          <p>${grindGain > 0 ? `${signed(grindGain, ' $GRIND')} versus the minimum build benchmark.` : 'Matches the minimum build benchmark.'}</p>
        </div>
        <div class="result-hero current">
          <small>CURRENT BUILD QNs</small>
          <strong>${finalQns.toLocaleString()}</strong>
          <p>${compact(finalStats.slots)} total slots · ${extraQns ? `+${compact(slotGain)} slots from added QNs` : 'no QNs added above minimum'}.</p>
        </div>
      </div>
      <div class="metric-grid final-performance-metrics">
        ${metric('NORMAL RATE', `${compact(finalNormal)}/s`, rateGain > 0 ? 'green' : '', rateGain > 0 ? `${signed(rateGain, '/s')} vs minimum` : 'Minimum build rate')}
        ${metric('EFFECTIVE 24H RATE', `${compact(finalAverage)}/s`)}
        ${metric('TOTAL 24H OUTPUT', `${compact(finalTotalGrit)} GRIT`)}
        ${metric('EXTRA $GRIND / 24H', grindGain > 0 ? signed(grindGain, ' $GRIND') : '—', grindGain > 0 ? 'green' : '')}
        ${metric('EXTRA QN GRIT COST', extraQnCost > 0 ? `−${compact(extraQnCost)} GRIT` : '—', extraQnCost > 0 ? 'negative' : '', extraQns ? `Cost from QN ${result.qns + 1} through ${finalQns}.` : 'No QNs added above minimum.')}
        ${metric('OVERCLOCK EXTRA OUTPUT', vialHours ? `+${compact(finalOverclockExtraGrit)} GRIT` : '—', vialHours ? 'green' : '', vialHours ? `${vialHours}h at 2× in the 24H benchmark.` : 'No vial selected.')}
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
    'QN readiness for the minimum build. This timeline is calculated from the Build Planner references only.',
  )}${renderQnReadiness({
    scope: 'planner',
    requestedQns: result.qns,
    startingGrit: 0,
    startingRate: funding.startingRate,
    timeline: funding.timeline,
    fullBuildTime: funding.time,
    subtitle: 'When each required Quantum Node becomes affordable while assembling the minimum build from scratch.',
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
    return panel('4 // COSTING', 'Known investment for the minimum build.', `<div class="warning">${escapeHtml(result.reason || 'Set a valid target and build setup first.')}</div>`);
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
    'Known investment for the minimum build from scratch. Frame prices use editable Marketplace References under Settings.',
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
