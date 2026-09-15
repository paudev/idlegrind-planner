from pathlib import Path

path = Path('src/app/views/deck.ts')
text = path.read_text()
replacements = {
    "  const hasProjectionWindow = configured && (scenario.cashoutLeft ?? 0) > 0;\n": "",
    "Set a cashout time to see funding-aware output and how many simulated QNs become active before cashout.": "Set a cashout time to see projected $GRIND and how many simulated QNs are active by then.",
    "Funding-aware projection starts with ${compact(scenario.currentGrit)} GRIT, buys the simulated ${scenario.addedQns} QNs sequentially, applies the selected initial temporary boost window, and repeats the daily Node boost every 24 hours.": "Cashout projection starts with ${compact(scenario.currentGrit)} GRIT, buys the simulated ${scenario.addedQns} QNs sequentially, applies the selected initial temporary boost window, and repeats the daily Node boost every 24 hours.",
    "Start with your current deck, optionally change the staking Node, add Quantum Nodes and/or vial time, then compare sustainable, boosted, and funding-aware output.": "Start with your current deck, optionally change the staking Node, add Quantum Nodes and/or vial time, then compare sustainable output, temporary boosts, and next-cashout results.",
}
for old, new in replacements.items():
    if old not in text:
        raise SystemExit(f'missing replacement target: {old[:70]}')
    text = text.replace(old, new, 1)
path.write_text(text)
