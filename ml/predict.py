import os

import joblib
import pandas as pd

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
model = joblib.load(os.path.join(BASE_DIR, "isolation_forest.pkl"))
scaler = joblib.load(os.path.join(BASE_DIR, "scaler.pkl"))
model_columns = joblib.load(os.path.join(BASE_DIR, "model_columns.pkl"))

NUMERIC_COLS = [
    "source_port",
    "destination_port",
    "packet_count",
    "byte_count",
    "duration_seconds",
    "packets_per_second",
    "bytes_per_second",
]


def severity_from_confidence(confidence):
    if confidence > 0.85:
        return "High"
    if confidence >= 0.65:
        return "Medium"
    return "Low"


def classify_threat(flow_dict, is_malicious, confidence):
    dport = int(flow_dict.get("destination_port") or flow_dict.get("dst_port") or 0)
    pps = float(flow_dict.get("packets_per_second") or 0)
    pkts = int(flow_dict.get("packet_count") or 0)
    dur = float(flow_dict.get("duration_seconds") or 0)
    nbytes = int(flow_dict.get("byte_count") or 0)
    scan_ports = {22, 80, 443, 3389, 21, 23, 445}

    volumetric = pkts >= 5000 or nbytes >= 5_000_000 or (pps >= 2000 and pkts >= 200)
    probe = pkts <= 4 and dur < 1.5 and dport in scan_ports

    if volumetric:
        threat = "Volumetric flood"
        detail = "Extreme packet or byte rate relative to duration."
        confidence = max(confidence, 0.88)
        is_malicious = True
    elif probe:
        threat = "Reconnaissance probe"
        detail = f"Short SYN-like flow ({pkts} packets) to port {dport}."
        confidence = min(max(confidence, 0.68), 0.84)
        is_malicious = True
    elif not is_malicious:
        return "Clean Traffic", "Low", None, False, confidence
    elif dport in (22, 3389, 21, 23) and pkts >= 40:
        threat = "Credential stuffing"
        detail = f"High-volume session against service port {dport}."
    elif dport in (80, 443) and pps >= 400:
        threat = "HTTP flood"
        detail = "Elevated request rate on web ports."
    else:
        threat = "Traffic anomaly"
        detail = "Isolation Forest scored this flow outside the learned baseline."

    return threat, severity_from_confidence(confidence), detail, is_malicious, round(confidence, 3)


def predict_flow(flow_dict: dict) -> dict:
    df = pd.DataFrame([flow_dict])

    if "src_port" in df.columns and "source_port" not in df.columns:
        df["source_port"] = df["src_port"]
    if "dst_port" in df.columns and "destination_port" not in df.columns:
        df["destination_port"] = df["dst_port"]

    for col in NUMERIC_COLS:
        if col not in df.columns:
            df[col] = 0.0

    cols_to_drop = [
        "timestamp",
        "source_ip",
        "destination_ip",
        "src_ip",
        "dst_ip",
        "src_port",
        "dst_port",
        "packet_length",
        "id",
        "is_malicious",
        "confidence",
        "threat_type",
        "severity",
    ]
    df = df.drop(columns=[col for col in cols_to_drop if col in df.columns], errors="ignore")

    if "protocol" in df.columns:
        df["protocol"] = df["protocol"].astype(str).str.upper().replace(
            {"6": "TCP", "17": "UDP", "1": "ICMP"}
        )
        df = pd.get_dummies(df, columns=["protocol"])

    for col in model_columns:
        if col not in df.columns:
            df[col] = 0

    df = df[model_columns]
    df[NUMERIC_COLS] = scaler.transform(df[NUMERIC_COLS])

    raw_pred = model.predict(df)[0]
    is_malicious = bool(raw_pred == -1)
    decision_score = float(model.decision_function(df)[0])

    if is_malicious:
        confidence = min(1.0, 0.5 + abs(decision_score) * 2)
    else:
        confidence = min(1.0, 0.5 + max(decision_score, 0) * 2)

    threat_type, severity, description, is_malicious, confidence = classify_threat(
        flow_dict, is_malicious, confidence
    )

    return {
        "is_malicious": is_malicious,
        "confidence": round(confidence, 3),
        "threat_type": threat_type,
        "severity": severity,
        "anomaly_score": round(decision_score, 4),
        "description": description,
    }


if __name__ == "__main__":
    sample_flow = {
        "source_ip": "192.168.1.10",
        "destination_ip": "10.0.0.5",
        "source_port": 55432,
        "destination_port": 80,
        "protocol": "TCP",
        "packet_count": 50,
        "byte_count": 1500,
        "duration_seconds": 1.2,
        "packets_per_second": 41.6,
        "bytes_per_second": 1250,
    }
    print(predict_flow(sample_flow))
