from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'missing expected block: {label}')
    return text.replace(old, new, 1)

# Shared holder-tier rendering.
components_path = Path('src/app/ui/components.ts')
components = components_path.read_text()
components = replace_once(
    components,
    """export function holderTierLabel(option: (typeof TIER_OPTIONS)[number]): string {\n  return `${option.label} ×${option.mult}${option.refinePct ? ` · REFINE -${option.refinePct}%` : ''}`;\n}\n""",
    """export function holderTierChipContent(option: (typeof TIER_OPTIONS)[number]): string {\n  return `<span class=\"holder-tier-name\">${option.label}</span>\n    <span class=\"holder-tier-stats\">\n      <b>HASH ×${option.mult}</b>\n      <em>${option.refinePct ? `REFINE −${option.refinePct}%` : 'REFINE —'}</em>\n    </span>`;\n}\n\nexport function holderTierRow(body: string, hint = ''): string {\n  return `<div class=\"holder-tier-row\">\n    <div class=\"holder-tier-row-head\">\n      <b>HOLDER TIER</b>\n      ${hint ? `<small>${hint}</small>` : ''}\n    </div>\n    <div class=\"holder-tier-grid\">${body}</div>\n  </div>`;\n}\n""",
    'holder tier helpers',
)
components = replace_once(
    components,
    """  const tiers = TIER_OPTIONS.map((tier) => chip(\n    holderTierLabel(tier),\n    buffs.tier === tier.mult,\n    `data-buff=\"${scope}:tier:${tier.mult}\"`,\n    tier.mult >= 1.6 ? 'gold' : '',\n  )).join('');\n""",
    """  const tiers = TIER_OPTIONS.map((tier) => `<button type=\"button\" class=\"holder-tier-card ${buffs.tier === tier.mult ? 'active' : ''}\" data-buff=\"${scope}:tier:${tier.mult}\">\n    ${holderTierChipContent(tier)}\n  </button>`).join('');\n""",
    'buff tier cards',
)
components = replace_once(
    components,
    """    ${choiceRow('TIER', tiers, 'Operator+ also reduces GRIT required per $GRIND.')}\n""",
    """    ${holderTierRow(tiers, 'Hash multiplier affects production. Operator+ also lowers GRIT required per $GRIND.')}\n""",
    'buff tier row',
)
components_path.write_text(components)

# Target Rate page.
target_path = Path('src/app/views/target.ts')
target = target_path.read_text()
target = replace_once(
    target,
    "import { choiceRow, field, holderTierLabel, intro, metric, pageStack, panel } from '../ui/components';",
    "import { field, holderTierChipContent, holderTierRow, intro, metric, pageStack, panel } from '../ui/components';",
    'target imports',
)
target = replace_once(
    target,
    """  const tierChoices = TIER_OPTIONS.map((option) => {\n    const label = holderTierLabel(option);\n    return `<label class=\"chip ${Math.abs(tier - option.mult) < 1e-9 ? 'active' : ''}\">\n      <input type=\"radio\" hidden name=\"target-holder-tier\" data-path=\"state.target.tier\" value=\"${option.mult}\" ${Math.abs(tier - option.mult) < 1e-9 ? 'checked' : ''}>\n      ${label}\n    </label>`;\n  }).join('');\n""",
    """  const tierChoices = TIER_OPTIONS.map((option) => `<label class=\"holder-tier-card ${Math.abs(tier - option.mult) < 1e-9 ? 'active' : ''}\">\n    <input type=\"radio\" hidden name=\"target-holder-tier\" data-path=\"state.target.tier\" value=\"${option.mult}\" ${Math.abs(tier - option.mult) < 1e-9 ? 'checked' : ''}>\n    ${holderTierChipContent(option)}\n  </label>`).join('');\n""",
    'target tier choices',
)
target = replace_once(
    target,
    """      ${choiceRow(\n        'HOLDER TIER',\n        tierChoices,\n        'Shows the full holder tier. Its refinery discount is applied here; the × hash multiplier is shown for reference only because this page solves for the final required production rate.',\n      )}\n""",
    """      ${holderTierRow(\n        tierChoices,\n        'Refine affects this page. Hash is shown for reference because this page solves for the final required rate.',\n      )}\n""",
    'target tier row',
)
target_path.write_text(target)

