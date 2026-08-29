import os
import pandas as pd
from sklearn.preprocessing import StandardScaler
import joblib

def preprocess_data(csv_path='../data/flows.csv', output_path='preprocessed_flows.csv'):
    # Resolve file paths relative to this script directory
    base_dir = os.path.dirname(os.path.abspath(__file__))
    input_file = os.path.normpath(os.path.join(base_dir, csv_path))
    output_file = os.path.normpath(os.path.join(base_dir, output_path))
    
    print(f"Loading data from: {input_file}")
    df = pd.read_csv(input_file)
    
    # Drop identifier columns
    cols_to_drop = ['timestamp', 'source_ip', 'destination_ip']
    df_clean = df.drop(columns=[col for col in cols_to_drop if col in df.columns], errors='ignore')
    
    # One-hot encode protocol
    if 'protocol' in df_clean.columns:
        df_clean = pd.get_dummies(df_clean, columns=['protocol'], drop_first=False)
        
    # Scale numerical features
    numeric_cols = [
        'source_port', 'destination_port', 'packet_count', 'byte_count', 
        'duration_seconds', 'packets_per_second', 'bytes_per_second'
    ]
    numeric_cols = [c for c in numeric_cols if c in df_clean.columns]
    
    scaler = StandardScaler()
    df_clean[numeric_cols] = scaler.fit_transform(df_clean[numeric_cols])
    
    # Save artifacts needed by predict.py
    joblib.dump(scaler, os.path.join(base_dir, 'scaler.pkl'))
    joblib.dump(list(df_clean.columns), os.path.join(base_dir, 'model_columns.pkl'))
    
    df_clean.to_csv(output_file, index=False)
    print(f"Preprocessed dataset saved to: {output_file}")
    return df_clean

if __name__ == "__main__":
    preprocess_data()