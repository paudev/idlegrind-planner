# IDLE//GRIND Planner

A client-side TypeScript planner for IDLE//GRIND mining, build, cashout, and cost planning.

## Product modules

- **Target Rate** — convert a `$GRIND / 24H` target into the required GRIT/s rate.
- **Potential Earning** — project production until the player's next rolling cashout eligibility and show a full 24H benchmark.
- **Deck Simulator** — model the current deck, simulated QN/vial changes, funding-aware output, costing, and QN readiness timing.
- **Build Planner** — plan a build from scratch or the next upgrade, solve the minimum QNs required, estimate build-ready time, and show final performance.
- **Costing** — interactive coolant, rack-slot expansion, and forge price references.
- **Settings** — economy, cashout timing, rig presets, market references, and local data controls.

## Cashout model

Cashout eligibility is personal, not a server reset. The planner stores the last withdrawal as an absolute timestamp and calculates:

`next cashout = last withdrawal + exactly 24 elapsed hours`

The current browser/device timezone is used only for display and manual timestamp entry. Changing timezone or traveling does not change the underlying eligibility time.

## QN funding model

Quantum Nodes are funded sequentially. When a QN becomes affordable, the planner purchases it immediately, subtracts its GRIT cost, increases the QN count, recalculates the mining rate, and uses that higher rate to fund the next QN.

The current planner assumption for QN pricing is:

`2,800,000 GRIT × 1.15^owned`

This growth rule is an observed planner assumption, not a formula confirmed in the game frontend source.

## Source architecture

Application code is split by responsibility under `src/app/` and is fully TypeScript:

```text
src/app/
├── app.ts                 # application bootstrap + typed event routing
├── types.ts               # shared domain and application types
├── config/
│   ├── economy.ts         # price tables, storage keys, economy constants
│   └── game.ts            # rig presets and selectable buff options
├── core/
│   ├── calculations.ts    # production, QN funding, rack/coolant math
│   ├── cashout.ts         # rolling 24-hour cashout state and timezone display
│   ├── format.ts          # number, duration, input and display formatting
│   ├── state.ts           # central application state and domain mutations
│   └── storage.ts         # typed localStorage persistence and migrations
├── ui/
│   ├── components.ts      # reusable HTML components
│   └── shell.ts           # top navigation, cashout header and application shell
├── views/
│   ├── target.ts
│   ├── potential.ts
│   ├── deck.ts
│   ├── planner.ts
│   ├── costing.ts
│   └── settings.ts
└── styles/
    ├── index.css          # explicit cascade order
    ├── section-layout.css # semantic spacing/sizing and responsive structure
    └── *.css              # established visual modules
```

There are no JavaScript runtime source files. Vite compiles the TypeScript entrypoint directly.

The visual refactor keeps the established typography and IDLE//GRIND styling while enforcing uniform section gaps, card/input sizing, safe wrapping, and responsive mobile layouts.

Existing localStorage keys are preserved so saved planner values remain compatible across the refactor.

## Validation

Strict TypeScript checking is enabled in `tsconfig.json`.

```bash
npm run typecheck
npm run build
```

`npm run build` runs `tsc --noEmit` before Vite. GitHub Actions runs the same build check for pushes and pull requests to `main`.

## Development

```bash
npm install
npm run dev
```

## Vercel

Import the repository into Vercel. Vercel detects Vite automatically; no server or environment variables are required.

## Notes

Game balance values can change. Editable economy, rig, and current market-reference values are persisted locally in the browser.
