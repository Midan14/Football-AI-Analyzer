"""
Model Training Script — Trains XGBoost, LightGBM, CatBoost, and Neural Network.
Produces ensemble predictions for football match outcomes.

Usage:
    python train_model.py

Outputs:
    models/xgboost_1x2.joblib
    models/lightgbm_goals.joblib
    models/catboost_btts.joblib
    models/neural_net.keras
    models/feature_scaler.joblib
    models/model_metadata.json
"""

import json
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime

import joblib
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.metrics import accuracy_score, classification_report, log_loss
from sklearn.ensemble import RandomForestClassifier, VotingClassifier
import xgboost as xgb
import lightgbm as lgb
from catboost import CatBoostClassifier

from features import extract_features, FEATURE_COLUMNS

DATA_DIR = Path(__file__).parent / "data"
MODELS_DIR = Path(__file__).parent / "models"
MODELS_DIR.mkdir(exist_ok=True)


def load_training_data() -> pd.DataFrame:
    """Load and prepare training data."""
    data_file = DATA_DIR / "training_data.json"
    if not data_file.exists():
        print("ERROR: No training data found. Run collect_data.py first.")
        print("       Or use the synthetic data generator below.")
        return generate_synthetic_data()

    with open(data_file) as f:
        samples = json.load(f)

    print(f"Loaded {len(samples)} samples from {data_file}")

    rows = []
    for sample in samples:
        try:
            features = extract_features(
                {"fixture": sample},
                sample.get("home_stats", {}),
                sample.get("away_stats", {})
            )
            features["result"] = sample["result"]
            features["total_goals"] = sample["total_goals"]
            features["btts"] = int(sample["btts"])
            features["over_25"] = int(sample["over_25"])
            rows.append(features)
        except Exception:
            continue

    df = pd.DataFrame(rows)
    print(f"Prepared {len(df)} valid training samples with {len(FEATURE_COLUMNS)} features")
    return df


