import { COOLANT_LEVELS, PRESTIGE_OPTIONS, TIER_OPTIONS, VIAL_OPTIONS } from '../config/game';
import { multiplier } from '../core/calculations';
import { compact, escapeHtml, inputText, money, number } from '../core/format';
import { store } from '../core/state';
import type { BuffState, CompareRow, CostRow, Rig, Scope } from '../types';

export function panel(title: string, subtitle: string, body: string, badge = ''): string {
  return `<section class="panel">
    <div class="panelhead">
      <div>
        <h2>${title}</h2>
        ${subtitle ? `<p>${subtitle}</p>` : ''}
      </div>
      ${badge ? `<span class="badge">${badge}</span>` : ''}
    </div>
    <div class="panelbody">${body}</div>
  </section>`;
}

export function pageStack(...sections: string[]): string {
  return `<div class="page-stack">${sections.join('')}</div>`;
}

export function metric(label: string, value: string | number, tone = '', note = ''): string {
  return `<div class="metric ${tone}">
    <small>${label}</small>
    <strong>${value}</strong>
    ${note ? `<span>${note}</span>` : ''}
  </div>`;
}

export function field(path: string, label: string, value: unknown, attrs = ''): string {
  return `<label class="field">
    <span>${label}</span>
    <input data-path="${path}" data-num value="${inputText(value)}" ${attrs}>
  </label>`;
}

export function chip(label: string, active: boolean, attrs: string, tone = ''): string {
  return `<button type="button" class="chip ${tone} ${active ? 'active' : ''}" ${attrs}>${label}</button>`;
}

export function info(text: string): string {
  return `<div class="info-line">${text}</div>`;
}

export function intro(title: string, text: string): string {
  return `<div class="page-intro"><b>${title}</b><span>${text}</span></div>`;
}

export function table(headers: string[], rows: string[], className = '', wrapperClass = ''): string {
  return `<div class="table-scroll ${wrapperClass}">
    <table class="${className}">
      <thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>
  </div>`;
}

export function compareRows(rows: CompareRow[]): string {
  return table(
    ['METRIC', 'CURRENT', 'SIMULATED', 'CHANGE'],
    rows.map(([label, current, simulated, change]) => {
      const text = String(change);
      const tone = text.startsWith('+') ? 'positive' : text.startsWith('−') ? 'negative' : '';
      return `<tr><th>${label}</th><td>${current}</td><td>${simulated}</td><td class="${tone}">${change}</td></tr>`;
    }),
    'compare-table',
  );
}

export function costRows(rows: CostRow[]): string {
  return table(
    ['ITEM', 'DETAIL', '$GRIND', 'GRIT', 'NOTE'],
    rows.map((row) => {
      const grind = Math.max(0, row.grind ?? 0);
      const grit = Math.max(0, row.grit ?? 0);
      const grindRelevant = grind > 0;
      const gritRelevant = grit > 0;

      return `<tr class="${row.total ? 'total' : ''}">
        <th>${row.item}</th>
        <td>${row.detail || '—'}</td>
        <td class="${grindRelevant ? 'negative' : 'irrelevant'}">${grindRelevant ? money(grind, '$GRIND', true) : '—'}</td>
        <td class="${gritRelevant ? 'negative' : 'irrelevant'}">${gritRelevant ? money(grit, 'GRIT', true) : '—'}</td>
        <td class="note">${row.note || ''}</td>
      </tr>`;
    }),
    'cost-table',
    'cost-table-scroll',
  );
}

export function choiceRow(label: string, body: string, hint = ''): string {
  return `<div class="buffrow">
    <div class="bufflabel">
      <b>${label}</b>
      ${hint ? `<small>${hint}</small>` : ''}
    </div>
    <div class="choices">${body}</div>
  </div>`;
}