# Potential Earning page.
potential_path = Path('src/app/views/potential.ts')
potential = potential_path.read_text()
potential = replace_once(
    potential,
    "import { chip, choiceRow, field, holderTierLabel, intro, metric, pageStack, panel } from '../ui/components';",
    "import { chip, choiceRow, field, holderTierChipContent, holderTierRow, intro, metric, pageStack, panel } from '../ui/components';",
    'potential imports',
)
potential = replace_once(
    potential,
    """  const tierChoices = TIER_OPTIONS.map((option) => {\n    const label = holderTierLabel(option);\n    return `<label class=\"chip ${Math.abs(tier - option.mult) < 1e-9 ? 'active' : ''}\">\n      <input type=\"radio\" hidden name=\"potential-holder-tier\" data-path=\"state.reset.tier\" value=\"${option.mult}\" ${Math.abs(tier - option.mult) < 1e-9 ? 'checked' : ''}>\n      ${label}\n    </label>`;\n  }).join('');\n""",
    """  const tierChoices = TIER_OPTIONS.map((option) => `<label class=\"holder-tier-card ${Math.abs(tier - option.mult) < 1e-9 ? 'active' : ''}\">\n    <input type=\"radio\" hidden name=\"potential-holder-tier\" data-path=\"state.reset.tier\" value=\"${option.mult}\" ${Math.abs(tier - option.mult) < 1e-9 ? 'checked' : ''}>\n    ${holderTierChipContent(option)}\n  </label>`).join('');\n""",
    'potential tier choices',
)
potential = replace_once(
    potential,
    """        ${choiceRow(\n          'HOLDER TIER',\n          tierChoices,\n          'Shows the full holder tier. Its refinery discount is applied here; enter your already-final NORMAL GRIT / SECOND so the × hash multiplier shown on the chip is not applied twice.',\n        )}\n""",
    """        ${holderTierRow(\n          tierChoices,\n          'Refine affects conversion. Enter an already-final normal rate, so hash is shown for reference only.',\n        )}\n""",
    'potential tier row',
)
potential_path.write_text(potential)

# Dedicated holder-tier layout so the seven options never fight the generic two-column buff row.
css_path = Path('src/app/styles/holder-tier.css')
css_path.write_text(""".holder-tier-row{\n  padding:14px 0 15px;\n  border-bottom:1px solid #1e2720;\n}\n.holder-tier-row-head{\n  display:flex;\n  align-items:baseline;\n  justify-content:space-between;\n  gap:18px;\n  margin-bottom:10px;\n}\n.holder-tier-row-head>b{\n  color:#a6b1a8;\n  font-size:12px;\n  letter-spacing:.09em;\n}\n.holder-tier-row-head>small{\n  color:#68746b;\n  font-size:10.5px;\n  line-height:1.4;\n  text-align:right;\n}\n.holder-tier-grid{\n  display:grid;\n  grid-template-columns:repeat(7,minmax(0,1fr));\n  gap:7px;\n}\n.holder-tier-card{\n  min-width:0;\n  min-height:66px;\n  padding:9px 10px;\n  border:1px solid #334038;\n  border-radius:6px;\n  background:#0b100c;\n  color:#9ca79e;\n  display:flex;\n  flex-direction:column;\n  align-items:flex-start;\n  justify-content:center;\n  gap:5px;\n  cursor:pointer;\n  text-align:left;\n}\nbutton.holder-tier-card{font:inherit}\n.holder-tier-card:hover{\n  border-color:#46564b;\n  filter:brightness(1.08);\n}\n.holder-tier-card.active{\n  border-color:#367354;\n  background:rgba(20,241,149,.085);\n  box-shadow:inset 0 0 14px rgba(20,241,149,.025);\n}\n.holder-tier-name{\n  color:#c3cdc5;\n  font-size:11.5px;\n  font-weight:950;\n  letter-spacing:.035em;\n  white-space:nowrap;\n}\n.holder-tier-card.active .holder-tier-name{color:var(--green)}\n.holder-tier-stats{\n  width:100%;\n  display:flex;\n  flex-direction:column;\n  gap:2px;\n  font-size:9.5px;\n  line-height:1.2;\n  letter-spacing:.045em;\n}\n.holder-tier-stats b{\n  color:#8ea097;\n  font-weight:850;\n}\n.holder-tier-stats em{\n  color:#7e897f;\n  font-style:normal;\n  font-weight:800;\n}\n.holder-tier-card.active .holder-tier-stats b{color:#bfe9d2}\n.holder-tier-card.active .holder-tier-stats em{color:#a5bbae}\n.input-section>.holder-tier-row{margin-top:4px}\n@media(max-width:1080px){\n  .holder-tier-grid{grid-template-columns:repeat(4,minmax(0,1fr))}\n}\n@media(max-width:700px){\n  .holder-tier-row-head{align-items:flex-start;flex-direction:column;gap:4px}\n  .holder-tier-row-head>small{text-align:left}\n  .holder-tier-grid{grid-template-columns:repeat(2,minmax(0,1fr))}\n}\n@media(max-width:420px){\n  .holder-tier-grid{grid-template-columns:1fr}\n}\n""")

index_path = Path('src/app/styles/index.css')
index = index_path.read_text()
if "@import './holder-tier.css';" not in index:
    index += "@import './holder-tier.css';\n"
index_path.write_text(index)
