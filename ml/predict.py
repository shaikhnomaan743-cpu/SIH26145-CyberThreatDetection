import pandas as pd
import joblib
import os

# Load artifacts globally so they don't reload on every single API request
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
model = joblib.load(os.path.join(BASE_DIR, 'isolation_forest.pkl'))
scaler = joblib.load(os.path.join(BASE_DIR, 'scaler.pkl'))
model_columns = joblib.load(os.path.join(BASE_DIR, 'model_columns.pkl'))

def predict_flow(flow_dict):
    # Convert dictionary to DataFrame
    df = pd.DataFrame([flow_dict])
    
    # Drop non-numeric columns
    cols_to_drop = ['timestamp', 'source_ip', 'destination_ip']
    df = df.drop(columns=[col for col in cols_to_drop if col in df.columns], errors='ignore')
    
    # One-hot encode protocol
    if 'protocol' in df.columns:
        df = pd.get_dummies(df, columns=['protocol'])
        
    # Ensure all expected columns are present (fill missing with 0)
    # This prevents errors if a flow has a protocol the model hasn't seen
    for col in model_columns:
        if col not in df.columns:
            df[col] = 0
            
    # Reorder columns to exactly match training data
    df = df[model_columns]
    
    # Scale numeric features
    numeric_cols = ['source_port', 'destination_port', 'packet_count', 'byte_count', 
                    'duration_seconds', 'packets_per_second', 'bytes_per_second']
    numeric_cols = [c for c in numeric_cols if c in df.columns]
    df[numeric_cols] = scaler.transform(df[numeric_cols])
    
    # Predict (-1 is anomaly, 1 is normal)
    prediction = model.predict(df)[0]
    
    if prediction == -1:
        return {'is_malicious': True, 'confidence': 1.0}
    else:
        return {'is_malicious': False, 'confidence': 0.9}

if __name__ == "__main__":
    # Test with a dummy flow
    sample_flow = {
        'timestamp': '2026-08-29T12:00:00', 'source_ip': '192.168.1.10',
        'destination_ip': '10.0.0.5', 'source_port': 55432, 'destination_port': 80,
        'protocol': 'TCP', 'packet_count': 50, 'byte_count': 1500,
        'duration_seconds': 1.2, 'packets_per_second': 41.6, 'bytes_per_second': 1250
    }
    print(predict_flow(sample_flow))