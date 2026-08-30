import json
import os
import random
import shutil
import sys
from datetime import datetime

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.database import (
    acknowledge_alert,
    block_alert_ip,
    clear_all,
    get_all_alerts,
    get_all_flows,
    get_blocked_ips,
    init_db,
    insert_alert,
    insert_flow,
)
from backend.models import Alert, Flow, LoginRequest, SimulateRequest
from ml.predict import predict_flow

try:
    from network.pcap_to_flows import extract_flows
except ImportError:
    extract_flows = None

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
INTEL_PATH = os.path.join(ROOT, "data", "threat_intel.json")

app = FastAPI(title="SIH26145 Cyber Threat Detection API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()

ADMIN_USER = os.getenv("THREX_USER", "admin")
ADMIN_PASSWORD = os.getenv("THREX_PASSWORD", "threx")


def dump(model):
    return model.model_dump() if hasattr(model, "model_dump") else model.dict()


def score_and_store(flow: Flow):
    flow.calculate_rates()
    prediction = predict_flow(dump(flow))
    saved = insert_flow(flow, prediction)
    if prediction.get("is_malicious"):
        insert_alert(
            Alert(
                time=datetime.now().strftime("%I:%M:%S %p"),
                source_ip=flow.source_ip,
                destination_ip=flow.destination_ip,
                port=flow.destination_port,
                protocol=flow.protocol,
                threat_type=prediction.get("threat_type", "Anomaly Detected"),
                severity=prediction.get("severity", "High"),
                confidence=prediction.get("confidence", 0),
                description=prediction.get("description"),
            ),
            flow_id=saved.get("id"),
        )
    return saved, prediction


def flow_from_record(item):
    ts = item.get("timestamp", datetime.now())
    if isinstance(ts, (int, float)):
        ts = datetime.fromtimestamp(ts)
    elif isinstance(ts, str):
        try:
            ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except ValueError:
            ts = datetime.now()
    proto = item.get("protocol", "TCP")
    if isinstance(proto, int):
        proto = {6: "TCP", 17: "UDP", 1: "ICMP"}.get(proto, str(proto))
    flow = Flow(
        timestamp=ts,
        source_ip=str(item.get("source_ip") or item.get("src_ip")),
        destination_ip=str(item.get("destination_ip") or item.get("dst_ip")),
        source_port=int(item.get("source_port") or item.get("src_port") or 0),
        destination_port=int(item.get("destination_port") or item.get("dst_port") or 0),
        protocol=str(proto),
        packet_count=int(item.get("packet_count") or 1),
        byte_count=int(item.get("byte_count") or item.get("packet_length") or 0),
        duration_seconds=float(item.get("duration_seconds") or 0.001),
        packets_per_second=float(item.get("packets_per_second") or 0),
        bytes_per_second=float(item.get("bytes_per_second") or 0),
    )
    flow.calculate_rates()
    return flow


@app.get("/")
def read_root():
    return {"message": "Cyber Threat Detection API is running", "product": "THREX AI"}


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "engine": "Isolation Forest",
        "time": datetime.now().isoformat(),
        "flows": len(get_all_flows()),
        "alerts": len(get_all_alerts()),
    }


@app.post("/api/login")
def login(body: LoginRequest):
    if body.username.strip() == ADMIN_USER and body.password.strip() == ADMIN_PASSWORD:
        return {"ok": True, "user": body.username, "role": "Admin"}
    raise HTTPException(status_code=401, detail="Invalid credentials")


@app.get("/api/flows")
def read_flows():
    return get_all_flows()


@app.get("/api/alerts")
def read_alerts():
    return get_all_alerts()


@app.get("/api/intel")
def read_intel():
    catalog = []
    if os.path.exists(INTEL_PATH):
        with open(INTEL_PATH, "r", encoding="utf-8") as fh:
            catalog = json.load(fh)
    alerts = get_all_alerts()
    by_ip = {}
    for alert in alerts:
        ip = alert["source_ip"]
        entry = by_ip.setdefault(
            ip,
            {
                "ip": ip,
                "hits": 0,
                "last_seen": alert.get("timestamp"),
                "first_seen": alert.get("timestamp"),
                "threat_types": {},
                "severity": alert.get("severity"),
            },
        )
        entry["hits"] += 1
        if alert.get("timestamp") and (not entry["last_seen"] or alert["timestamp"] > entry["last_seen"]):
            entry["last_seen"] = alert["timestamp"]
        types = entry["threat_types"]
        types[alert["threat_type"]] = types.get(alert["threat_type"], 0) + 1
    catalog_map = {row["ip"]: row for row in catalog}
    merged = []
    seen = set()
    for ip, row in by_ip.items():
        extra = catalog_map.get(ip, {})
        top_type = max(row["threat_types"], key=row["threat_types"].get) if row["threat_types"] else "Anomaly"
        merged.append(
            {
                "ip": ip,
                "hits": row["hits"],
                "first_seen": row["first_seen"],
                "last_seen": row["last_seen"],
                "threat_type": top_type,
                "severity": row["severity"],
                "source": extra.get("source", "Observed on this sensor"),
                "notes": extra.get("notes", "Flagged by THREX Isolation Forest + rules."),
                "listed": ip in catalog_map,
            }
        )
        seen.add(ip)
    for ip, extra in catalog_map.items():
        if ip not in seen:
            merged.append(
                {
                    "ip": ip,
                    "hits": 0,
                    "first_seen": None,
                    "last_seen": None,
                    "threat_type": extra.get("threat_type", "Watchlist"),
                    "severity": extra.get("severity", "Medium"),
                    "source": extra.get("source", "Local watchlist"),
                    "notes": extra.get("notes", ""),
                    "listed": True,
                }
            )
    merged.sort(key=lambda r: (-r["hits"], r["ip"]))
    return merged


