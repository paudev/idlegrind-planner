import { STAKING_NODE_OPTIONS } from '../config/game';
import { compact, number } from '../core/format';
import { permanentRefineRate, stakingNode } from '../core/staking';
import type { BuffState, Scope } from '../types';
import { choiceRow } from './components';

function pathFor(scope: Scope): string {
  return scope === 'deck' ? 'deck.buffs.stakingNode' : 'state.planner.buffs.stakingNode';
}

function nodeLabel(id: number): string {
  const node = stakingNode(id);
  if (!node.id) return 'NONE';
  const effects = [
    node.refinePct ? `REFINE −${node.refinePct}%` : '',
    node.hashPct ? `HASH +${node.hashPct}%` : '',
    node.dailyBoostHours ? `${node.dailyBoostHours}H DAILY` : '',
  ].filter(Boolean).join(' · ');
  return `${node.label}${effects ? ` · ${effects}` : ''}`;
}

function radioChip(path: string, value: number, checked: boolean, label: string, tone = ''): string {
  return `<label class="chip staking-choice ${tone} ${checked ? 'active' : ''}">
    <input type="radio" name="${path}" data-path="${path}" value="${value}" ${checked ? 'checked' : ''}>
    <span>${label}</span>
  </label>`;
}

export function stakingNodeRow(buffs: BuffState, scope: Scope): string {
  const selected = stakingNode(buffs.stakingNode).id;
  const path = pathFor(scope);
  return choiceRow(
    'STAKING NODE',
    STAKING_NODE_OPTIONS.map((node) => radioChip(
      path,
      node.id,
      selected === node.id,
      nodeLabel(node.id),
      node.id >= 4 ? 'gold' : node.id >= 2 ? 'purple' : '',
    )).join(''),
    'Node hashpower compounds with the normal build multiplier. Node refine compounds with holder-tier refine. Daily boost is temporary 2× time.',
  );
}

export function simulatedNodeRow(currentBuffs: BuffState, simulatedNodeValue: unknown): string {
  const current = stakingNode(currentBuffs.stakingNode).id;
  const raw = number(simulatedNodeValue, -1);
  const selected = raw >= 0 && raw <= 4 ? Math.floor(raw) : -1;
  const path = 'deck.simulatedNode';
  const inherit = radioChip(path, -1, selected === -1, `SAME AS CURRENT · ${stakingNode(current).label}`);
  const options = STAKING_NODE_OPTIONS.map((node) => radioChip(
    path,
    node.id,
    selected === node.id,
    nodeLabel(node.id),
    node.id >= 4 ? 'gold' : node.id >= 2 ? 'purple' : '',
  )).join('');
  return choiceRow(
    'SIMULATED NODE',
    `${inherit}${options}`,
    'Overrides only the simulated side. Current deck keeps the Node selected under Current Buffs.',
  );
}

export function dailyNodeBoostToggle(nodeId: unknown, enabled: unknown): string {
  const node = stakingNode(nodeId);
  const checked = number(enabled, 1) >= 0.5;
  const disabled = node.dailyBoostHours <= 0;
  return choiceRow(
    'DAILY NODE BOOST',
    `<label class="chip staking-toggle ${checked && !disabled ? 'active' : ''} ${disabled ? 'disabled' : ''}">
      <input type="checkbox" data-path="deck.includeDailyNodeBoost" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
      <span>${disabled ? 'NO DAILY BOOST ON THIS NODE' : `INCLUDE ${node.dailyBoostHours}H DAILY 2× BOOST`}</span>
    </label>`,
    disabled
      ? 'The selected simulated Node has no daily boost.'
      : 'Applies the Node daily boost to forward-looking 24H and funding projections. Current overclock remaining stays a separate factual input.',
  );
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
