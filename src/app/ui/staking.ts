import { STAKING_NODE_OPTIONS } from '../config/game';
import { compact, number } from '../core/format';
import { permanentRefineRate, stakingNode } from '../core/staking';
import type { BuffState, Scope } from '../types';

function pathFor(scope: Scope): string {
  return scope === 'deck' ? 'deck.buffs.stakingNode' : 'state.planner.buffs.stakingNode';
}

function nodeEffectParts(id: number): string[] {
  const node = stakingNode(id);
  if (!node.id) return [];
  return [
    node.hashPct ? `HASH +${node.hashPct}%` : '',
    node.refinePct ? `REFINE −${node.refinePct}%` : '',
    node.dailyBoostHours ? `DAILY 2× · ${node.dailyBoostHours}H` : '',
  ].filter(Boolean);
}

function nodeTitle(id: number): string {
  const node = stakingNode(id);
  const effects = nodeEffectParts(id);
  return effects.length ? `${node.label} · ${effects.join(' · ')}` : node.label;
}

function nodeShortLabel(id: number): string {
  const node = stakingNode(id);
  return node.id ? `N${node.id}` : 'NONE';
}

function radioChip(
  path: string,
  value: number,
  checked: boolean,
  label: string,
  tone = '',
  title = '',
): string {
  return `<label class="chip staking-choice ${tone} ${checked ? 'active' : ''}"${title ? ` title="${title}"` : ''}>
    <input type="radio" name="${path}" data-path="${path}" value="${value}" ${checked ? 'checked' : ''}>
    <span>${label}</span>
  </label>`;
}

function selectedNodeSummary(id: number, inherited = false): string {
  const node = stakingNode(id);
  const effects = nodeEffectParts(node.id);
  return `<div class="staking-selected-row ${node.id ? 'active' : ''}">
    <div class="staking-selected-name">
      <small>${inherited ? 'USING CURRENT NODE' : 'SELECTED'}</small>
      <strong>${node.label}</strong>
    </div>
    <div class="staking-effect-list">
      ${effects.length
        ? effects.map((part) => `<b>${part}</b>`).join('')
        : '<span>No staking bonuses</span>'}
    </div>
  </div>`;
}

function stakingBlock(label: string, help: string, chips: string, summary: string): string {
  return `<div class="staking-block">
    <div class="staking-block-head">
      <div>
        <b>${label}</b>
        <small>${help}</small>
      </div>
    </div>
    <div class="staking-chips">${chips}</div>
    ${summary}
  </div>`;
}

export function stakingNodeRow(buffs: BuffState, scope: Scope): string {
  const selected = stakingNode(buffs.stakingNode).id;
  const path = pathFor(scope);
  const chips = STAKING_NODE_OPTIONS.map((node) => radioChip(
    path,
    node.id,
    selected === node.id,
    nodeShortLabel(node.id),
    node.id >= 4 ? 'gold' : node.id >= 2 ? 'purple' : '',
    nodeTitle(node.id),
  )).join('');

  return stakingBlock(
    'STAKING NODE',
    'Permanent hash/refine while the node is active.',
    chips,
    selectedNodeSummary(selected),
  );
}

export function simulatedNodeRow(currentBuffs: BuffState, simulatedNodeValue: unknown): string {
  const current = stakingNode(currentBuffs.stakingNode).id;
  const raw = number(simulatedNodeValue, -1);
  const selectedOverride = raw >= 0 && raw <= 4 ? Math.floor(raw) : -1;
  const effective = selectedOverride >= 0 ? selectedOverride : current;
  const path = 'deck.simulatedNode';

  const chips = [
    radioChip(
      path,
      -1,
      selectedOverride === -1,
      'CURRENT',
      '',
      `Use current staking Node (${stakingNode(current).label})`,
    ),
    ...STAKING_NODE_OPTIONS.map((node) => radioChip(
      path,
      node.id,
      selectedOverride === node.id,
      nodeShortLabel(node.id),
      node.id >= 4 ? 'gold' : node.id >= 2 ? 'purple' : '',
      nodeTitle(node.id),
    )),
  ].join('');

  return stakingBlock(
    'SIMULATED NODE',
    'Only changes the simulated result.',
    chips,
    selectedNodeSummary(effective, selectedOverride < 0),
  );
}

export function dailyNodeBoostToggle(nodeId: unknown, enabled: unknown): string {
  const node = stakingNode(nodeId);
  if (node.dailyBoostHours <= 0) return '';
  const checked = number(enabled, 1) >= 0.5;

  return `<div class="staking-boost-option">
    <div>
      <b>DAILY NODE BOOST</b>
      <small>${node.dailyBoostHours}h/day at 2× in forward projections.</small>
    </div>
    <label class="chip staking-toggle ${checked ? 'active' : ''}">
      <input type="checkbox" data-path="deck.includeDailyNodeBoost" ${checked ? 'checked' : ''}>
      <span>${checked ? 'INCLUDED' : 'EXCLUDED'}</span>
    </label>
  </div>`;
}

export function productionMultiplierText(buffs: BuffState): string {
  const factors: Array<[string, number]> = [
    ['Tier', number(buffs.tier) > 0 ? number(buffs.tier) : 1],
    ['Coolant', 1 + Math.max(0, number(buffs.coolantLevel)) * 0.1],
    ['Prestige', 1 + Math.max(0, number(buffs.prestigePct)) / 100],
    ['Frame', buffs.mixed
      ? 7 / 3
      : 1 + (buffs.bronze ? 0.15 : 0) + (buffs.silver ? 0.3 : 0) + (buffs.gold ? 0.55 : 0)],
    ['Aura', 1 + Math.max(0, number(buffs.auraPct)) / 100],
    ['Core', 1 + Math.max(0, number(buffs.corePct)) / 100],
  ];
  const active = factors.filter(([, value]) => Math.abs(value - 1) > 1e-9);
  return active.length
    ? active.map(([label, value]) => `${label} ×${value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}`).join(' · ')
    : 'No production multipliers active';
}

export function permanentMathSummary(baseRefineRate: number, buffs: BuffState): {
  nodeLabel: string;
  nodeHashPct: number;
  nodeRefinePct: number;
  nodeBoostHours: number;
  refineRate: number;
  refineText: string;
} {
  const node = stakingNode(buffs.stakingNode);
  const refineRate = permanentRefineRate(baseRefineRate, buffs);
  return {
    nodeLabel: node.label,
    nodeHashPct: node.hashPct,
    nodeRefinePct: node.refinePct,
    nodeBoostHours: node.dailyBoostHours,
    refineRate,
    refineText: `${compact(baseRefineRate)} → ${compact(refineRate)} GRIT / $GRIND`,
  };
}
