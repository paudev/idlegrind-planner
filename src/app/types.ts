export type ActiveTab = 'target' | 'reset' | 'current' | 'planner' | 'costing' | 'settings';
export type PlannerView = 'output' | 'cost' | 'readiness';
export type DeckView = 'output' | 'cost' | 'readiness';
export type Scope = 'deck' | 'planner';
export type Accent = 'green' | 'purple' | 'gold' | string;

export interface RigPreset {
  name: string;
  rate: number;
  synergy: number;
  slots: number;
  accent: Accent;
  optimizerFill?: boolean;
}

export interface Rig extends RigPreset {
  id: string;
  presetId?: string;
  qty: number;
}

export interface BuffState {
  tier: number;
  coolantLevel: number;
  prestigePct: number;
  bronze: boolean;
  silver: boolean;
  gold: boolean;
  mixed: boolean;
  auraPct: number;
  corePct: number;
  otherMult: number;
}

export interface PlannerState {
  targetGrindPerDay: number;
  extraQns: number;
  vialHours: number;
  buffs: BuffState;
  rigs: Rig[];
  view: PlannerView;
}

export interface SettingsState {
  refineRate: number;
  maxRackSlots: number;
  rigPresets: Record<string, RigPreset>;
}

export interface AppState {
  activeTab: ActiveTab;
  settings: SettingsState;
  target: { grindPerDay: number };
  reset: { finalRate: number; vialHours: number };
  planner: PlannerState;
}

export interface DeckState {
  qns: number;
  addedQns: number;
  currentOverclockHours: number;
  currentOverclockMinutes: number;
  vialHours: number;
  buffs: BuffState;
  rigs: Rig[];
  view: DeckView;
  baseline: {
    currentDeckSlots: number;
    currentGrit: number;
    includeVialCost: boolean;
  };
}

export interface UiState {
  readinessGroup: number;
  readinessPage: number;
  rackPage: number;
}

export interface CostingReferenceState {
  coolantLevel: number;
  rackSlots: number;
}

export type PriceMap = Record<string, number>;

export interface ApplicationStore {
  state: AppState;
  deck: DeckState;
  ui: UiState;
  market: PriceMap;
  vials: PriceMap;
  costingReference: CostingReferenceState;
}

export interface CashoutCycle {
  last: number | null;
}

export interface PersistedCashoutCycle {
  lastWithdrawalAt?: number | null;
}

export interface ProductionResult {
  grit: number;
  overclock: number;
  normal: number;
  average: number;
}

export interface RigStats {
  fixedBase: number;
  fixedSlots: number;
  synergy: number;
  perQn: number;
  base: number;
  slots: number;
}

export interface FundingRow {
  from: number;
  to: number;
  cost: number;
  totalCost: number;
  wait: number;
  time: number;
  balanceAfter: number;
  rateAfter: number;
  overclockActive: boolean;
  unreachable: boolean;
}

export interface FundingProgress {
  qns: number;
  balance: number;
  mined: number;
  spent: number;
  bought: number;
  buyableNow: number;
}

export interface RackExpansionRow {
  capacity: number;
  cost: number;
}

export interface RackExpansionResult {
  total: number;
  rows: RackExpansionRow[];
  count: number;
}

export interface CostRow {
  item: string;
  detail?: string;
  grind?: number;
  grit?: number;
  note?: string;
  total?: boolean;
}

export type CompareRow = [label: string, current: string | number, simulated: string | number, change: string | number];
