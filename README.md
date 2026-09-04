# IDLE//GRIND Planner

A client-side TypeScript planner for IDLE//GRIND mining, build, cashout, and cost planning.

## Product modules

- **Target Rate** — convert a `$GRIND / 24H` target into the required GRIT/s rate.
- **Potential Earning** — project production until the player's next rolling cashout eligibility and show a full 24H benchmark.
- **Deck Simulator** — model the current deck, simulated QN/vial changes, funding-aware output, costing, and QN readiness timing.
- **Build Planner** — plan from 0 QNs / 0 GRIT, solve the minimum QNs needed for a rate target at build readiness, estimate build-ready time, and show a separate completed-build 24H benchmark.
- **Costing** — interactive coolant, rack-slot expansion, and forge price references.
- **Settings** — economy, cashout timing, rig presets, marketplace references, and local data controls.

## Cashout model

Cashout eligibility is personal, not a server reset. The planner stores the last withdrawal as an absolute timestamp and calculates:

`next cashout = last withdrawal + exactly 24 elapsed hours`

The current browser/device timezone is used only for display and manual timestamp entry. Changing timezone or traveling does not change the underlying eligibility time.

## QN funding model

Quantum Nodes are funded sequentially. When a QN becomes affordable, the planner purchases it immediately, subtracts its GRIT cost, increases the QN count, recalculates the mining rate, and uses that higher rate to fund the next QN.

The default planner assumption for QN pricing is:

`2,800,000 GRIT × 1.15^owned`

Both the base price and growth multiplier are editable under **Settings → Economy**, and the selected values are used consistently by Deck Simulator, Build Planner, costing, and readiness calculations. The 2.8M / 1.15 defaults remain an observed planner assumption, not a formula confirmed in the game frontend source.

## Build Planner target model

The Build Planner target is a **rate-equivalent** target. The entered `$GRIND / 24H` value is converted into the GRIT/s rate the build should reach when it becomes ready.

A selected vial affects two separate things:

- it accelerates GRIT generation while QNs are being funded;
- it can reduce the minimum QN count only when the vial is still active when the minimum build becomes ready.

This means a 3H and 24H vial produce the same minimum QNs and setup time when the selected minimum build is already ready before the 3H vial expires. Extending the vial beyond readiness does not reduce that minimum further.

The completed-build **24H benchmark** is displayed separately. It uses the selected vial duration across the benchmark window and should not be confused with the rate-at-readiness solver.

## Economy references

- Coolant Level 1 costs 12,000 `$GRIND`; each following level doubles the previous level price.
- Bronze, Silver, and Gold Frame marketplace prices are editable under Settings.
- Default frame references are Bronze 1.25M, Silver 2.5M, and Gold 5M `$GRIND`.
- QDC defaults to 4.7M `$GRIND`; marketplace references remain editable.
- Rack capacity starts at 12 slots and expands in +6-slot packs.

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
│   ├── calculations.ts    # production, planner solver, QN funding, rack/coolant math
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
    └── *.css              # established visual modules
```

There are no JavaScript runtime source files. Vite compiles the TypeScript entrypoint directly.

## Validation

Strict TypeScript checking is enabled in `tsconfig.json`. Core calculation regression tests cover production windows, default and custom QN pricing, sequential funding across overclock expiry, coolant doubling, rack expansion, integer rig handling, and the Build Planner's 3H-vs-24H minimum-build invariant.

```bash
npm run typecheck
npm test
npm run build
```

`npm run build` runs both strict TypeScript checking and the calculation regression tests before Vite builds the application. No GitHub Actions workflow is required.

## Development

```bash
npm install
npm run dev
```

TypeScript and Vite versions are pinned exactly in `package.json` so installs do not drift across compatible minor versions.

## Vercel

Import the repository into Vercel. Vercel detects Vite automatically; no server or environment variables are required. Repository-triggered deployment is disabled in `vercel.json` so deployments can be controlled manually.

## Notes

Game balance values can change. Editable economy, rig, frame, vial, and current marketplace-reference values are persisted locally in the browser.
