# Engine Roadmap — Closing the Predict→Outcome→Recalibrate Loop

**Status:** in progress · **Owner:** miguel · **Started:** 2026-05-04

## Why this exists
Audit on 2026-05-03 confirmed the analysis stack is statistically sound (Poisson + xG + penalty system) but **open-loop**: predictions are stored, never resolved against real outcomes, never fed back into model calibration. Two engines (`analysis-engine.ts`, `deep-analysis-engine.ts`) duplicate stake/confidence logic. Alerts of type `ODD_MOVEMENT` simulate movement with `Math.random()`. This document drives the work to close the loop.

## Success criteria (per phase)

### Phase 1 — Correctness & consolidation
- [ ] `ODD_MOVEMENT` alerts no longer use `Math.random()`. Either backed by real odds history, or feature-flagged off with explicit user-visible state.
- [ ] `Alert.lastTriggered` is honored: an alert fires at most once per cooldown window per evaluation cycle.
- [ ] A single `risk-policy.ts` module owns the formula `confidence → stakeUnits`. Both engines import it. No duplicated thresholds.
- [ ] `npm run typecheck` and `npm test` green.

### Phase 2 — Outcome closure
- [ ] Job/endpoint resolves `Prediction` records when their fixture reaches `FINISHED`. Sets `status` (WON/LOST/VOID), `roi`, `resultDate`.
- [ ] Idempotent: re-running does not double-credit ROI.
- [ ] At least one market resolver (1X2) implemented end-to-end with tests; others stubbed with clear TODO.

### Phase 3 — Recalibration scaffolding
- [ ] Read-only `/api/performance` endpoint returns hit-rate, ROI, sample size, and Brier score grouped by `market` and `league`.
- [ ] No automatic weight changes yet — surface the data first, decide on the calibration strategy with real numbers in hand.

## Non-goals (this iteration)
- LLM-driven analysis (deep engine is pure math by design — keep it that way unless a separate decision says otherwise).
- Live odds-feed integration with a paid provider. We design for it; we do not contract it here.
- Auto-tuning penalty weights. Phase 3 only *measures*; the next iteration decides how to *adjust*.

## Risk register
| Risk | Mitigation |
|---|---|
| `ODD_MOVEMENT` users lose a feature when we cut the random simulator | Document clearly in changelog + UI. Better no feature than a lying one. |
| Outcome resolver misclassifies an edge case (extra time, abandoned match) | Default to `VOID` when ambiguous; never auto-credit. |
| Performance endpoint leaks user data across accounts | Reuse existing auth/scoping pattern; tests assert isolation. |

## Architecture decisions
- **Risk policy as data, not code.** The thresholds (`>=70 → 1u`, etc.) live in a const object so they can be tested and later loaded from config without a refactor.
- **Outcome closure as a function, not a cron.** Phase 2 ships the pure resolver + an admin endpoint that calls it. Wiring to a scheduler is environment-specific and out of scope.
- **Performance metrics computed on-demand.** No materialized aggregates yet — premature until we know the access patterns.

## Decision log
- 2026-05-04 — Chose to feature-flag `ODD_MOVEMENT` rather than synthesize movement from market drift. Reason: a synthesized signal is indistinguishable from a real one downstream and would corrupt any future calibration analysis.
