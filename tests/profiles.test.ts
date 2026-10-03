declare const require: (id: string) => any;

const { test } = require('node:test');
const assert = require('node:assert/strict');

function memoryStorage(memory: Map<string, string>): Storage {
  return {
    get length() { return memory.size; },
    clear() { memory.clear(); },
    getItem(key: string) { return memory.get(key) ?? null; },
    key(index: number) { return [...memory.keys()][index] ?? null; },
    removeItem(key: string) { memory.delete(key); },
    setItem(key: string, value: string) { memory.set(key, String(value)); },
  };
}

test('Solana legacy data is retained and Robinhood has a complete independently persisted copy', () => {
  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    value: memoryStorage(memory),
    configurable: true,
  });
  const { STORAGE_KEYS } = require('../src/app/config/economy');
  // The app/deck/cashout keys predate the profile switch. They must remain the
  // Solana workspace, rather than being reset or overwritten on upgrade.
  memory.set(STORAGE_KEYS.app, JSON.stringify({
    settings: { refineRate: 120_000 },
    planner: { targetGrindPerDay: 2_000 },
  }));
  memory.set(STORAGE_KEYS.deck, JSON.stringify({ qns: 20, buffs: { layoutPct: 25 } }));
  memory.set(STORAGE_KEYS.market, JSON.stringify({ qdc: 9_000 }));
  memory.set(STORAGE_KEYS.vials, JSON.stringify({ '3': 77 }));
  memory.set(STORAGE_KEYS.costingReference, JSON.stringify({ coolantLevel: 4 }));
  memory.set(STORAGE_KEYS.cashout, JSON.stringify({ lastWithdrawalAt: 1_000_000 }));

  const { activeProfile, profileStorageKey } = require('../src/app/core/profile');
  const { store, saveAll, switchProfile, resetPlannerData, updateInputPath } = require('../src/app/core/state');
  const { cashoutCycle, saveCashoutCycle } = require('../src/app/core/cashout');

  assert.equal(activeProfile(), 'solana');
  assert.equal(store.state.settings.refineRate, 120_000);
  assert.equal(store.state.planner.targetGrindPerDay, 2_000);
  assert.equal(store.deck.qns, 20);
  assert.equal(store.deck.buffs.layoutPct, 25);
  assert.equal(store.market.qdc, 9_000);
  assert.equal(store.vials['3'], 77);
  assert.equal(store.costingReference.coolantLevel, 4);
  assert.equal(cashoutCycle().last, 1_000_000);
  saveAll();

  switchProfile('robinhood');
  assert.equal(activeProfile(), 'robinhood');
  assert.equal(store.state.settings.refineRate, 120_000);
  assert.equal(store.state.planner.targetGrindPerDay, 2_000);
  assert.equal(store.deck.qns, 20);
  assert.equal(store.deck.buffs.layoutPct, 25);
  assert.equal(store.market.qdc, 9_000);
  assert.equal(store.vials['3'], 77);
  assert.equal(store.costingReference.coolantLevel, 4);
  assert.equal(cashoutCycle().last, 1_000_000);

  store.state.settings.refineRate = 150_000;
  store.state.settings.rigPresets.qdc.rate = 12_345;
  store.state.target.grindPerDay = 4_444;
  store.state.reset.finalRate = 5_555;
  store.state.planner.targetGrindPerDay = 3_000;
  store.state.planner.buffs.layoutPct = 18;
  store.state.planner.rigs = [{
    id: 'rh-plan',
    name: 'RH PLAN',
    qty: 2,
    rate: 333,
    synergy: 44,
    slots: 2,
    accent: 'purple',
  }];
  store.deck.qns = 40;
  store.deck.view = 'readiness';
  store.deck.buffs.layoutPct = 10;
  store.deck.rigs = [{
    id: 'rh-deck',
    name: 'RH DECK',
    qty: 3,
    rate: 222,
    synergy: 11,
    slots: 1,
    accent: 'green',
  }];
  updateInputPath('state.settings.holderTiers.operator.mult', 2.05);
  updateInputPath('state.settings.holderTiers.operator.refinePct', 12);
  store.state.planner.buffs.tier = 2.05;
  store.deck.buffs.tier = 2.05;
  store.market.qdc = 12_000;
  store.vials['3'] = 88;
  store.costingReference.coolantLevel = 7;
  saveCashoutCycle({ lastWithdrawalAt: 2_000_000 });
  saveAll();

  switchProfile('solana');
  assert.equal(store.state.settings.refineRate, 120_000);
  assert.equal(store.state.settings.holderTiers.operator.mult, 1.75);
  assert.equal(store.state.settings.holderTiers.operator.refinePct, 5);
  assert.equal(store.state.settings.rigPresets.qdc.rate, 10_000);
  assert.equal(store.state.target.grindPerDay, 0);
  assert.equal(store.state.reset.finalRate, 0);
  assert.equal(store.state.planner.targetGrindPerDay, 2_000);
  assert.equal(store.state.planner.buffs.layoutPct, 0);
  assert.equal(store.state.planner.rigs.length, 0);
  assert.equal(store.deck.qns, 20);
  assert.equal(store.deck.buffs.layoutPct, 25);
  assert.equal(store.market.qdc, 9_000);
  assert.equal(store.vials['3'], 77);
  assert.equal(store.costingReference.coolantLevel, 4);
  assert.equal(cashoutCycle().last, 1_000_000);

  switchProfile('robinhood');
  assert.equal(store.state.settings.refineRate, 150_000);
  assert.equal(store.state.settings.holderTiers.operator.mult, 2.05);
  assert.equal(store.state.settings.holderTiers.operator.refinePct, 12);
  assert.equal(store.state.settings.rigPresets.qdc.rate, 12_345);
  assert.equal(store.state.target.grindPerDay, 4_444);
  assert.equal(store.state.reset.finalRate, 5_555);
  assert.equal(store.state.planner.targetGrindPerDay, 3_000);
  assert.equal(store.state.planner.buffs.layoutPct, 18);
  assert.equal(store.state.planner.buffs.tier, 2.05);
  assert.equal(store.state.planner.rigs[0]?.name, 'RH PLAN');
  assert.equal(store.deck.qns, 40);
  assert.equal(store.deck.view, 'readiness');
  assert.equal(store.deck.buffs.layoutPct, 10);
  assert.equal(store.deck.buffs.tier, 2.05);
  assert.equal(store.deck.rigs[0]?.name, 'RH DECK');
  assert.equal(store.market.qdc, 12_000);
  assert.equal(store.vials['3'], 88);
  assert.equal(store.costingReference.coolantLevel, 7);
  assert.equal(cashoutCycle().last, 2_000_000);
  assert.equal(JSON.parse(memory.get('idlegrind-planner-active-profile-v1') ?? '{}').profile, 'robinhood');

  resetPlannerData();
  assert.equal(store.deck.qns, 0);
  switchProfile('solana');
  assert.equal(store.deck.qns, 20);
  assert.equal(JSON.parse(memory.get(STORAGE_KEYS.snapshot) ?? '{}').state.settings.refineRate, 120_000);
  assert.equal(
    JSON.parse(memory.get(profileStorageKey(STORAGE_KEYS.snapshot, 'robinhood')) ?? '{}').state.settings.refineRate,
    104_000,
  );
});