def generate_synthetic_data(n_samples: int = 10000) -> pd.DataFrame:
    """Generate synthetic training data based on realistic football distributions."""
    print(f"Generating {n_samples} synthetic training samples...")
    np.random.seed(42)

    rows = []
    for _ in range(n_samples):
        # Generate realistic team stats
        home_strength = np.random.beta(3, 3)  # 0-1, centered around 0.5
        away_strength = np.random.beta(3, 3)

        home_gpg = np.random.gamma(3, 0.5) * home_strength + 0.5
        away_gpg = np.random.gamma(3, 0.5) * away_strength + 0.4
        home_cpg = np.random.gamma(2, 0.5) * (1 - home_strength) + 0.5
        away_cpg = np.random.gamma(2, 0.5) * (1 - away_strength) + 0.6

        features = {
            "home_win_rate": np.clip(home_strength * 0.6 + np.random.normal(0, 0.1), 0.1, 0.9),
            "away_win_rate": np.clip(away_strength * 0.5 + np.random.normal(0, 0.1), 0.05, 0.8),
            "home_draw_rate": np.clip(0.25 + np.random.normal(0, 0.08), 0.1, 0.4),
            "away_draw_rate": np.clip(0.27 + np.random.normal(0, 0.08), 0.1, 0.4),
            "home_goals_per_game": np.clip(home_gpg, 0.3, 3.5),
            "away_goals_per_game": np.clip(away_gpg, 0.2, 3.0),
            "home_conceded_per_game": np.clip(home_cpg, 0.3, 3.0),
            "away_conceded_per_game": np.clip(away_cpg, 0.3, 3.5),
            "home_goal_diff": home_gpg - home_cpg,
            "away_goal_diff": away_gpg - away_cpg,
            "home_form_points": np.clip(home_strength + np.random.normal(0, 0.15), 0, 1),
            "away_form_points": np.clip(away_strength + np.random.normal(0, 0.15), 0, 1),
            "home_home_win_rate": np.clip(home_strength * 0.7 + 0.1 + np.random.normal(0, 0.1), 0.1, 0.95),
            "away_away_win_rate": np.clip(away_strength * 0.4 + np.random.normal(0, 0.1), 0.05, 0.7),
            "home_clean_sheet_rate": np.clip((1 - home_cpg / 2) * 0.4, 0, 0.6),
            "away_clean_sheet_rate": np.clip((1 - away_cpg / 2) * 0.3, 0, 0.5),
            "home_failed_to_score_rate": np.clip((1 - home_gpg / 2) * 0.3, 0, 0.5),
            "away_failed_to_score_rate": np.clip((1 - away_gpg / 2) * 0.4, 0, 0.6),
            "home_penalty_rate": np.random.exponential(0.05),
            "away_penalty_rate": np.random.exponential(0.04),
        }

        # Derived features
        features["strength_diff"] = features["home_win_rate"] - features["away_win_rate"]
        features["goal_diff_diff"] = features["home_goal_diff"] - features["away_goal_diff"]
        features["form_diff"] = features["home_form_points"] - features["away_form_points"]
        features["attack_vs_defense"] = features["home_goals_per_game"] - features["away_conceded_per_game"]
        features["defense_vs_attack"] = features["away_goals_per_game"] - features["home_conceded_per_game"]
        features["expected_home_goals"] = (features["home_goals_per_game"] * 0.6 + features["away_conceded_per_game"] * 0.4) * 1.1
        features["expected_away_goals"] = (features["away_goals_per_game"] * 0.6 + features["home_conceded_per_game"] * 0.4) * 0.9
        features["expected_total_goals"] = features["expected_home_goals"] + features["expected_away_goals"]
        features["home_ppg"] = features["home_win_rate"] * 3 + features["home_draw_rate"]
        features["away_ppg"] = features["away_win_rate"] * 3 + features["away_draw_rate"]
        features["ppg_diff"] = features["home_ppg"] - features["away_ppg"]

        # Generate realistic outcome based on features
        home_prob = 0.35 + features["strength_diff"] * 0.3 + features["form_diff"] * 0.1 + 0.08  # home advantage
        draw_prob = 0.28 - abs(features["strength_diff"]) * 0.15
        away_prob = 1 - home_prob - draw_prob

        probs = np.array([max(0.05, home_prob), max(0.1, draw_prob), max(0.05, away_prob)])
        probs = probs / probs.sum()

        result = np.random.choice(["HOME_WIN", "DRAW", "AWAY_WIN"], p=probs)

        # Generate goals based on expected
        home_goals = np.random.poisson(features["expected_home_goals"])
        away_goals = np.random.poisson(features["expected_away_goals"])

        # Adjust to match result
        if result == "HOME_WIN" and home_goals <= away_goals:
            home_goals = away_goals + 1
        elif result == "AWAY_WIN" and away_goals <= home_goals:
            away_goals = home_goals + 1
        elif result == "DRAW":
            away_goals = home_goals

        features["result"] = result
        features["total_goals"] = home_goals + away_goals
        features["btts"] = int(home_goals > 0 and away_goals > 0)
        features["over_25"] = int((home_goals + away_goals) >= 3)

        rows.append(features)

    return pd.DataFrame(rows)


def train_xgboost_1x2(X_train, X_test, y_train, y_test, le):
    """Train XGBoost for 1X2 prediction."""
    print("\n🔥 Training XGBoost (1X2)...")

    model = xgb.XGBClassifier(
        n_estimators=500,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=3,
        reg_alpha=0.1,
        reg_lambda=1.0,
        objective="multi:softprob",
        num_class=3,
        eval_metric="mlogloss",
        tree_method="hist",  # Fast on M4
        device="cpu",
        random_state=42,
    )

    model.fit(
        X_train, y_train,
        eval_set=[(X_test, y_test)],
        verbose=50,
    )

    y_pred = model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    print(f"   Accuracy: {accuracy:.4f}")
    print(classification_report(y_test, y_pred, target_names=le.classes_))

    # Save
    joblib.dump(model, MODELS_DIR / "xgboost_1x2.joblib")
    return model, accuracy


def train_lightgbm_goals(X_train, X_test, y_goals_train, y_goals_test):
    """Train LightGBM for Over/Under 2.5 goals."""
    print("\n🌿 Training LightGBM (Over 2.5)...")

    model = lgb.LGBMClassifier(
        n_estimators=400,
        max_depth=5,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_samples=10,
        reg_alpha=0.1,
        reg_lambda=1.0,
        objective="binary",
        metric="binary_logloss",
        random_state=42,
        verbose=-1,
    )

    model.fit(X_train, y_goals_train, eval_set=[(X_test, y_goals_test)])

    y_pred = model.predict(X_test)
    accuracy = accuracy_score(y_goals_test, y_pred)
    print(f"   Accuracy (Over 2.5): {accuracy:.4f}")

    joblib.dump(model, MODELS_DIR / "lightgbm_goals.joblib")
    return model, accuracy


