import {
  HOUR,
  QN_BASE_PRICE,
  QN_PRICE_GROWTH,
  RACK_BASE_SLOTS,
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
import { getQuantumNodePreset, store } from '../core/state';
import type {
  CashoutCycle,
  CompareRow,
  CostRow,
  FundingProgress,
  FundingRow,
  ProductionResult,
  RigStats,
} from '../types';
import {
  buffsUi,
  chip,
  choiceRow,
  compareRows,
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
  simulatedOverclock: number;
  currentGrit: number;
  currentStats: RigStats;
  fullStats: RigStats;
  currentProjection: ProductionResult | null;
  progress: FundingProgress | null;
  timeline: FundingRow[];
  fullBuildTime: number;
  refine: number;
}

function deckScenario(): DeckScenario {
  const cycle = cashoutCycle();
  const cashoutLeft = cashoutRemainingSeconds(cycle);
  const currentQns = Math.max(0, Math.floor(number(store.deck.qns)));
  const addedQns = Math.max(0, Math.floor(number(store.deck.addedQns)));
  const targetQns = currentQns + addedQns;
  const quantumNode = getQuantumNodePreset();
  const rateForQns = rateFactory(store.deck.rigs, store.deck.buffs, quantumNode);
  const currentRate = rateForQns(currentQns);
  const fullRate = rateForQns(targetQns);
  const existingOverclock = (
    Math.max(0, number(store.deck.currentOverclockHours)) * 60
    + clamp(number(store.deck.currentOverclockMinutes), 0, 59)
  ) * 60;
  const simulatedOverclock = existingOverclock + Math.max(0, number(store.deck.vialHours)) * HOUR;
  const currentGrit = Math.max(0, number(store.deck.baseline.currentGrit));
  const currentStats = rigStats(store.deck.rigs, currentQns, quantumNode);
  const fullStats = rigStats(store.deck.rigs, targetQns, quantumNode);
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
    })
    : null;
  const timeline = fundingTimeline({
    currentQns,
    targetQns,
    currentGrit,
    rateForQns,
    overclockSeconds: simulatedOverclock,
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
    simulatedOverclock,
    currentGrit,
    currentStats,
    fullStats,
    currentProjection,
    progress,
    timeline,
    fullBuildTime,
    refine: Math.max(0, number(store.state.settings.refineRate)),
  };
}

