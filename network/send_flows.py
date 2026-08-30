import os
import sys
import time
import pandas as pd
import requests

API_URL = os.environ.get("THREX_API_URL", "http://127.0.0.1:8000/api/flows")

def send_flows(csv_path, delay_seconds=0.5):
    """
    Reads flows from a CSV file and streams each flow record as a JSON 
    POST request to Person 1's backend API.
    """
    try:
        df = pd.read_csv(csv_path)
    except FileNotFoundError:
        print(f"Error: File '{csv_path}' not found. Run pcap_to_flows.py first.")
        sys.exit(1)

    print(f"Starting flow streaming from '{csv_path}' to {API_URL}...\n")

    # Replace NaN values with appropriate defaults for JSON serialization
    df = df.fillna(0)

    for index, row in df.iterrows():
        # Convert pandas row to a clean dictionary/JSON payload
        flow_payload = row.to_dict()

        try:
            response = requests.post(API_URL, json=flow_payload, timeout=5)
            print(f"[Flow {index + 1}/{len(df)}] Sent: {flow_payload['source_ip']}:{flow_payload['source_port']} -> "
                  f"{flow_payload['destination_ip']}:{flow_payload['destination_port']} | Status: {response.status_code}")
        except requests.exceptions.ConnectionError:
            print(f"[Flow {index + 1}/{len(df)}] Failed: Could not connect to {API_URL}. Is Person 1's server running?")
        except Exception as e:
            print(f"[Flow {index + 1}/{len(df)}] Error: {e}")

        # Pause to simulate real-time live network traffic flow
        time.sleep(delay_seconds)

    print("\nFlow streaming complete.")

if __name__ == "__main__":
    csv_file = sys.argv[1] if len(sys.argv) > 1 else "data/flows.csv"
    send_flows(csv_file)