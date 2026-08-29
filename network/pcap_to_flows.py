import sys
import pandas as pd
from collections import defaultdict
from scapy.all import rdpcap, IP, TCP, UDP

def get_protocol_name(proto_num):
    """Maps common IP protocol numbers to string names."""
    protocols = {6: 'TCP', 17: 'UDP', 1: 'ICMP'}
    return protocols.get(proto_num, str(proto_num))

def extract_flows(pcap_path):
    """
    Reads a PCAP file and groups packets into bidirectional 5-tuple flows.
    Extracts timing, volume, and rate features for ML training.
    """
    # Dictionary to aggregate statistics per 5-tuple flow key
    flows = defaultdict(lambda: {
        'timestamps': [],
        'packet_count': 0,
        'byte_count': 0
    })

    print(f"Reading PCAP file from {pcap_path}...")
    packets = rdpcap(pcap_path)

    # Process each packet in the PCAP file
    for packet in packets:
        # We only care about IP packets (TCP/UDP)
        if IP in packet:
            ip_src = packet[IP].src
            ip_dst = packet[IP].dst
            proto = packet[IP].proto
            pkt_len = len(packet[IP])
            pkt_time = float(packet.time)

            src_port = 0
            dst_port = 0

            if TCP in packet:
                src_port = packet[TCP].sport
                dst_port = packet[TCP].dport
            elif UDP in packet:
                src_port = packet[UDP].sport
                dst_port = packet[UDP].dport

            # Canonical key creation ensures bidirectional packets fall under the same flow key
            if (ip_src, src_port) < (ip_dst, dst_port):
                flow_key = (ip_src, ip_dst, src_port, dst_port, proto)
            else:
                flow_key = (ip_dst, ip_src, dst_port, src_port, proto)

            flows[flow_key]['timestamps'].append(pkt_time)
            flows[flow_key]['packet_count'] += 1
            flows[flow_key]['byte_count'] += pkt_len

    # Calculate final summary statistics for each flow
    flow_list = []
    for key, data in flows.items():
        src_ip, dst_ip, src_port, dst_port, proto_num = key
        
        start_time = min(data['timestamps'])
        end_time = max(data['timestamps'])
        duration = end_time - start_time
        pkt_cnt = data['packet_count']
        byte_cnt = data['byte_count']

        # Prevent division by zero for single-packet flows or instantaneous flows
        if duration > 0:
            pps = pkt_cnt / duration
            bps = byte_cnt / duration
        else:
            pps = 0.0
            bps = 0.0

        flow_dict = {
            'timestamp': start_time,
            'source_ip': src_ip,
            'destination_ip': dst_ip,
            'source_port': src_port,
            'destination_port': dst_port,
            'protocol': get_protocol_name(proto_num),
            'packet_count': pkt_cnt,
            'byte_count': byte_cnt,
            'duration_seconds': round(duration, 6),
            'packets_per_second': round(pps, 4),
            'bytes_per_second': round(bps, 4)
        }
        flow_list.append(flow_dict)

    return flow_list

def save_flows_to_csv(flow_list, output_csv):
    """Converts flow data list to a DataFrame and saves it as CSV."""
    df = pd.DataFrame(flow_list)
    df.to_csv(output_csv, index=False)
    print(f"Successfully exported {len(df)} flow records to '{output_csv}'.")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python network/pcap_to_flows.py <path_to_pcap> <output_csv_path>")
        sys.exit(1)

    pcap_input = sys.argv[1]
    csv_output = sys.argv[2]

    flows = extract_flows(pcap_input)
    save_flows_to_csv(flows, csv_output)