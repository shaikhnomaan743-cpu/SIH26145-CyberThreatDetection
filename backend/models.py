from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class Flow(BaseModel):
    id: Optional[int] = None
    timestamp: datetime = Field(default_factory=datetime.now)
    source_ip: str
    destination_ip: str
    source_port: int
    destination_port: int
    protocol: str
    packet_count: int
    byte_count: int
    duration_seconds: float
    packets_per_second: Optional[float] = 0.0
    bytes_per_second: Optional[float] = 0.0
    is_malicious: Optional[bool] = None
    confidence: Optional[float] = None
    threat_type: Optional[str] = None

    def calculate_rates(self):
        dur = max(self.duration_seconds, 0.001)
        if not self.packets_per_second:
            self.packets_per_second = round(self.packet_count / dur, 2)
        if not self.bytes_per_second:
            self.bytes_per_second = round(self.byte_count / dur, 2)


class Alert(BaseModel):
    id: Optional[int] = None
    flow_id: Optional[int] = None
    time: str = Field(default_factory=lambda: datetime.now().strftime("%I:%M:%S %p"))
    source_ip: str
    destination_ip: str
    port: int
    protocol: str
    threat_type: str = "Anomaly Detected"
    severity: str = "High"
    confidence: Optional[float] = 1.0
    description: Optional[str] = None
    acknowledged: Optional[bool] = False
    blocked: Optional[bool] = False


class LoginRequest(BaseModel):
    username: str
    password: str


class SimulateRequest(BaseModel):
    scenario: str = "flood"