@app.post("/api/predict")
def predict_threat(flow: Flow):
    flow.calculate_rates()
    prediction = predict_flow(dump(flow))
    return {
        **prediction,
        "flow_summary": f"{flow.source_ip} -> {flow.destination_ip}",
    }


@app.post("/api/flows")
def create_flow(flow: Flow):
    saved, prediction = score_and_store(flow)
    return {"status": "success", "data": saved, "prediction": prediction}


@app.patch("/api/alerts/{alert_id}/ack")
def ack_alert(alert_id: int):
    updated = acknowledge_alert(alert_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Alert not found")
    return updated


@app.post("/api/alerts/{alert_id}/block")
def block_alert(alert_id: int):
    updated = block_alert_ip(alert_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Alert not found")
    return updated


@app.get("/api/blocked")
def read_blocked():
    return get_blocked_ips()


def _rand_host():
    return f"185.220.{random.randint(1, 200)}.{random.randint(1, 254)}"


@app.post("/api/simulate")
def simulate_traffic(body: SimulateRequest):
    scenario = (body.scenario or "").strip().lower()
    dst = "192.168.1.100"
    payloads = []
    if scenario in ("https", "normal", "clean"):
        src = f"10.4.{random.randint(0, 20)}.{random.randint(2, 250)}"
        payloads.append(
            Flow(
                source_ip=src,
                destination_ip=dst,
                source_port=random.randint(40000, 62000),
                destination_port=443,
                protocol="TCP",
                packet_count=32,
                byte_count=32 * 780,
                duration_seconds=4.8,
                packets_per_second=6.67,
                bytes_per_second=5200,
            )
        )
    elif scenario in ("scan", "syn", "probe"):
        src = _rand_host()
        for port in (22, 80, 443, 3389):
            payloads.append(
                Flow(
                    source_ip=src,
                    destination_ip=dst,
                    source_port=random.randint(40000, 62000),
                    destination_port=port,
                    protocol="TCP",
                    packet_count=2,
                    byte_count=128,
                    duration_seconds=0.12,
                    packets_per_second=16.7,
                    bytes_per_second=1066,
                )
            )
    elif scenario in ("flood", "ddos"):
        payloads.append(
            Flow(
                source_ip=_rand_host(),
                destination_ip=dst,
                source_port=52140,
                destination_port=80,
                protocol="TCP",
                packet_count=95000,
                byte_count=145000000,
                duration_seconds=0.1,
                packets_per_second=950000,
                bytes_per_second=1450000000,
            )
        )
    else:
        raise HTTPException(status_code=400, detail="Unknown scenario. Use https, scan, or flood.")

    results = []
    threats = 0
    for flow in payloads:
        saved, prediction = score_and_store(flow)
        if prediction.get("is_malicious"):
            threats += 1
        results.append({"flow": saved, "prediction": prediction})

    last = results[-1]["prediction"]
    return {
        "status": "success",
        "scenario": scenario,
        "summary": {
            "flows": len(results),
            "threat_count": threats,
            "clean_count": len(results) - threats,
        },
        "prediction": last,
        "results": results,
    }


@app.delete("/api/data")
def wipe_data():
    return clear_all()


@app.post("/api/analyze-pcap")
async def analyze_pcap(file: UploadFile = File(...)):
    if not extract_flows:
        raise HTTPException(status_code=501, detail="PCAP flow extractor not available")
    name = file.filename or "capture.pcap"
    if not name.endswith((".pcap", ".pcapng")):
        raise HTTPException(status_code=400, detail="Only .pcap and .pcapng files are supported.")

    temp_dir = os.path.join(ROOT, "data", "temp")
    os.makedirs(temp_dir, exist_ok=True)
    temp_path = os.path.join(temp_dir, os.path.basename(name))

    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        records = extract_flows(temp_path)
        if not records:
            raise HTTPException(status_code=400, detail="No IP flows detected in capture.")

        analyzed = []
        threats_found = 0
        for item in records:
            flow = flow_from_record(item)
            saved, pred = score_and_store(flow)
            row = {**saved, **pred}
            if pred.get("is_malicious"):
                threats_found += 1
            analyzed.append(row)

        return {
            "summary": {
                "total_flows": len(analyzed),
                "total_packets": sum(r.get("packet_count", 0) for r in analyzed),
                "threat_count": threats_found,
                "clean_count": len(analyzed) - threats_found,
            },
            "results": analyzed[:200],
        }
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)
