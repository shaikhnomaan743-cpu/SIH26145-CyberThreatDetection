import sys
import os
from datetime import datetime
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Add the project root to sys.path so ml/predict.py can be imported
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from ml.predict import predict_flow

from backend.models import Flow, Alert
from backend.database import init_db, insert_flow, get_all_flows, get_all_alerts

# Import insert_alert if available in database.py
try:
    from backend.database import insert_alert
except ImportError:
    insert_alert = None

app = FastAPI(title="SIH26145 Cyber Threat Detection API")

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database tables
init_db()

@app.get("/")
def read_root():
    return {"message": "Cyber Threat Detection API is running"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}

@app.post("/api/flows")
def create_flow(flow: Flow):
    # 1. Convert Pydantic object to dictionary for the ML model
    flow_dict = flow.dict() if hasattr(flow, 'dict') else flow.model_dump()

    # 2. Run Person 3's ML anomaly detection model
    prediction = predict_flow(flow_dict)

    # 3. Save incoming flow to DB
    saved_flow = insert_flow(flow)

    # 4. If the Isolation Forest flags an anomaly, log an alert
    if prediction.get("is_malicious"):
        alert_payload = Alert(
            time=datetime.now().strftime("%I:%M:%S %p"),
            source_ip=flow.source_ip,
            destination_ip=flow.destination_ip,
            port=getattr(flow, 'destination_port', getattr(flow, 'port', 80)),
            protocol=getattr(flow, 'protocol', 'TCP'),
            threat_type="Anomaly Detected",
            severity="High"
        )
        if insert_alert:
            insert_alert(alert_payload)

    return {
        "status": "success",
        "data": saved_flow,
        "prediction": prediction
    }

@app.get("/api/flows")
def read_flows():
    return get_all_flows()

@app.get("/api/alerts")
def read_alerts():
    return get_all_alerts()

@app.post("/api/predict")
def predict_threat(flow: Flow):
    # Direct inference route replacing placeholder
    flow_dict = flow.dict() if hasattr(flow, 'dict') else flow.model_dump()
    prediction = predict_flow(flow_dict)
    
    return {
        "is_malicious": prediction.get("is_malicious", False),
        "confidence": prediction.get("confidence", 0.90),
        "flow_summary": f"{flow.source_ip} -> {flow.destination_ip}"
    }