function setupPanels(scenario: DeckScenario): string {
  const qn = getQuantumNodePreset();
  const vialButtons = VIAL_OPTIONS.map((hours) => chip(
    hours ? `⚡ ${hours}H` : 'NO VIAL',
    number(store.deck.vialHours) === hours,
    `data-deck-vial="${hours}"`,
    hours ? 'orange' : '',
  )).join('');

  return `${panel(
    '1 // CURRENT DECK',
    'Enter the deck you have now.',
    `<div class="current-grid">
      ${field('deck.qns', 'CURRENT QUANTUM NODES', store.deck.qns)}
      ${field('deck.baseline.currentGrit', 'CURRENT GRIT BALANCE', store.deck.baseline.currentGrit)}
      ${field('deck.baseline.currentDeckSlots', 'CURRENT DECK SLOT CAPACITY', store.deck.baseline.currentDeckSlots)}
    </div>
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
    'Buffs currently active on the deck.',
    buffsUi(store.deck.buffs, 'deck'),
    `×${multiplier(store.deck.buffs).toFixed(2)}`,
  )}${panel(
    '3 // SIMULATE CHANGES',
    'Add QNs and vial time without changing the current deck.',
    `<div class="sim-grid">
      <div class="sim-card">
        ${field('deck.addedQns', 'QUANTUM NODES TO ADD', store.deck.addedQns)}
        <div class="quickadd qn-quick">
          ${[1, 5, 10, 20, 50].map((count) => `<button type="button" class="chip" data-add-qn="${count}">+${count}</button>`).join('')}
          <button type="button" class="chip" data-clear-qn>CLEAR</button>
        </div>
        <p>Projected total QN cost: <b>${money(qnTotalCost(scenario.currentQns, scenario.addedQns), 'GRIT')}</b></p>
      </div>
      <div class="sim-card">
        <div class="field-title">CURRENT OVERCLOCK LEFT</div>
        <div class="time-inputs">
          <label class="mini-input">HOURS <input data-path="deck.currentOverclockHours" data-num value="${number(store.deck.currentOverclockHours)}"></label>
          <label class="mini-input">MINUTES <input data-path="deck.currentOverclockMinutes" data-num value="${number(store.deck.currentOverclockMinutes)}"></label>
        </div>
        <p>Existing active overclock applies before any added vial.</p>
      </div>
    </div>
    ${choiceRow('ADD VIAL', vialButtons, 'Added after current overclock. Cashout eligibility does not stop the build funding timeline.')}
    ${choiceRow('COSTING', chip('INCLUDE VIAL ACQUISITION', Boolean(store.deck.baseline.includeVialCost), 'data-toggle-vial-cost'), `Uses the editable ${store.deck.vialHours ? `${store.deck.vialHours}H` : ''} vial market reference.`)}`,
  )}`;
}

function outputView(scenario: DeckScenario): string {
  const configured = scenario.cashoutLeft !== null && scenario.currentProjection !== null && scenario.progress !== null;
  const hasProjectionWindow = configured && (scenario.cashoutLeft ?? 0) > 0;
  const simulatedAverage = hasProjectionWindow
    ? scenario.progress!.mined / scenario.cashoutLeft!
    : null;
  const currentGrind = configured && scenario.refine >= 1000
    ? scenario.currentProjection!.grit / scenario.refine
    : null;
  const simulatedGrind = configured && scenario.refine >= 1000
    ? scenario.progress!.mined / scenario.refine
    : null;
  const next = nextCashoutAt(scenario.cycle);

  const rows: CompareRow[] = [
    ['TARGET QUANTUM NODES', scenario.currentQns, scenario.targetQns, signed(scenario.addedQns)],
    ['QNs ACTIVE BY NEXT CASHOUT', scenario.currentQns, configured ? scenario.progress!.qns : '—', configured ? signed(scenario.progress!.qns - scenario.currentQns) : '—'],
    ['USED DECK SLOTS', compact(scenario.currentStats.slots), compact(scenario.fullStats.slots), signed(scenario.fullStats.slots - scenario.currentStats.slots)],
    ['NORMAL RATE', `${compact(scenario.currentRate)}/s`, `${compact(scenario.fullRate)}/s`, signed(scenario.fullRate - scenario.currentRate, '/s')],
    ['2× OVERCLOCK RATE', `${compact(scenario.currentRate * 2)}/s`, `${compact(scenario.fullRate * 2)}/s`, signed((scenario.fullRate - scenario.currentRate) * 2, '/s')],
    ['AVG RATE UNTIL NEXT CASHOUT', hasProjectionWindow ? `${compact(scenario.currentProjection!.average)}/s` : '—', simulatedAverage !== null ? `${compact(simulatedAverage)}/s` : '—', hasProjectionWindow && simulatedAverage !== null ? signed(simulatedAverage - scenario.currentProjection!.average, '/s') : '—'],
    ['BY NEXT CASHOUT', currentGrind !== null ? `${compact(currentGrind)} $GRIND` : '—', simulatedGrind !== null ? `${compact(simulatedGrind)} $GRIND` : '—', currentGrind !== null && simulatedGrind !== null ? signed(simulatedGrind - currentGrind, ' $GRIND') : '—'],
  ];

  return `${intro(
    'DECK SIMULATOR',
    'Start with your current deck, add Quantum Nodes and/or vial time, then compare the realistic result. QNs are funded sequentially when GRIT becomes available.',
  )}${setupPanels(scenario)}${panel(
    '4 // OUTPUT',
    'Current versus simulated output with a funding-aware cashout projection.',
    `<div class="output-ready-strip">
      <div>
        <small>SIMULATED BUILD READY</small>
        <strong>${duration(scenario.fullBuildTime)}</strong>
      </div>
      <span>Sequential funding to ${scenario.targetQns} QNs · ${compact(scenario.fullStats.slots)} used slots. Cashout eligibility does not interrupt the build.</span>
    </div>
    ${compareRows(rows)}
    <div class="schedule output-schedule">
      <span>
        <b>CASHOUT READY IN</b>
        <strong data-live-cashout>${configured ? duration(scenario.cashoutLeft) : 'NOT SET'}</strong>
        ${next !== null ? `<small>Eligible ${formatLocalTime(next, false)}</small>` : ''}
      </span>
      <span><b>CURRENT OVERCLOCK</b><strong>${scenario.existingOverclock ? duration(scenario.existingOverclock, { ready: false }) : 'OFF'}</strong></span>
      <span class="orange"><b>SIMULATED OVERCLOCK</b><strong>${scenario.simulatedOverclock ? duration(scenario.simulatedOverclock, { ready: false }) : 'OFF'}</strong></span>
    </div>`,
    simulatedGrind !== null ? `${compact(simulatedGrind, 2)} BY NEXT CASHOUT` : 'SET CASHOUT',
  )}`;
}

function costingView(scenario: DeckScenario): string {
  const qnCost = qnTotalCost(scenario.currentQns, scenario.addedQns);
  const capacity = Math.max(RACK_BASE_SLOTS, number(store.deck.baseline.currentDeckSlots, RACK_BASE_SLOTS));
  const rack = rackExpansion(capacity, scenario.fullStats.slots);
  const vialPrice = store.deck.vialHours ? store.vials[String(store.deck.vialHours)] ?? 0 : 0;
  const vialCharge = store.deck.baseline.includeVialCost ? vialPrice : 0;
  const totalGrind = rack.total + vialCharge;
  const funding = scenario.progress;

  const summary = `<div class="cost-badges">
    <div><small>$GRIND</small><strong class="${totalGrind ? 'negative' : ''}">${totalGrind ? `−${compact(totalGrind)}` : '0'}</strong></div>
    <div><small>GRIT</small><strong class="${qnCost ? 'negative' : ''}">${qnCost ? `−${compact(qnCost)}` : '0'}</strong></div>
  </div>`;

  const rows: CostRow[] = [
    { item: 'QUANTUM NODES', detail: `+${scenario.addedQns} · ${scenario.currentQns} → ${scenario.targetQns}`, grit: qnCost, note: `QN price assumption: ${compact(QN_BASE_PRICE)} × ${QN_PRICE_GROWTH}^owned.` },
    { item: 'RACK SLOT EXPANSION', detail: rack.count ? `${rack.count} × +6 rack slots` : 'No expansion needed', grind: rack.total, note: rack.count ? `Target uses ${scenario.fullStats.slots} slots.` : 'Current slot capacity fits the simulation.' },
    { item: 'VIAL ACQUISITION', detail: store.deck.vialHours ? `${store.deck.vialHours}H market reference` : 'No vial', grind: vialCharge, note: store.deck.vialHours ? (store.deck.baseline.includeVialCost ? 'Included using Settings market reference.' : 'Reference selected but not charged.') : 'No vial selected.' },
    { item: 'TOTAL KNOWN COST', grind: totalGrind, grit: qnCost, note: 'Currencies remain separate.', total: true },
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
    `${summary}
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
  const issues: Array<{ label: string; message: string }> = [];

  if (scenario.addedQns <= 0) {
    issues.push({ label: 'QUANTUM NODES TO ADD', message: 'Set at least 1 under 3 // SIMULATE CHANGES.' });
  }

  if (scenario.addedQns > 0 && scenario.currentRate <= 0 && scenario.currentGrit < qnPrice(scenario.currentQns)) {
    issues.push({ label: 'MINING SOURCE', message: 'Add a producing rig/current QN, or enough GRIT to buy the first simulated QN.' });
  }

  const unreachable = scenario.timeline.find((row) => row.unreachable);
  if (unreachable && !issues.some((issue) => issue.label === 'MINING SOURCE')) {
    issues.push({ label: 'FUNDING PATH', message: `QN ${unreachable.to} cannot be reached with the current setup.` });
  }

  return renderQnReadiness({
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
    pricingNote: `Pricing assumption: <b>${compact(QN_BASE_PRICE)} GRIT × ${QN_PRICE_GROWTH}^owned</b>. Existing overclock plus the selected vial accelerates purchases only while active.`,
  });
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
