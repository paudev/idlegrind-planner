export const DAY = 86_400;
export const HOUR = 3_600;

export const STORAGE_KEYS = {
  app: 'idlegrind-planner-v5',
  deck: 'idlegrind-current-rack-v1',
  cashout: 'idlegrind-cashout-cycle-v1',
  market: 'idlegrind-marketplace-values-v1',
  vials: 'idlegrind-vial-market-values-v1',
  costingReference: 'idlegrind-costing-reference-v1',
  ui: 'idlegrind-core-ui-v1',
} as const;

export const QN_BASE_PRICE = 2_800_000;
export const QN_PRICE_GROWTH = 1.15;

export const RACK_BASE_SLOTS = 12;
export const RACK_SLOT_STEP = 6;
export const RACK_PRICE_STEP = 6_250;
export const RACK_DISPLAY_LIMIT = 348;
export const ROWS_PER_PAGE = 15;

export const COOLANT_COSTS = [
  0,
  12_000,
  24_000,
  48_000,
  96_000,
  192_000,
  384_000,
  768_000,
  1_536_000,
  3_072_000,
  6_144_000,
] as const;

export const FORGE_ROWS: ReadonlyArray<readonly [name: string, cost: number, note: string]> = [
  ['QDC SHARD', 1_000_000, 'Forge fee'],
  ['MINI QDC', 250_000, 'Forge fee'],
  ['QDC', 500_000, 'Forge fee'],
  ['QDC S', 500_000, 'Forge fee'],
  ['DUSTY LAPTOP → GPU RIG', 1_000, 'Rig forge fee'],
  ['GPU RIG → ASIC MINER', 5_000, 'Rig forge fee'],
  ['ASIC MINER → SERVER RACK', 5_000, 'Rig forge fee'],
  ['SERVER RACK → DATA CENTER', 25_000, 'Rig forge fee'],
  ['DATA CENTER → QUANTUM NODE', 100_000, 'Rig forge fee'],
];

export const MARKET_DEFAULTS: Record<string, number> = {
  qdc_s: 10_000_000,
  qdc: 4_700_000,
  mini_qdc: 2_000_000,
  tiny_qdc: 1_000_000,
  qdc_shard: 850_000,
  bronze_frame: 1_250_000,
  silver_frame: 2_500_000,
  gold_frame: 5_000_000,
};

export const MARKET_LABELS: Record<string, string> = {
  qdc_s: 'QDC S',
  qdc: 'QDC',
  mini_qdc: 'MINI QDC',
  tiny_qdc: 'TINY QDC',
  qdc_shard: 'QDC SHARD',
  bronze_frame: 'BRONZE FRAME',
  silver_frame: 'SILVER FRAME',
  gold_frame: 'GOLD FRAME',
};

export const VIAL_DEFAULTS: Record<string, number> = {
  3: 70_000,
  6: 150_000,
  8: 180_000,
  12: 220_000,
  24: 400_000,
};
