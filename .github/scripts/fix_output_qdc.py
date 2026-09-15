from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing replacement target: {label}")
    return text.replace(old, new, 1)


state_path = Path('src/app/core/state.ts')
state = state_path.read_text()
state = replace_once(
    state,
    """  Object.values(state.settings.rigPresets).forEach(normalizePreset);
  state.target.tier = normalizeTier(state.target.tier);""",
    """  Object.values(state.settings.rigPresets).forEach(normalizePreset);
  const qdcSPreset = state.settings.rigPresets.qdc_s;
  if (qdcSPreset && Math.abs(number(qdcSPreset.synergy) - 600) < 1e-9) {
    qdcSPreset.synergy = DEFAULT_SETTINGS.rigPresets.qdc_s.synergy;
  }
  state.target.tier = normalizeTier(state.target.tier);""",
    'QDC-S persisted-default migration',
)
state_path.write_text(state)


deck_path = Path('src/app/views/deck.ts')
deck = deck_path.read_text()
deck = replace_once(
    deck,
    """  const boostSources = [
    scenario.existingOverclock > 0 ? `${duration(scenario.existingOverclock, { ready: false })} current overclock` : '',
    scenario.nodeBoostSeconds > 0 ? `${duration(scenario.nodeBoostSeconds, { ready: false })} Node/day` : '',
    vialHours > 0 ? `${vialHours}h vial` : '',
  ].filter(Boolean).join(' + ');

""",
    """  const boostSources = [
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

""",
    'deck permanent change cards',
)
deck = replace_once(
    deck,
    """    <div class="result-section-label">WHAT CHANGED</div>
    <div class="result-data-grid">
      <div class="result-data-card"><small>QUANTUM NODES</small><strong>${scenario.currentQns} → ${scenario.targetQns}</strong><span>${scenario.addedQns ? `+${scenario.addedQns} QNs` : 'No QNs added'}</span></div>
      <div class="result-data-card"><small>NORMAL HASHPOWER</small><strong>${compact(scenario.currentRate)}/s → ${compact(scenario.fullRate)}/s</strong><span>${signed(scenario.fullRate - scenario.currentRate, '/s')}</span></div>
      <div class="result-data-card"><small>REFINE RATE</small><strong>${compact(scenario.currentRefine)} → ${compact(scenario.simulatedRefine)}</strong><span>GRIT required per $GRIND</span></div>
      <div class="result-data-card"><small>DECK SLOTS</small><strong>${compact(scenario.currentStats.slots)} → ${compact(scenario.fullStats.slots)}</strong><span>${scenario.fullFitsCap ? 'Fits configured cap' : 'Above configured cap'}</span></div>
    </div>
""",
    """    ${permanentChangeCards ? `<div class="result-section-label">PERMANENT CHANGES</div>
    <div class="result-data-grid">${permanentChangeCards}</div>` : `<div class="info-line">No permanent deck changes selected. Temporary boost effects are shown separately.</div>`}
""",
    'deck static what-changed grid',
)
deck_path.write_text(deck)


test_path = Path('tests/calculations.test.ts')
tests = test_path.read_text()
tests = replace_once(
    tests,
    """import {
  coolantUpgradeCost,""",
    """import { DEFAULT_SETTINGS } from '../src/app/config/game';
import {
  coolantUpgradeCost,""",
    'game config test import',
)
tests = replace_once(
    tests,
    """test('production applies overclock only inside the requested window', () => {""",
    """test('QDC-S defaults to +800 per QN synergy', () => {
  assert.equal(DEFAULT_SETTINGS.rigPresets.qdc_s.synergy, 800);
});

test('production applies overclock only inside the requested window', () => {""",
    'QDC-S default test',
)
test_path.write_text(tests)
