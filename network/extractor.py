import pyshark
import pandas as pd

def extract_features_from_pcap(pcap_path: str) -> pd.DataFrame:
    """Extracts packet-level and flow-level statistical features from PCAP."""
    cap = pyshark.FileCapture(pcap_path, keep_packets=False)
    records = []

    for pkt in cap:
        try:
            if "IP" in pkt:
                src_ip = pkt.ip.src
                dst_ip = pkt.ip.dst
                proto = int(pkt.ip.proto)
                length = int(pkt.length)
                
                # Extract transport layer info if present
                sport = int(pkt[pkt.transport_layer].srcport) if hasattr(pkt, 'transport_layer') and pkt.transport_layer else 0
                dport = int(pkt[pkt.transport_layer].dstport) if hasattr(pkt, 'transport_layer') and pkt.transport_layer else 0
                
                records.append({
                    "src_ip": src_ip,
                    "dst_ip": dst_ip,
                    "src_port": sport,
                    "dst_port": dport,
                    "protocol": proto,
                    "packet_length": length,
                    "timestamp": float(pkt.sniff_timestamp)
                })
        except AttributeError:
            continue
            
    cap.close()
    return pd.DataFrame(records)