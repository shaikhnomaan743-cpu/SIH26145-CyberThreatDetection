from datetime import datetime
from typing import Optional
from pydantic import BaseModel

# Schema representing a network flow record
class Flow(BaseModel):
    id: Optional[int] = None
    timestamp: datetime
    source_ip: str
    destination_ip: str
    source_port: int
    destination_port: int
    protocol: str
    packet_count: int
    byte_count: int
    duration_seconds: float

# Schema representing a cybersecurity alert
class Alert(BaseModel):
    id: Optional[int] = None
    flow_id: int
    alert_type: str
    severity: str
    description: str
    timestamp: datetime