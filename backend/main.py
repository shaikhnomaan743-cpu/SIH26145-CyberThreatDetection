from fastapi import FastAPI
from backend.models import Flow
from backend.database import init_db, insert_flow, get_all_flows, get_all_alerts

app = FastAPI(title="SIH26145 Cyber Threat Detection API")

# Initialize database tables when starting server
init_db()

@app.get("/")
def read_root():
    return {"message": "Cyber Threat Detection API is running"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}

@app.post("/api/flows")
def create_flow(flow: Flow):
    saved_flow = insert_flow(flow)
    return {"status": "success", "data": saved_flow}

@app.get("/api/flows")
def read_flows():
    return get_all_flows()

@app.get("/api/alerts")
def read_alerts():
    return get_all_alerts()

@app.post("/api/predict")
def predict_threat(flow: Flow):
    # This will be replaced with actual ML model from Person 3 later
    return {
        "is_malicious": False,
        "confidence": 0.90,
        "flow_summary": f"{flow.source_ip} -> {flow.destination_ip}"
    }