def train_catboost_btts(X_train, X_test, y_btts_train, y_btts_test):
    """Train CatBoost for BTTS prediction."""
    print("\n🐱 Training CatBoost (BTTS)...")

    model = CatBoostClassifier(
        iterations=400,
        depth=5,
        learning_rate=0.05,
        l2_leaf_reg=3,
        random_seed=42,
        verbose=50,
        task_type="CPU",
    )

    model.fit(X_train, y_btts_train, eval_set=(X_test, y_btts_test))

    y_pred = model.predict(X_test)
    accuracy = accuracy_score(y_btts_test, y_pred)
    print(f"   Accuracy (BTTS): {accuracy:.4f}")

    model.save_model(str(MODELS_DIR / "catboost_btts.cbm"))
    return model, accuracy


def train_random_forest_1x2(X_train, X_test, y_train, y_test, le):
    """Train Random Forest for 1X2 (AutoML baseline)."""
    print("\n🌲 Training Random Forest (1X2)...")
    model = RandomForestClassifier(
        n_estimators=300,
        max_depth=8,
        min_samples_leaf=4,
        class_weight="balanced_subsample",
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    print(f"   Accuracy (RF): {accuracy:.4f}")
    joblib.dump(model, MODELS_DIR / "random_forest_1x2.joblib")
    return model, accuracy


def tune_xgboost_optuna(X_train, X_test, y_train, y_test, le):
    """Optional Optuna hyperparameter search for XGBoost."""
    try:
        import optuna
    except ImportError:
        print("   ⚠️ Optuna not installed. Set ML_OPTUNA=1 after pip install optuna.")
        return None, 0.0

    optuna.logging.set_verbosity(optuna.logging.WARNING)

    def objective(trial):
        params = {
            "n_estimators": trial.suggest_int("n_estimators", 200, 600),
            "max_depth": trial.suggest_int("max_depth", 4, 8),
            "learning_rate": trial.suggest_float("learning_rate", 0.02, 0.12),
            "subsample": trial.suggest_float("subsample", 0.6, 1.0),
            "colsample_bytree": trial.suggest_float("colsample_bytree", 0.6, 1.0),
            "objective": "multi:softprob",
            "num_class": 3,
            "tree_method": "hist",
            "random_state": 42,
        }
        model = xgb.XGBClassifier(**params)
        model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)
        return accuracy_score(y_test, model.predict(X_test))

    study = optuna.create_study(direction="maximize")
    study.optimize(objective, n_trials=12, show_progress_bar=False)
    best = study.best_params
    model = xgb.XGBClassifier(
        **best,
        objective="multi:softprob",
        num_class=3,
        tree_method="hist",
        random_state=42,
    )
    model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=50)
    acc = accuracy_score(y_test, model.predict(X_test))
    joblib.dump(model, MODELS_DIR / "xgboost_1x2_optuna.joblib")
    print(f"   Optuna best accuracy: {acc:.4f}")
    return model, acc


def train_neural_network(X_train, X_test, y_train, y_test, n_classes=3):
    """Train a simple neural network with Keras."""
    print("\n🧠 Training Neural Network (Keras)...")

    try:
        import tensorflow as tf
        from tensorflow import keras
        from tensorflow.keras import layers

        model = keras.Sequential([
            layers.Input(shape=(X_train.shape[1],)),
            layers.Dense(128, activation="relu"),
            layers.Dropout(0.3),
            layers.Dense(64, activation="relu"),
            layers.Dropout(0.2),
            layers.Dense(32, activation="relu"),
            layers.Dense(n_classes, activation="softmax"),
        ])

        model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=0.001),
            loss="sparse_categorical_crossentropy",
            metrics=["accuracy"],
        )

        model.fit(
            X_train, y_train,
            validation_data=(X_test, y_test),
            epochs=50,
            batch_size=64,
            verbose=1,
        )

        loss, accuracy = model.evaluate(X_test, y_test, verbose=0)
        print(f"   Accuracy (NN): {accuracy:.4f}")

        model.save(str(MODELS_DIR / "neural_net.keras"))
        return model, accuracy

    except ImportError:
        print("   ⚠️ TensorFlow not available. Skipping neural network.")
        return None, 0.0


