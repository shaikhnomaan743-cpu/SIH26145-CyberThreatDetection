from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.models import Flow, Alert
from backend.database import init_db, insert_flow, get_all_flows, get_all_alerts

app = FastAPI(title="SIH26145 Cyber Threat Detection API")

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows requests from React dashboard
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
    # Placeholder until Person 3 provides the trained model
    return {
        "is_malicious": False,
        "confidence": 0.90,
        "flow_summary": f"{flow.source_ip} -> {flow.destination_ip}"
    }