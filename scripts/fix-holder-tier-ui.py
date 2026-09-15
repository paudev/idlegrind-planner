from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'missing expected text in {path}: {old!r}')
    p.write_text(text.replace(old, new, 1))

components = Path('src/app/ui/components.ts')
text = components.read_text()
anchor = "export function buffsUi(\n"
helper = "export function holderTierLabel(option: (typeof TIER_OPTIONS)[number]): string {\n  return `${option.label} ×${option.mult}${option.refinePct ? ` · REFINE -${option.refinePct}%` : ''}`;\n}\n\n"
if helper not in text:
    if anchor not in text:
        raise SystemExit('missing buffsUi anchor')
    text = text.replace(anchor, helper + anchor, 1)
old = "    `${tier.label} ×${tier.mult}${tier.refinePct ? ` · REFINE −${tier.refinePct}%` : ''}`,\n"
new = "    holderTierLabel(tier),\n"
if old not in text:
    raise SystemExit('missing tier label expression in components')
text = text.replace(old, new, 1)
components.write_text(text)

for path in ['src/app/views/target.ts', 'src/app/views/potential.ts']:
    p = Path(path)
    text = p.read_text()
    text = text.replace(
        "import { choiceRow, field, intro, metric, pageStack, panel } from '../ui/components';",
        "import { choiceRow, field, holderTierLabel, intro, metric, pageStack, panel } from '../ui/components';",
        1,
    ) if path.endswith('target.ts') else text.replace(
        "import { chip, choiceRow, field, intro, metric, pageStack, panel } from '../ui/components';",
        "import { chip, choiceRow, field, holderTierLabel, intro, metric, pageStack, panel } from '../ui/components';",
        1,
    )
    old_label = "    const label = option.refinePct ? `${option.label} · −${option.refinePct}% REFINE` : option.label;\n"
    if old_label not in text:
        raise SystemExit(f'missing holder tier label in {path}')
    text = text.replace(old_label, "    const label = holderTierLabel(option);\n", 1)
    if path.endswith('target.ts'):
        text = text.replace(
            "'Applies the holder-tier refinery discount to the current game rate. The tier hash multiplier is not applied here because this page solves for the final required production rate.',",
            "'Shows the full holder tier. Its refinery discount is applied here; the × hash multiplier is shown for reference only because this page solves for the final required production rate.',",
            1,
        )
    else:
        text = text.replace(
            "'This changes GRIT → $GRIND conversion only. Enter NORMAL GRIT / SECOND as your already-final normal production rate so the tier hash multiplier is not double-counted.',",
            "'Shows the full holder tier. Its refinery discount is applied here; enter your already-final NORMAL GRIT / SECOND so the × hash multiplier shown on the chip is not applied twice.',",
            1,
        )
    p.write_text(text)
