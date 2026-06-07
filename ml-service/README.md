# Football AI — ML Service

Microservicio de Machine Learning para predicción de partidos de fútbol.

## Modelos

| Modelo | Target | Framework |
|--------|--------|-----------|
| XGBoost | 1X2 (resultado) | xgboost |
| LightGBM | Over/Under 2.5 | lightgbm |
| CatBoost | BTTS (ambos marcan) | catboost |
| Neural Network | 1X2 (resultado) | TensorFlow/Keras |

## Setup (Mac M4)

```bash
cd ml-service

# Crear entorno virtual
python3 -m venv venv
source venv/bin/activate

# Instalar dependencias
pip install -r requirements.txt

# Si TensorFlow da problemas en M4:
pip install tensorflow-macos tensorflow-metal
```

## Uso

### 1. Recolectar datos de entrenamiento

```bash
python collect_data.py --seasons 2023,2024,2025 --leagues 39,140,135,78,61
```

Esto descarga ~50,000 partidos de las principales ligas europeas.
Requiere API_FOOTBALL_KEY en `.env.local`.

### 2. Entrenar modelos

```bash
python train_model.py
```

Si no hay datos reales, genera 10,000 muestras sintéticas para entrenar.
Los modelos se guardan en `models/`.

### 3. Iniciar servidor de predicción

```bash
uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

O simplemente:
```bash
python server.py
```

### 4. Verificar

```bash
curl http://localhost:8000/health
```

## Endpoints

### GET /health
Estado del servicio y modelos cargados.

### POST /predict
Recibe estadísticas de equipos, devuelve predicciones.

```json
{
  "home_stats": { ... },
  "away_stats": { ... }
}
```

Respuesta:
```json
{
  "probabilities": { "HOME_WIN": 45.2, "DRAW": 28.1, "AWAY_WIN": 26.7 },
  "over_25": { "over": 62.3, "under": 37.7 },
  "btts": { "yes": 55.8, "no": 44.2 },
  "confidence": 78.5,
  "models_used": ["xgboost", "lightgbm", "catboost", "neural_net"],
  "feature_importance": { "home_goals_per_game": 0.12, ... }
}
```

## Modelos extendidos (Prophet, MLflow, Qiskit, …)

Además de `/predict`, el servicio expone modelos avanzados con **librerías Python reales**:

| Modelo | Librería |
|--------|----------|
| Prophet | `prophet` |
| ARIMA | `statsmodels` |
| TFT / N-BEATS | `torch` |
| Drift / calidad | `evidently` + validación schema |
| Experimentos | `mlflow` (tracking en `mlruns/`) |
| Poisson bivariante | `scipy` |
| GNN | `networkx` |
| Causal | `dowhy` |
| Supervivencia | `lifelines` |
| QAOA / VQE | `qiskit` / `pennylane` (opcional) |

### Instalación extendida

```bash
cd ml-service
source venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-extended.txt   # Qiskit, PennyLane, DoWhy, etc.
```

### Endpoints

#### GET /libraries
Lista qué librerías extendidas están instaladas.

#### POST /predict/extended
Ejecuta Prophet, ARIMA, MLflow, Evidently, survival, QAOA, etc. sobre un fixture.

```json
{
  "home_stats": { ... },
  "away_stats": { ... },
  "fixture": { "id": "...", "home": { ... }, "away": { ... } },
  "base_probabilities": { "HOME_WIN": 42, "DRAW": 28, "AWAY_WIN": 30 },
  "value_edges": [3.2, 0, 1.1]
}
```

La app Next.js llama a este endpoint en cada análisis cuando `ML_SERVICE_URL` responde.
Si el servicio está apagado, se usan los fallbacks TypeScript ya existentes.

## Integración con Next.js (arranque automático)

Al analizar un partido (`GET /api/analyze/:id`), la app **intenta levantar ml-service sola** si:

- `ML_SERVICE_URL` apunta a `localhost` / `127.0.0.1`
- `ML_SERVICE_AUTO_START` no es `"false"` (activo por defecto en desarrollo)

Si no existe `ml-service/venv`, con `ML_SERVICE_BOOTSTRAP=true` crea el venv e instala
`requirements-minimal.txt` la primera vez (~1–3 min). Luego ejecuta uvicorn en el puerto 8000.

Variables en `.env.local`:

```
ML_SERVICE_URL=http://localhost:8000
ML_SERVICE_AUTO_START=true
ML_SERVICE_BOOTSTRAP=true
```

Comprobar estado: `GET /api/ml/status` o `curl http://localhost:8000/health`.

### Arranque manual (opcional)

```bash
cd ml-service
source venv/bin/activate
uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

Con Docker Compose, el servicio `ml-service` ya corre en el puerto 8000 (`ML_SERVICE_AUTO_START=false` en la app).
