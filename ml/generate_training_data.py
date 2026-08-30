"""Build a normal-traffic corpus for Isolation Forest training."""
import os
import random
from datetime import datetime, timedelta

import pandas as pd

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_PATH = os.path.normpath(os.path.join(BASE_DIR, "..", "data", "flows.csv"))

random.seed(42)

WEB_PORTS = [80, 443, 8080]
DNS_PORT = 53
MAIL_PORTS = [25, 587]
OTHER_OK = [22, 123, 993, 445]


def rand_ip(private=True):
    if private:
        return f"10.{random.randint(0, 20)}.{random.randint(0, 255)}.{random.randint(1, 254)}"
    return f"{random.randint(1, 200)}.{random.randint(0, 255)}.{random.randint(0, 255)}.{random.randint(1, 254)}"


def row(ts, sport, dport, proto, pkts, nbytes, dur, src=None, dst=None):
    dur = max(dur, 0.05)
    return {
        "timestamp": ts.isoformat(),
        "source_ip": src or rand_ip(),
        "destination_ip": dst or rand_ip(False),
        "source_port": sport,
        "destination_port": dport,
        "protocol": proto,
        "packet_count": pkts,
        "byte_count": nbytes,
        "duration_seconds": round(dur, 4),
        "packets_per_second": round(pkts / dur, 4),
        "bytes_per_second": round(nbytes / dur, 4),
    }


def main(n_normal=4000):
    start = datetime(2026, 8, 1, 8, 0, 0)
    rows = []
    for i in range(n_normal):
        ts = start + timedelta(seconds=i * 12 + random.randint(0, 8))
        kind = random.random()
        sport = random.randint(1024, 65000)
        if kind < 0.55:
            dport = random.choice(WEB_PORTS)
            proto = "TCP"
            pkts = random.randint(4, 90)
            nbytes = pkts * random.randint(200, 1400)
            dur = random.uniform(0.4, 18.0)
        elif kind < 0.78:
            dport = DNS_PORT
            proto = "UDP"
            pkts = random.randint(2, 8)
            nbytes = pkts * random.randint(60, 220)
            dur = random.uniform(0.05, 1.2)
        elif kind < 0.9:
            dport = random.choice(MAIL_PORTS + OTHER_OK)
            proto = "TCP"
            pkts = random.randint(6, 40)
            nbytes = pkts * random.randint(180, 900)
            dur = random.uniform(0.8, 12.0)
        else:
            dport = 443
            proto = "UDP"
            pkts = random.randint(8, 60)
            nbytes = pkts * random.randint(250, 1100)
            dur = random.uniform(0.5, 10.0)
        rows.append(row(ts, sport, dport, proto, pkts, nbytes, dur))

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    pd.DataFrame(rows).to_csv(OUT_PATH, index=False)
    print(f"Wrote {len(rows)} normal flows to {OUT_PATH}")


if __name__ == "__main__":
    main()
