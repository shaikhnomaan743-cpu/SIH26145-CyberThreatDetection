import pandas as pd
from sklearn.ensemble import IsolationForest
import joblib

# 1. Load the preprocessed data from Step 3.2
df = pd.read_csv('preprocessed_flows.csv')

# 2. Initialize the Isolation Forest
# 'contamination' is the estimated percentage of anomalies in the dataset (5% here)
model = IsolationForest(n_estimators=100, contamination=0.05, random_state=42)

print("Training Isolation Forest model...")
model.fit(df)

# 3. Predict on the training data to see how many anomalies it flags
predictions = model.predict(df)
anomalies = (predictions == -1).sum()
normal = (predictions == 1).sum()

print(f"Training complete!")
print(f"Detected {anomalies} anomalies and {normal} normal flows.")

# 4. Save the trained model
joblib.dump(model, 'isolation_forest.pkl')
print("Model successfully saved to 'isolation_forest.pkl'")