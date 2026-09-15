from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"pattern not found in {path}: {old[:120]!r}")
    text = text.replace(old, new, 1)
    p.write_text(text)

# The game's Mining Deck TOTAL excludes staking Node hash bonus. Keep the
# displayed buff multiplier identical to that semantic, while still applying
# Node hash to production math as its own hash-rate layer.
replace_once(
    'src/app/core/calculations.ts',
    "  const core = 1 + Math.max(0, number(buffs.corePct)) / 100;\n  const staking = stakingHashMultiplier(buffs.stakingNode);\n\n  return tier * coolant * prestige * frame * aura * core * staking;\n}\n",
    "  const core = 1 + Math.max(0, number(buffs.corePct)) / 100;\n\n  return tier * coolant * prestige * frame * aura * core;\n}\n\nexport function effectiveHashMultiplier(buffs: BuffState): number {\n  return multiplier(buffs) * stakingHashMultiplier(buffs.stakingNode);\n}\n",
)
replace_once(
    'src/app/core/calculations.ts',
    '  const buffMultiplier = multiplier(buffs);\n',
    '  const buffMultiplier = effectiveHashMultiplier(buffs);\n',
)
replace_once(
    'src/app/core/calculations.ts',
    '  const buildMultiplier = multiplier(buffs);\n',
    '  const buildMultiplier = effectiveHashMultiplier(buffs);\n',
)

# Planner direct hash calculations must still include Node hash even though the
# visible TOTAL BUFF MULTIPLIER does not.
replace_once(
    'src/app/views/planner.ts',
    '  coolantUpgradeCost,\n  multiplier,\n  productionWithDailyBoost,\n',
    '  coolantUpgradeCost,\n  effectiveHashMultiplier,\n  productionWithDailyBoost,\n',
)
replace_once(
    'src/app/views/planner.ts',
    '  const buildMultiplier = multiplier(store.state.planner.buffs);\n',
    '  const buildMultiplier = effectiveHashMultiplier(store.state.planner.buffs);\n',
)
replace_once(
    'src/app/views/planner.ts',
    '<span>Permanent hashpower multiplier</span>',
    '<span>Applied to hash rate, not TOTAL BUFF MULTIPLIER</span>',
)

# Match the game-facing TOTAL display precision, and make it clear that the
# Mining Deck rounds Core on its badge while TOTAL uses exact Core Power.
replace_once(
    'src/app/ui/components.ts',
    "    ${choiceRow('CORE', `<label class=\"mini-input\">POWER % <input data-custom-buff=\"${scope}:corePct\" data-num value=\"${inputText(buffs.corePct)}\"></label>`)}\n",
    "    ${choiceRow('CORE', `<label class=\"mini-input\">POWER % <input data-custom-buff=\"${scope}:corePct\" data-num value=\"${inputText(buffs.corePct)}\"></label>`, 'Use the exact Core Power from THE CORE (for example 1.60), not the rounded Mining Deck badge.')}\n",
)
replace_once(
    'src/app/ui/components.ts',
    "  return value.toFixed(3).replace(/0+$/, '').replace(/\\.$/, '');\n",
    "  return value.toFixed(2).replace(/0+$/, '').replace(/\\.$/, '');\n",
)
replace_once(
    'src/app/ui/components.ts',
    "      <span>Permanent production buffs combined${vial > 0 ? ' · vial multiplier shown separately.' : ' · temporary 2× boosts not included.'}</span>\n",
    "      <span>Matches the Mining Deck buff stack · Node hash bonus is applied to hash rate, not this total${vial > 0 ? ' · vial 2× shown separately.' : '.'}</span>\n",
)

# Keep the diagnostic breakdown consistent with the UI terminology.
replace_once(
    'src/app/ui/staking.ts',
    "    ['Core', 1 + Math.max(0, number(buffs.corePct)) / 100],\n    ['Node', 1 + stakingNode(buffs.stakingNode).hashPct / 100],\n",
    "    ['Core', 1 + Math.max(0, number(buffs.corePct)) / 100],\n",
)

# Update staking tests to lock in the distinction between buff multiplier and
# Node hash-rate bonus.
replace_once(
    'tests/staking.test.ts',
    "  fundingTimeline,\n  multiplier,\n  productionWithDailyBoost,\n  solveMinimumBuild,\n",
    "  effectiveHashMultiplier,\n  fundingTimeline,\n  multiplier,\n  productionWithDailyBoost,\n  rateFactory,\n  solveMinimumBuild,\n",
)
replace_once(
    'tests/staking.test.ts',
    "test('Node 4 hashpower compounds as its own multiplier layer', () => {\n  assert.equal(multiplier({ ...baseBuffs, stakingNode: 0 }), 1);\n  assert.ok(Math.abs(multiplier({ ...baseBuffs, stakingNode: 4 }) - 1.075) < 1e-12);\n\n  const stacked = multiplier({\n    ...baseBuffs,\n    tier: 1.4,\n    coolantLevel: 3,\n    stakingNode: 4,\n  });\n  assert.ok(Math.abs(stacked - 1.4 * 1.3 * 1.075) < 1e-12);\n});\n",
    "test('Node hash changes hash rate without changing the Mining Deck buff multiplier', () => {\n  const node4 = { ...baseBuffs, stakingNode: 4 } as BuffState;\n  assert.equal(multiplier({ ...baseBuffs, stakingNode: 0 }), 1);\n  assert.equal(multiplier(node4), 1);\n  assert.ok(Math.abs(effectiveHashMultiplier(node4) - 1.075) < 1e-12);\n  assert.ok(Math.abs(rateFactory([], node4, quantumNode)(1) - 1400 * 1.075) < 1e-12);\n\n  const stacked = {\n    ...baseBuffs,\n    tier: 1.4,\n    coolantLevel: 3,\n    stakingNode: 4,\n  } as BuffState;\n  assert.ok(Math.abs(multiplier(stacked) - 1.4 * 1.3) < 1e-12);\n  assert.ok(Math.abs(effectiveHashMultiplier(stacked) - 1.4 * 1.3 * 1.075) < 1e-12);\n});\n\ntest('exact Core Power reproduces the Mining Deck TOTAL before its rounded Core badge', () => {\n  const gameLikeBuffs: BuffState = {\n    ...baseBuffs,\n    tier: 1.6,\n    coolantLevel: 7,\n    prestigePct: 50,\n    bronze: true,\n    silver: true,\n    gold: true,\n    auraPct: 10,\n    corePct: 1.6,\n  };\n  assert.equal(multiplier(gameLikeBuffs).toFixed(2), '9.12');\n});\n",
)

print('patched multiplier semantics and Core precision guidance')
