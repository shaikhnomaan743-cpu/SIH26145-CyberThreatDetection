import os
import time
from datetime import datetime
import requests
from scapy.all import IP, TCP, UDP, conf, sniff

API_URL = os.environ.get("THREX_API_URL", "http://127.0.0.1:8000/api/flows")

# Global dictionary to track live connections/flows in memory
# Key: (src_ip, dst_ip, src_port, dst_port, protocol)
flow_cache = {}

# Time window (in seconds) to consider a flow complete and ready to send
FLOW_TIMEOUT = 5.0  


def get_protocol_name(proto_num):
    protocols = {6: "TCP", 17: "UDP", 1: "ICMP"}
    return protocols.get(proto_num, f"OTHER({proto_num})")


def process_packet(packet):
    """Callback function executed every time a live packet is captured."""
    if not packet.haslayer(IP):
        return  # Ignore non-IP traffic (e.g., ARP, IPv6)

    ip_layer = packet[IP]
    src_ip = ip_layer.src
    dst_ip = ip_layer.dst
    proto_num = ip_layer.proto
    protocol = get_protocol_name(proto_num)
    length = len(packet)

    src_port = 0
    dst_port = 0

    if packet.haslayer(TCP):
        src_port = packet[TCP].sport
        dst_port = packet[TCP].dport
    elif packet.haslayer(UDP):
        src_port = packet[UDP].sport
        dst_port = packet[UDP].dport

    # Construct unique key for this flow stream
    flow_key = (src_ip, dst_ip, src_port, dst_port, protocol)
    current_time = time.time()

    if flow_key not in flow_cache:
        flow_cache[flow_key] = {
            "start_time": current_time,
            "last_seen": current_time,
            "packet_count": 1,
            "byte_count": length,
        }
    else:
        flow = flow_cache[flow_key]
        flow["last_seen"] = current_time
        flow["packet_count"] += 1
        flow["byte_count"] += length

    # Flush inactive flows that haven't received packets in FLOW_TIMEOUT seconds
    flush_expired_flows(current_time)


def flush_expired_flows(current_time):
    """Sends completed flow metrics to Render backend and clears them from memory."""
    expired_keys = []

    for flow_key, flow in flow_cache.items():
        if current_time - flow["last_seen"] >= FLOW_TIMEOUT:
            expired_keys.append(flow_key)

    for flow_key in expired_keys:
        flow = flow_cache.pop(flow_key)
        src_ip, dst_ip, src_port, dst_port, protocol = flow_key

        duration = max(flow["last_seen"] - flow["start_time"], 0.001)
        pps = flow["packet_count"] / duration
        bps = flow["byte_count"] / duration

        payload = {
            "timestamp": datetime.now().isoformat(),
            "source_ip": src_ip,
            "destination_ip": dst_ip,
            "source_port": src_port,
            "destination_port": dst_port,
            "protocol": protocol,
            "packet_count": flow["packet_count"],
            "byte_count": flow["byte_count"],
            "duration_seconds": round(duration, 4),
            "packets_per_second": round(pps, 2),
            "bytes_per_second": round(bps, 2),
        }

        # Send flow payload directly to Render API
        try:
            res = requests.post(API_URL, json=payload, timeout=3)
            print(
                f"[LIVE FLOW] {src_ip}:{src_port} -> {dst_ip}:{dst_port} | "
                f"Proto: {protocol} | Pkts: {flow['packet_count']} | Status: {res.status_code}"
            )
        except Exception as e:
            print(f"[ERROR] Failed to send live flow: {e}")


def start_live_sniffing():
    print(f"[*] Starting live traffic capture on default interface: {conf.iface.name}")
    print(f"[*] Streaming aggregated flows to: {API_URL}")
    print("[*] Press CTRL+C to stop sniffing...\n")

    try:
        # Sniff continuously on default network interface
        sniff(iface=conf.iface, prn=process_packet, store=False)
    except KeyboardInterrupt:
        print("\n[*] Sniffing stopped by user.")


if __name__ == "__main__":
    start_live_sniffing()