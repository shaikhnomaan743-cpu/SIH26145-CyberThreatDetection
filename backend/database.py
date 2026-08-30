import os
from contextlib import contextmanager
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    Integer,
    String,
    create_engine,
    text,
)
from sqlalchemy.orm import declarative_base, sessionmaker

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "backend.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


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
    packets_per_second = Column(Float, default=0.0)
    bytes_per_second = Column(Float, default=0.0)
    is_malicious = Column(Boolean, default=False)
    confidence = Column(Float, default=0.0)
    threat_type = Column(String, default="Clean Traffic")


class DBAlert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    flow_id = Column(Integer, nullable=True)
    time = Column(String, default=lambda: datetime.now().strftime("%I:%M:%S %p"))
    source_ip = Column(String)
    destination_ip = Column(String)
    port = Column(Integer)
    protocol = Column(String)
    threat_type = Column(String)
    severity = Column(String)
    confidence = Column(Float, default=1.0)
    description = Column(String, nullable=True)
    acknowledged = Column(Boolean, default=False)
    blocked = Column(Boolean, default=False)
    timestamp = Column(DateTime, default=datetime.utcnow)


class DBBlock(Base):
    __tablename__ = "blocked_ips"

    id = Column(Integer, primary_key=True, index=True)
    ip = Column(String, unique=True, index=True)
    reason = Column(String, nullable=True)
    alert_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


@contextmanager
def session_scope():
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _add_column(table, column, spec):
    with engine.begin() as conn:
        rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
        existing = {row[1] for row in rows}
        if column not in existing:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {spec}"))


def init_db():
    Base.metadata.create_all(bind=engine)
    _add_column("flows", "packets_per_second", "FLOAT DEFAULT 0")
    _add_column("flows", "bytes_per_second", "FLOAT DEFAULT 0")
    _add_column("flows", "is_malicious", "BOOLEAN DEFAULT 0")
    _add_column("flows", "confidence", "FLOAT DEFAULT 0")
    _add_column("flows", "threat_type", "VARCHAR DEFAULT 'Clean Traffic'")
    _add_column("alerts", "description", "VARCHAR")
    _add_column("alerts", "acknowledged", "BOOLEAN DEFAULT 0")
    _add_column("alerts", "blocked", "BOOLEAN DEFAULT 0")


def flow_to_dict(flow):
    ts = flow.timestamp
    return {
        "id": flow.id,
        "timestamp": ts.isoformat() if ts else None,
        "source_ip": flow.source_ip,
        "destination_ip": flow.destination_ip,
        "source_port": flow.source_port,
        "destination_port": flow.destination_port,
        "protocol": flow.protocol,
        "packet_count": flow.packet_count,
        "byte_count": flow.byte_count,
        "duration_seconds": flow.duration_seconds,
        "packets_per_second": flow.packets_per_second or 0,
        "bytes_per_second": flow.bytes_per_second or 0,
        "is_malicious": bool(flow.is_malicious),
        "confidence": flow.confidence or 0,
        "threat_type": flow.threat_type or "Clean Traffic",
    }


def alert_to_dict(alert):
    ts = alert.timestamp
    return {
        "id": alert.id,
        "flow_id": alert.flow_id,
        "time": alert.time,
        "source_ip": alert.source_ip,
        "destination_ip": alert.destination_ip,
        "port": alert.port,
        "protocol": alert.protocol,
        "threat_type": alert.threat_type,
        "severity": alert.severity,
        "confidence": alert.confidence or 0,
        "description": alert.description,
        "acknowledged": bool(alert.acknowledged),
        "blocked": bool(getattr(alert, "blocked", False)),
        "timestamp": ts.isoformat() if ts else None,
    }


def insert_flow(flow_data, prediction=None):
    prediction = prediction or {}
    ts = getattr(flow_data, "timestamp", datetime.utcnow())
    if isinstance(ts, str):
        try:
            ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except ValueError:
            ts = datetime.utcnow()

    with session_scope() as db:
        db_flow = DBFlow(
            timestamp=ts if isinstance(ts, datetime) else datetime.utcnow(),
            source_ip=flow_data.source_ip,
            destination_ip=flow_data.destination_ip,
            source_port=flow_data.source_port,
            destination_port=flow_data.destination_port,
            protocol=flow_data.protocol,
            packet_count=flow_data.packet_count,
            byte_count=flow_data.byte_count,
            duration_seconds=flow_data.duration_seconds,
            packets_per_second=getattr(flow_data, "packets_per_second", 0) or 0,
            bytes_per_second=getattr(flow_data, "bytes_per_second", 0) or 0,
            is_malicious=bool(prediction.get("is_malicious", False)),
            confidence=prediction.get("confidence", 0) or 0,
            threat_type=prediction.get("threat_type", "Clean Traffic"),
        )
        db.add(db_flow)
        db.flush()
        db.refresh(db_flow)
        return flow_to_dict(db_flow)


def insert_alert(alert_data, flow_id=None):
    with session_scope() as db:
        db_alert = DBAlert(
            flow_id=flow_id if flow_id is not None else getattr(alert_data, "flow_id", None),
            time=getattr(alert_data, "time", datetime.now().strftime("%I:%M:%S %p")),
            source_ip=alert_data.source_ip,
            destination_ip=alert_data.destination_ip,
            port=getattr(alert_data, "port", 80),
            protocol=getattr(alert_data, "protocol", "TCP"),
            threat_type=getattr(alert_data, "threat_type", "Anomaly Detected"),
            severity=getattr(alert_data, "severity", "High"),
            confidence=getattr(alert_data, "confidence", 1.0),
            description=getattr(alert_data, "description", None),
            acknowledged=False,
        )
        db.add(db_alert)
        db.flush()
        db.refresh(db_alert)
        return alert_to_dict(db_alert)


def get_all_flows():
    db = SessionLocal()
    try:
        flows = db.query(DBFlow).order_by(DBFlow.id.desc()).all()
        return [flow_to_dict(f) for f in flows]
    finally:
        db.close()


def get_all_alerts():
    db = SessionLocal()
    try:
        alerts = db.query(DBAlert).order_by(DBAlert.id.desc()).all()
        return [alert_to_dict(a) for a in alerts]
    finally:
        db.close()


def acknowledge_alert(alert_id):
    with session_scope() as db:
        alert = db.query(DBAlert).filter(DBAlert.id == alert_id).first()
        if not alert:
            return None
        alert.acknowledged = True
        db.flush()
        db.refresh(alert)
        return alert_to_dict(alert)


def block_alert_ip(alert_id):
    with session_scope() as db:
        alert = db.query(DBAlert).filter(DBAlert.id == alert_id).first()
        if not alert:
            return None
        existing = db.query(DBBlock).filter(DBBlock.ip == alert.source_ip).first()
        if not existing:
            db.add(DBBlock(ip=alert.source_ip, reason=alert.threat_type, alert_id=alert.id))
        alert.blocked = True
        db.flush()
        db.refresh(alert)
        return alert_to_dict(alert)


def get_blocked_ips():
    db = SessionLocal()
    try:
        rows = db.query(DBBlock).order_by(DBBlock.id.desc()).all()
        return [
            {
                "id": row.id,
                "ip": row.ip,
                "reason": row.reason,
                "alert_id": row.alert_id,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in rows
        ]
    finally:
        db.close()


def clear_all():
    with session_scope() as db:
        db.query(DBAlert).delete()
        db.query(DBFlow).delete()
        db.query(DBBlock).delete()
    return {"flows": 0, "alerts": 0, "blocked": 0}
