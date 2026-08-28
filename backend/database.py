from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime

DATABASE_URL = "sqlite:///./backend/backend.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Database Table for Network Flows
class DBFlow(Base):
    __tablename__ = "flows"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    source_ip = Column(String)
    destination_ip = Column(String)
    source_port = Column(Integer)
    destination_port = Column(Integer)
    protocol = Column(String)
    packet_count = Column(Integer)
    byte_count = Column(Integer)
    duration_seconds = Column(Float)

# Database Table for Alerts
class DBAlert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    flow_id = Column(Integer)
    alert_type = Column(String)
    severity = Column(String)
    description = Column(String)
    timestamp = Column(DateTime, default=datetime.utcnow)

def init_db():
    Base.metadata.create_all(bind=engine)

def insert_flow(flow_data):
    db = SessionLocal()
    db_flow = DBFlow(
        timestamp=flow_data.timestamp,
        source_ip=flow_data.source_ip,
        destination_ip=flow_data.destination_ip,
        source_port=flow_data.source_port,
        destination_port=flow_data.destination_port,
        protocol=flow_data.protocol,
        packet_count=flow_data.packet_count,
        byte_count=flow_data.byte_count,
        duration_seconds=flow_data.duration_seconds,
    )
    db.add(db_flow)
    db.commit()
    db.refresh(db_flow)
    db.close()
    return db_flow

def get_all_flows():
    db = SessionLocal()
    flows = db.query(DBFlow).all()
    db.close()
    return flows

def get_all_alerts():
    db = SessionLocal()
    alerts = db.query(DBAlert).all()
    db.close()
    return alerts