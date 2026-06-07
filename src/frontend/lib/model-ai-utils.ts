import type { AnalysisResult } from "@/shared/domain";

export type ModelInventoryState = "real" | "ml" | "partial" | "planned" | "blocked";

export type ModelInventoryItem = {
  name: string;
  state: ModelInventoryState;
  label: string;
  desc: string;
};

export const MODEL_INVENTORY: ModelInventoryItem[] = [
  { name: "Poisson + Dixon-Coles", state: "real", label: "Real", desc: "Base 1X2, totals y scorelines con corrección explícita para marcadores bajos." },
  { name: "Ensemble Poisson + NegBinom + ELO + Forma", state: "real", label: "Real", desc: "Ponderación dinámica por cobertura, liga, forma y riesgo." },
  { name: "Binomial Negativa", state: "real", label: "Real", desc: "Sobredispersión para partidos volátiles o divisiones bajas." },
  { name: "Skellam Distribution", state: "real", label: "Real", desc: "Diferencia de goles para handicaps y margen esperado." },
  { name: "Zero-Inflated Poisson", state: "real", label: "Real", desc: "Ajuste para defensas fuertes y exceso de marcadores bajos." },
  { name: "Kelly fraccional", state: "real", label: "Real", desc: "Stake por edge, cuota, confianza y exposición máxima." },
  { name: "Expected Threat / Radar", state: "real", label: "Real", desc: "Dominancia territorial aproximada con datos disponibles." },
  { name: "Kalman Filter", state: "real", label: "Real", desc: "Suavizado de señal/ruido en fuerza ofensiva y defensiva." },
  { name: "Hawkes Process", state: "real", label: "Real", desc: "Momentum y clustering de eventos cuando hay datos live." },
  { name: "Bayesian Updating", state: "real", label: "Real", desc: "Actualización probabilística para contexto en vivo." },
  { name: "Monte Carlo híbrido", state: "real", label: "Real", desc: "50k iteraciones por defecto con mezcla Poisson / cola pesada." },
  { name: "CatBoost / XGBoost / LightGBM", state: "ml", label: "ML opcional", desc: "Pipeline Python listo; requiere dataset suficiente en TrainingData." },
  { name: "SHAP", state: "ml", label: "ML opcional", desc: "Se genera cuando CatBoost entrenado está disponible." },
  { name: "Optuna", state: "ml", label: "ML opcional", desc: "Ajusta hiperparámetros si hay suficientes muestras." },
  { name: "Bivariate Poisson correlacionado", state: "real", label: "Real", desc: "Covarianza κ entre goles local/visita (Karlis-Dimitris)." },
  { name: "Blended temporal 70/30 configurable", state: "real", label: "Real", desc: "Mezcla 70% forma reciente + 30% temporada en xG y 1X2." },
  { name: "Great Expectations / Evidently / MLflow", state: "ml", label: "Python ML", desc: "Validación, drift (Evidently) y runs (MLflow) vía ml-service en :8000." },
  { name: "Prophet, ARIMA, TFT, N-BEATS", state: "ml", label: "Python ML", desc: "Prophet + statsmodels ARIMA + torch TFT/N-BEATS en ml-service; fallback TS offline." },
  { name: "GNN, CausalNex, DoWhy, Survival", state: "ml", label: "Python ML", desc: "NetworkX, DoWhy y lifelines en ml-service cuando está activo." },
  { name: "Qiskit, PennyLane, D-Wave, QAOA/VQE", state: "ml", label: "Python ML", desc: "QAOA (Qiskit) o VQE (PennyLane) en requirements-extended.txt." },
  { name: "SARIMA (statsmodels)", state: "real", label: "Real", desc: "Componente estacional en serie temporal; Python o proxy TS." },
  { name: "Predicción primer tiempo (HT)", state: "real", label: "Real", desc: "1X2 HT, goles esperados HT y Over 0.5 HT en análisis avanzado." },
  { name: "Corners / ESP", state: "real", label: "Real", desc: "Córners esperados por equipo y probabilidad Over 9.5." },
  { name: "Riesgo de tarjetas", state: "real", label: "Real", desc: "Índice de amarillas/rojas y flag de partido caliente." },
  { name: "xG blend dedicado", state: "real", label: "Real", desc: "xG ajustado por forma y BTTS derivado del blend." },
  { name: "LIME / drivers locales", state: "real", label: "Real", desc: "Top drivers de features en pestaña Avanzado; LIME si está instalado." },
  { name: "Random Forest + Voting", state: "ml", label: "ML opcional", desc: "Entrena con train_model.py; ensemble voting con XGBoost." },
  { name: "Feature engineering (rolling)", state: "real", label: "Real", desc: "Medias/std rolling en features.py + score TSFresh proxy." },
];

export const MODEL_STATE_CLASS: Record<ModelInventoryState, string> = {
  real: "active",
  ml: "ml",
  partial: "partial",
  planned: "planned",
  blocked: "blocked",
};

export function sortValueTable(analysis: AnalysisResult, minEdge = 0) {
  return analysis.valueTable
    .filter((row) => row.edge >= minEdge)
    .slice()
    .sort((a, b) => b.edge - a.edge);
}

export function agreementTone(agreement: number): "high" | "medium" | "low" {
  if (agreement >= 75) return "high";
  if (agreement >= 55) return "medium";
  return "low";
}
