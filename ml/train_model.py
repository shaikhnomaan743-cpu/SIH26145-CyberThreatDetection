import os

import joblib
import pandas as pd
from sklearn.ensemble import IsolationForest

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE_DIR, "preprocessed_flows.csv")
MODEL_PATH = os.path.join(BASE_DIR, "isolation_forest.pkl")


def main():
    df = pd.read_csv(DATA_PATH)
    model = IsolationForest(
        n_estimators=200,
        contamination=0.02,
        random_state=42,
        n_jobs=-1,
    )
    print(f"Training Isolation Forest on {len(df)} rows...")
    model.fit(df)
    predictions = model.predict(df)
    anomalies = (predictions == -1).sum()
    normal = (predictions == 1).sum()
    print(f"Training complete. Flagged {anomalies} of {len(df)} as anomalies ({normal} inliers).")
    joblib.dump(model, MODEL_PATH)
    print(f"Saved {MODEL_PATH}")


if __name__ == "__main__":
    main()