export function subTabs(scope: Scope, active: string, includeReadiness = false): string {
  const tabs: Array<[string, string]> = [
    ['output', 'OUTPUT'],
    ['cost', 'COSTING'],
    ...(includeReadiness ? [['readiness', 'QN READINESS'] as [string, string]] : []),
  ];

  return `<div class="subtabs flat-subtabs">
    ${tabs.map(([id, label]) => `<button type="button" class="subtab ${active === id ? 'active' : ''}" data-view-scope="${scope}" data-view="${id}">${label}</button>`).join('')}
  </div>`;
}

export function holderTierChipContent(option: (typeof TIER_OPTIONS)[number]): string {
  return `<span class="holder-tier-name">${option.label}</span>
    <span class="holder-tier-stats">
      <b>HASH ×${option.mult}</b>
      <em>${option.refinePct ? `REFINE −${option.refinePct}%` : 'REFINE —'}</em>
    </span>`;
}

export function holderTierRow(body: string, hint = ''): string {
  return `<div class="holder-tier-row">
    <div class="holder-tier-row-head">
      <b>HOLDER TIER</b>
      ${hint ? `<small>${hint}</small>` : ''}
    </div>
    <div class="holder-tier-grid">${body}</div>
  </div>`;
}

export function buffsUi(
  buffs: BuffState,
  scope: Scope,
  { withVial = false, vialHours = 0 }: { withVial?: boolean; vialHours?: number } = {},
): string {
  const tiers = TIER_OPTIONS.map((tier) => `<button type="button" class="holder-tier-card ${buffs.tier === tier.mult ? 'active' : ''}" data-buff="${scope}:tier:${tier.mult}">
    ${holderTierChipContent(tier)}
  </button>`).join('');

  const coolant = COOLANT_LEVELS.map((level) => chip(
    level ? `+${level * 10}%` : 'OFF',
    buffs.coolantLevel === level,
    `data-buff="${scope}:coolantLevel:${level}"`,
  )).join('');

  const prestige = PRESTIGE_OPTIONS.map((option) => chip(
    option.pct ? `${option.label} +${option.pct}%` : option.label,
    buffs.prestigePct === option.pct,
    `data-buff="${scope}:prestigePct:${option.pct}"`,
    'gold',
  )).join('');

  const frames: Array<[keyof Pick<BuffState, 'bronze' | 'silver' | 'gold' | 'mixed'>, string, string]> = [
    ['bronze', 'BRONZE +15%', ''],
    ['silver', 'SILVER +30%', ''],
    ['gold', 'GOLD +55%', 'gold'],
    ['mixed', 'MIXED +133%', 'purple'],
  ];

  let html = `<div class="buffdeck">
    ${holderTierRow(tiers, 'Hash multiplier affects production. Operator+ also lowers GRIT required per $GRIND.')}
    ${choiceRow('COOLANT', coolant)}
    ${choiceRow('PRESTIGE', prestige)}
    ${choiceRow('FRAMES', frames.map(([key, label, tone]) => chip(label, buffs[key], `data-frame="${scope}:${key}"`, tone)).join(''), 'Mixed replaces the normal frame layer.')}
    ${choiceRow('AURA', `${chip('OFF', number(buffs.auraPct) === 0, `data-buff="${scope}:auraPct:0"`, 'purple')}${chip('+10%', number(buffs.auraPct) === 10, `data-buff="${scope}:auraPct:10"`, 'purple')}<label class="mini-input">CUSTOM <input data-custom-buff="${scope}:auraPct" data-num value="${inputText(buffs.auraPct)}"></label>`)}
    ${choiceRow('CORE', `<label class="mini-input">POWER % <input data-custom-buff="${scope}:corePct" data-num value="${inputText(buffs.corePct)}"></label>`, 'Use the exact Core Power from THE CORE (for example 1.60), not the rounded Mining Deck badge.')}
  `;

  if (withVial) {
    html += choiceRow(
      'OVERCLOCK',
      VIAL_OPTIONS.map((hours) => chip(
        hours ? `⚡ ${hours}H` : 'NO VIAL',
        number(vialHours) === hours,
        `data-pl-vial="${hours}"`,
        hours ? 'orange' : '',
      )).join(''),
      'Selected vial hours run at 2×; the rest of the 24H benchmark is normal.',
    );
  }

  html += buffMultiplierSummary(buffs, vialHours);

  return `${html}</div>`;
}

