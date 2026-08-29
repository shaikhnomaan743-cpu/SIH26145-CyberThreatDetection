import pandas as pd
from sklearn.preprocessing import StandardScaler
import joblib

def preprocess_data(csv_path, output_path='preprocessed_flows.csv'):
    print("Loading data...")
    df = pd.read_csv(csv_path)
    
    # 1. Drop non-numeric columns (except protocol)
    # We drop IP addresses and timestamps as they aren't numerical features for the model
    cols_to_drop = ['timestamp', 'source_ip', 'destination_ip']
    df_clean = df.drop(columns=[col for col in cols_to_drop if col in df.columns], errors='ignore')
    
    # 2. One-hot encode the protocol column (e.g., TCP, UDP)
    if 'protocol' in df_clean.columns:
        df_clean = pd.get_dummies(df_clean, columns=['protocol'], dummy_na=False)
        
    # 3. Scale numeric features
    scaler = StandardScaler()
    numeric_cols = ['source_port', 'destination_port', 'packet_count', 'byte_count', 
                    'duration_seconds', 'packets_per_second', 'bytes_per_second']
    
    # Filter to only the columns that actually exist in the CSV
    numeric_cols = [c for c in numeric_cols if c in df_clean.columns]
    
    df_clean[numeric_cols] = scaler.fit_transform(df_clean[numeric_cols])
    
    # Save the scaler and the final column list for the prediction script
    joblib.dump(scaler, 'scaler.pkl')
    joblib.dump(list(df_clean.columns), 'model_columns.pkl')
    
    # Save the preprocessed dataset
    df_clean.to_csv(output_path, index=False)
    print(f"Preprocessed data saved to {output_path}")
    return df_clean

if __name__ == "__main__":
    # Test it with the CSV Person 2 provides you (adjust path if needed)
    # preprocess_data('../data/flows.csv') 
    pass