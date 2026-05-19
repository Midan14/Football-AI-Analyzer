/**
 * Football AI Analyzer — Prediction Models
 *
 * Complete model suite:
 * 1. Poisson Bivariado (shared-math.ts) — Base probability model
 * 2. Negative Binomial — High-variance matches (overdispersion)
 * 3. ELO Rating — Dynamic team strength
 * 4. Ensemble — Weighted combination of all models
 * 5. Kelly Criterion — Optimal stake sizing
 * 6. Skellam Distribution — Goal difference / Asian Handicaps
 * 7. Zero-Inflated Poisson (ZIP) — Defensive matches / 0-0 prediction
 * 8. Hawkes Process — In-match momentum / goal clustering
 * 9. Bayesian Updating — Live probability adjustment
 * 10. Kalman Filter — Signal/noise separation for team strength
 * 11. Expected Threat (xT) — Territorial dominance approximation
 *
 * Plus from deep-analysis-engine.ts:
 * 12. Monte Carlo Simulation (1000 iterations)
 * 13. t-Student Heavy Tail (Black Swan events)
 * 14. Game Theory (Nash Equilibrium)
 * 15. Psychological Analysis (Choking, Motivation)
 * 16. Referee Profiling
 */

export { negBinomModel, type NegBinomResult } from "./negative-binomial";
export { eloModel, type EloResult } from "./elo-rating";
export { ensembleModel, type EnsembleResult } from "./ensemble";
export { kellyStake, kellyPortfolio, type KellyResult, type KellyPortfolio } from "./kelly-criterion";
export { skellamModel, type SkellamResult } from "./skellam";
export { zipModel, type ZIPResult } from "./zero-inflated-poisson";
export { hawkesModel, type HawkesResult } from "./hawkes-process";
export { bayesianUpdate, type BayesianResult } from "./bayesian-updater";
export { kalmanFilter, type KalmanResult } from "./kalman-filter";
export { expectedThreatModel, type ExpectedThreatResult } from "./expected-threat";