function multiplierText(value: number): string {
  return value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

export function buffMultiplierSummary(
  buffs: BuffState,
  vialHours = 0,
  label = 'TOTAL BUFF MULTIPLIER',
): string {
  const permanent = multiplier(buffs);
  const vial = Math.max(0, number(vialHours));
  return `<div class="buff-total-multiplier">
    <div class="buff-total-copy">
      <small>${label}</small>
      <span>Matches the Mining Deck buff stack · Node hash bonus is applied to hash rate, not this total${vial > 0 ? ' · vial 2× shown separately.' : '.'}</span>
    </div>
    <div class="buff-total-values">
      <div><em>PERMANENT</em><strong>×${multiplierText(permanent)}</strong></div>
      ${vial > 0 ? `<div class="vial"><em>WITH ${vial}H VIAL</em><strong>×${multiplierText(permanent * 2)}</strong></div>` : ''}
    </div>
  </div>`;
}

export function rigButtons(scope: Scope): string {
  const presets = Object.entries(store.state.settings.rigPresets)
    .filter(([, rig]) => !rig.optimizerFill)
    .map(([id, rig]) => `<button type="button" class="addrig ${escapeHtml(rig.accent || '')}" data-add-rig="${scope}:${id}">+ ${escapeHtml(rig.name)}</button>`)
    .join('');

  return `${presets}<button type="button" class="addrig" data-add-custom="${scope}">+ CUSTOM RIG</button>`;
}

export function rigList(rigs: Rig[], scope: Scope): string {
  if (!rigs.length) return '<div class="empty">No fixed rigs entered.</div>';

  return rigs.map((rig) => `<div class="rigrow" data-rig-row="${scope}:${escapeHtml(rig.id)}">
    <div class="rigidentity">
      <span class="rigdot ${escapeHtml(rig.accent || 'green')}"></span>
      <input data-rig-field="${scope}:${escapeHtml(rig.id)}:name" value="${escapeHtml(rig.name)}">
    </div>
    <label><small>QTY</small><input data-rig-field="${scope}:${escapeHtml(rig.id)}:qty" data-num value="${inputText(rig.qty)}"></label>
    <label><small>BASE /s</small><input data-rig-field="${scope}:${escapeHtml(rig.id)}:rate" data-num value="${inputText(rig.rate)}"></label>
    <label><small>+ / QN</small><input data-rig-field="${scope}:${escapeHtml(rig.id)}:synergy" data-num value="${inputText(rig.synergy)}"></label>
    <label><small>SLOTS</small><input data-rig-field="${scope}:${escapeHtml(rig.id)}:slots" data-num value="${inputText(rig.slots)}"></label>
    <button type="button" class="remove" data-remove-rig="${scope}:${escapeHtml(rig.id)}">×</button>
  </div>`).join('');
}

export function quantumNodeReference(): string {
  const rig = store.state.settings.rigPresets.quantum_node;
  if (!rig) return '';
  return `<div class="optimizer-rig">
    <div class="optimizer-copy">
      <span class="rigdot green"></span>
      <div>
        <small>AUTO-FILL RIG</small>
        <strong>${escapeHtml(rig.name)}</strong>
        <p>The optimizer adds only as many QNs as needed.</p>
      </div>
    </div>
    <div class="optimizer-spec"><small>BASE /s</small><b>${compact(rig.rate)}</b></div>
    <div class="optimizer-spec"><small>SLOTS</small><b>${compact(rig.slots)}</b></div>
  </div>`;
}