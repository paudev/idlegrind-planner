from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'missing target: {label}')
    return text.replace(old, new, 1)

# Reuse one multiplier summary everywhere so planner and simulator stay consistent.
components_path = Path('src/app/ui/components.ts')
components = components_path.read_text()
old_summary = """  const totalMultiplier = multiplier(buffs);\n  const totalMultiplierText = totalMultiplier.toFixed(3).replace(/0+$/, '').replace(/\\.$/, '');\n  html += `<div class=\"buff-total-multiplier\">\n    <div>\n      <small>TOTAL BUFF MULTIPLIER</small>\n      <span>Permanent production buffs combined · temporary 2× boosts not included.</span>\n    </div>\n    <strong>×${totalMultiplierText}</strong>\n  </div>`;\n\n  return `${html}</div>`;\n}\n"""
new_summary = """  html += buffMultiplierSummary(buffs, vialHours);\n\n  return `${html}</div>`;\n}\n\nfunction multiplierText(value: number): string {\n  return value.toFixed(3).replace(/0+$/, '').replace(/\\.$/, '');\n}\n\nexport function buffMultiplierSummary(\n  buffs: BuffState,\n  vialHours = 0,\n  label = 'TOTAL BUFF MULTIPLIER',\n): string {\n  const permanent = multiplier(buffs);\n  const vial = Math.max(0, number(vialHours));\n  return `<div class=\"buff-total-multiplier\">\n    <div class=\"buff-total-copy\">\n      <small>${label}</small>\n      <span>Permanent production buffs combined${vial > 0 ? ' · vial multiplier shown separately.' : ' · temporary 2× boosts not included.'}</span>\n    </div>\n    <div class=\"buff-total-values\">\n      <div><em>PERMANENT</em><strong>×${multiplierText(permanent)}</strong></div>\n      ${vial > 0 ? `<div class=\"vial\"><em>WITH ${vial}H VIAL</em><strong>×${multiplierText(permanent * 2)}</strong></div>` : ''}\n    </div>\n  </div>`;\n}\n"""
components = replace_once(components, old_summary, new_summary, 'shared buff multiplier summary')
components_path.write_text(components)

# Simulator: show the effective simulated multiplier beside the vial controls.
deck_path = Path('src/app/views/deck.ts')
deck = deck_path.read_text()
deck = replace_once(
    deck,
    """  buffsUi,\n  chip,""",
    """  buffMultiplierSummary,\n  buffsUi,\n  chip,""",
    'deck component import',
)
deck = replace_once(
    deck,
    """    ${choiceRow('ADD VIAL', vialButtons, 'Extra one-time 2× time. Daily Node boost remains a separate recurring perk.')}\n    ${choiceRow('COSTING', vialCostControl, hasSelectedVial ? `Optional vial purchase cost · ${store.deck.vialHours}H market reference.` : 'Select a vial to enable acquisition costing.')}`,""",
    """    ${choiceRow('ADD VIAL', vialButtons, 'Extra one-time 2× time. Daily Node boost remains a separate recurring perk.')}\n    ${buffMultiplierSummary(scenario.simulatedBuffs, store.deck.vialHours, 'SIMULATED MULTIPLIER')}\n    ${choiceRow('COSTING', vialCostControl, hasSelectedVial ? `Optional vial purchase cost · ${store.deck.vialHours}H market reference.` : 'Select a vial to enable acquisition costing.')}`,""",
    'simulator vial multiplier summary',
)
deck_path.write_text(deck)

# Layout for permanent vs vial-active values.
css_path = Path('src/app/styles/presentation-fixes.css')
css = css_path.read_text()
css = replace_once(
    css,
    """.buff-total-multiplier strong {\n  flex: none;\n  color: var(--green);\n  font-size: 24px;\n  line-height: 1;\n}\n""",
    """.buff-total-values {\n  display: flex;\n  align-items: center;\n  justify-content: flex-end;\n  gap: 18px;\n  flex-wrap: wrap;\n}\n\n.buff-total-values > div {\n  min-width: 92px;\n  text-align: right;\n}\n\n.buff-total-values em {\n  display: block;\n  margin-bottom: 4px;\n  color: #6f7c72;\n  font-size: 8px;\n  font-style: normal;\n  font-weight: 900;\n  letter-spacing: .08em;\n}\n\n.buff-total-multiplier strong {\n  display: block;\n  color: var(--green);\n  font-size: 24px;\n  line-height: 1;\n}\n\n.buff-total-values .vial em,\n.buff-total-values .vial strong {\n  color: var(--orange);\n}\n""",
    'multiplier value layout',
)
css = replace_once(
    css,
    """  .buff-total-multiplier {\n    align-items: flex-start;\n  }\n\n  .buff-total-multiplier strong {\n    font-size: 21px;\n  }\n""",
    """  .buff-total-multiplier {\n    align-items: flex-start;\n    flex-direction: column;\n  }\n\n  .buff-total-values {\n    width: 100%;\n    justify-content: flex-start;\n  }\n\n  .buff-total-values > div {\n    text-align: left;\n  }\n\n  .buff-total-multiplier strong {\n    font-size: 21px;\n  }\n""",
    'mobile multiplier layout',
)
css_path.write_text(css)
