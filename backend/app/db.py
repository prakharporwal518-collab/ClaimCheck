"""Database models. Evidence file bytes are stored in the database so the web
service and the Render Workflow workers (separate machines) see the same files."""

from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
    create_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

from .config import settings


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


_url = settings.database_url
# Render gives postgres://...; SQLAlchemy 2.1 maps plain postgresql:// to the psycopg 3 driver,
# so name the driver we install (psycopg2-binary) explicitly.
for prefix in ("postgres://", "postgresql://"):
    if _url.startswith(prefix):
        _url = "postgresql+psycopg2://" + _url[len(prefix):]
        break
_connect_args = {"check_same_thread": False} if _url.startswith("sqlite") else {}
engine = create_engine(_url, connect_args=_connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class Dispute(Base):
    __tablename__ = "disputes"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # PayPal dispute_id
    source: Mapped[str] = mapped_column(String(16), default="mock")  # mock | sandbox
    reason: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(48))
    stage: Mapped[str] = mapped_column(String(32), default="INQUIRY")
    amount: Mapped[float] = mapped_column(Float)
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    buyer_name: Mapped[str] = mapped_column(Text, default="")
    buyer_email: Mapped[str] = mapped_column(Text, default="")
    buyer_message: Mapped[str] = mapped_column(Text, default="")
    messages: Mapped[list] = mapped_column(JSON, default=list)
    shipping_address: Mapped[dict] = mapped_column(JSON, default=dict)
    item_title: Mapped[str] = mapped_column(Text, default="")
    order_id: Mapped[str] = mapped_column(String(128), default="")
    transaction_id: Mapped[str] = mapped_column(String(128), default="")
    deadline: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    # ClaimCheck workflow state
    analysis_state: Mapped[str] = mapped_column(String(16), default="idle")  # idle|queued|running|done|error
    analysis_engine: Mapped[str] = mapped_column(String(32), default="")  # in-process | render-workflows
    analysis_run_id: Mapped[str] = mapped_column(Text, default="")
    analysis_error: Mapped[str] = mapped_column(Text, default="")
    decision: Mapped[str] = mapped_column(String(16), default="open")  # open|submitted|refunded
    outcome: Mapped[str] = mapped_column(String(16), default="")  # won|lost|"" (from RESOLVED)
    response_minutes: Mapped[float | None] = mapped_column(Float, nullable=True)
    sample_set: Mapped[str] = mapped_column(String(32), default="")
    raw: Mapped[dict] = mapped_column(JSON, default=dict)

    evidence: Mapped[list["Evidence"]] = relationship(
        back_populates="dispute", cascade="all, delete-orphan", order_by="Evidence.id"
    )
    analyses: Mapped[list["Analysis"]] = relationship(
        back_populates="dispute", cascade="all, delete-orphan", order_by="Analysis.id"
    )


class Evidence(Base):
    __tablename__ = "evidence"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    dispute_id: Mapped[str] = mapped_column(ForeignKey("disputes.id"))
    filename: Mapped[str] = mapped_column(Text)
    mime: Mapped[str] = mapped_column(String(64))
    size: Mapped[int] = mapped_column(Integer)
    data: Mapped[bytes] = mapped_column(LargeBinary, deferred=True)
    tag: Mapped[str] = mapped_column(String(32), default="Other")  # Invoice|Tracking|Chat|Delivery photo|Order|Other
    state: Mapped[str] = mapped_column(String(16), default="pending")  # pending|done|error
    text_masked: Mapped[str] = mapped_column(Text, default="")
    ocr_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    sent_to_vision: Mapped[bool] = mapped_column(Boolean, default=False)
    extractor: Mapped[str] = mapped_column(Text, default="")
    facts: Mapped[list] = mapped_column(JSON, default=list)
    integrity: Mapped[dict] = mapped_column(JSON, default=dict)
    pii_map: Mapped[dict] = mapped_column(JSON, default=dict)  # placeholder -> real value (server only)
    error: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    dispute: Mapped[Dispute] = relationship(back_populates="evidence")


class Analysis(Base):
    __tablename__ = "analyses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    dispute_id: Mapped[str] = mapped_column(ForeignKey("disputes.id"))
    facts: Mapped[list] = mapped_column(JSON, default=list)
    claims: Mapped[list] = mapped_column(JSON, default=list)
    results: Mapped[list] = mapped_column(JSON, default=list)
    gaps: Mapped[list] = mapped_column(JSON, default=list)
    integrity: Mapped[dict] = mapped_column(JSON, default=dict)
    report_text: Mapped[str] = mapped_column(Text, default="")  # AI draft (kept for audit)
    report_final: Mapped[str] = mapped_column(Text, default="")  # merchant-edited version
    strength_label: Mapped[str] = mapped_column(String(16), default="")
    strength_score: Mapped[int] = mapped_column(Integer, default=0)
    strength_line: Mapped[str] = mapped_column(Text, default="")
    score_breakdown: Mapped[list] = mapped_column(JSON, default=list)
    recommendation: Mapped[dict] = mapped_column(JSON, default=dict)
    engine: Mapped[str] = mapped_column(Text, default="")
    steps: Mapped[list] = mapped_column(JSON, default=list)
    cache_key: Mapped[str] = mapped_column(String(64), default="")
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    dispute: Mapped[Dispute] = relationship(back_populates="analyses")


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    dispute_id: Mapped[str] = mapped_column(String(64), index=True)
    action: Mapped[str] = mapped_column(String(48))
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class MerchantSettings(Base):
    """The merchant's own details. Never masked, because PayPal needs them as evidence."""

    __tablename__ = "merchant_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    business_name: Mapped[str] = mapped_column(String(128), default="Voltway Electronics")
    business_address: Mapped[str] = mapped_column(String(256), default="14 MG Road, Bengaluru 560001")
    support_email: Mapped[str] = mapped_column(String(128), default="support@voltway.example")
    website: Mapped[str] = mapped_column(String(128), default="voltway.example")
    support_name: Mapped[str] = mapped_column(String(64), default="Voltway Support")


class LlmCache(Base):
    __tablename__ = "llm_cache"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    model: Mapped[str] = mapped_column(Text)
    response: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class PromptLog(Base):
    """Every prompt sent to an LLM, so the PII-leak test can scan them."""

    __tablename__ = "prompt_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    dispute_id: Mapped[str] = mapped_column(String(64), default="")
    step: Mapped[str] = mapped_column(String(32))
    model: Mapped[str] = mapped_column(Text)
    prompt: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


def init_db() -> None:
    Base.metadata.create_all(engine)
    with SessionLocal() as s:
        if not s.get(MerchantSettings, 1):
            s.add(MerchantSettings(id=1))
            s.commit()


def get_merchant(s) -> MerchantSettings:
    m = s.get(MerchantSettings, 1)
    if not m:
        m = MerchantSettings(id=1)
        s.add(m)
        s.commit()
    return m


def audit(s, dispute_id: str, action: str, **detail) -> None:
    s.add(AuditLog(dispute_id=dispute_id, action=action, detail=detail))
