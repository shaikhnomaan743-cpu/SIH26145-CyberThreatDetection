# THREX AI — Predictive Network Defense (SIH 26145)

Local SOC console: capture or upload traffic, score flows with Isolation Forest, store alerts in SQLite, and operate the dashboard.

## Stack

- **API:** FastAPI + SQLite (`backend/`)
- **Model:** Isolation Forest on flow rates (`ml/`)
- **UI:** React (Create React App) (`frontend/`)
- **Ingest:** PCAP aggregation, CSV replay, live sniffer (`network/`)

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cd frontend && npm install && cd ..
```

Retrain (optional; artifacts are already in `ml/`):

```bash
python ml/generate_training_data.py
python ml/preprocess.py
python ml/train_model.py
```

## Run

Terminal 1 — API (from repo root):

```bash
source .venv/bin/activate
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Terminal 2 — UI:

```bash
cd frontend
npm start
```

Open http://localhost:3000

**Login:** `admin` / `threx`  
Override with env `THREX_USER` and `THREX_PASSWORD`.

## What each control does

- **Upload PCAP** — aggregates packets into flows, scores, writes SQLite, dashboard updates.
- **Test ML Threat** — injects a volumetric outlier so you can see an alert end-to-end.
- **Sidebar** — Overview, Real-time Monitor, Alerts, Reports, Traffic Analysis, Threat Intelligence, Settings.
- **Search** — filters the visible tables (IP, port, protocol, type).
- **Time range** — Live Session / Last 24 Hours / Last 7 Days filter charts and tables.
- **Bell** — unread (unacknowledged) alerts; opens Alerts.
- **Acknowledge** — marks an alert read.
- **Reports** — download CSV or JSON for the current window.
- **Settings** — engine health, poll interval, clear database, logout.
- **Live sniffer** (root/pcap permission):

```bash
export THREX_API_URL=http://127.0.0.1:8000/api/flows
sudo python network/live_sniffer.py
```

CSV replay:

```bash
python network/send_flows.py data/flows.csv
```

## Notes

- Detection is unsupervised (anomaly vs baseline) plus port/rate rules for threat type labels.
- The world map places observed source IPs on a schematic; it is not a geo-IP product.
- Live sniffing requires permission to open the network interface.