def main():
    print("═══════════════════════════════════════════════════")
    print("  FOOTBALL AI — ML Model Training Pipeline")
    print("═══════════════════════════════════════════════════")
    print(f"  Date: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print()

    # Load data
    df = load_training_data()
    if df.empty:
        print("No data available for training.")
        return

    # Prepare features and targets
    X = df[FEATURE_COLUMNS].fillna(0).values
    y_result = df["result"].values
    y_over25 = df["over_25"].values
    y_btts = df["btts"].values

    # Encode labels
    le = LabelEncoder()
    y_encoded = le.fit_transform(y_result)

    # Scale features
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Split
    X_train, X_test, y_train, y_test = train_test_split(X_scaled, y_encoded, test_size=0.2, random_state=42, stratify=y_encoded)
    _, _, y_goals_train, y_goals_test = train_test_split(X_scaled, y_over25, test_size=0.2, random_state=42)
    _, _, y_btts_train, y_btts_test = train_test_split(X_scaled, y_btts, test_size=0.2, random_state=42)

    print(f"\n📊 Dataset: {len(X)} samples, {X.shape[1]} features")
    print(f"   Train: {len(X_train)} | Test: {len(X_test)}")
    print(f"   Classes: {le.classes_} → {np.bincount(y_encoded)}")

    # Train models
    import os
    if os.environ.get("ML_OPTUNA") == "1":
        xgb_model, xgb_acc = tune_xgboost_optuna(X_train, X_test, y_train, y_test, le)
        if xgb_model is None:
            xgb_model, xgb_acc = train_xgboost_1x2(X_train, X_test, y_train, y_test, le)
    else:
        xgb_model, xgb_acc = train_xgboost_1x2(X_train, X_test, y_train, y_test, le)
    rf_model, rf_acc = train_random_forest_1x2(X_train, X_test, y_train, y_test, le)
    lgb_model, lgb_acc = train_lightgbm_goals(X_train, X_test, y_goals_train, y_goals_test)
    cat_model, cat_acc = train_catboost_btts(X_train, X_test, y_btts_train, y_btts_test)
    nn_model, nn_acc = train_neural_network(X_train, X_test, y_train, y_test)

    voting = VotingClassifier(
        estimators=[("xgb", xgb_model), ("rf", rf_model)],
        voting="soft",
    )
    voting.fit(X_train, y_train)
    vote_acc = accuracy_score(y_test, voting.predict(X_test))
    joblib.dump(voting, MODELS_DIR / "voting_ensemble.joblib")
    print(f"   Voting ensemble accuracy: {vote_acc:.4f}")

    # Save scaler and metadata
    joblib.dump(scaler, MODELS_DIR / "feature_scaler.joblib")
    joblib.dump(le, MODELS_DIR / "label_encoder.joblib")

    metadata = {
        "trained_at": datetime.now().isoformat(),
        "n_samples": len(X),
        "n_features": X.shape[1],
        "feature_columns": FEATURE_COLUMNS,
        "classes": le.classes_.tolist(),
        "accuracy": {
            "xgboost_1x2": round(xgb_acc, 4),
            "random_forest_1x2": round(rf_acc, 4),
            "voting_ensemble": round(vote_acc, 4),
            "lightgbm_over25": round(lgb_acc, 4),
            "catboost_btts": round(cat_acc, 4),
            "neural_net": round(nn_acc, 4),
        },
    }

    with open(MODELS_DIR / "model_metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)

    print("\n═══════════════════════════════════════════════════")
    print("  ✅ TRAINING COMPLETE")
    print(f"  XGBoost 1X2:     {xgb_acc:.4f}")
    print(f"  LightGBM Over25: {lgb_acc:.4f}")
    print(f"  CatBoost BTTS:   {cat_acc:.4f}")
    print(f"  Neural Net:      {nn_acc:.4f}")
    print(f"  Models saved to: {MODELS_DIR}")
    print("═══════════════════════════════════════════════════")

    # Hybrid pipeline (Dixon-Coles → XGBoost)
    print("\n🔗 Training hybrid Dixon-Coles → XGBoost pipeline...")
    try:
        from train_hybrid import train as train_hybrid

        train_hybrid()
    except Exception as e:
        print(f"   ⚠️ Hybrid training skipped: {e}")


if __name__ == "__main__":
    main()
