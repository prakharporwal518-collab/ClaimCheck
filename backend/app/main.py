"""ClaimCheck API."""

from __future__ import annotations

import csv
import io
import json
import logging
import re
import threading
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import runner, sample_gen, sync
from .config import BACKEND_DIR, SAMPLE_DIR, settings
from .db import (
    Analysis,
    AuditLog,
    Base,
    Dispute,
    Evidence,
    SessionLocal,
    audit,
    engine,
    get_merchant,
    init_db,
)
from .paypal import mock_data
from .paypal.client import PayPalError, enabled_sources, get_client, reset_mock_client
from .pipeline import extract as extract_mod
from .pipeline import llm
from .pipeline.analyse import extract_group, plan_groups
from .pipeline.playbooks import PLAYBOOKS, get_playbook
from .report_pdf import build_pdf

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("claimcheck")

app = FastAPI(title="ClaimCheck API", version="1.0.0",
              description="AI dispute defence for PayPal merchants (PayPal AI Hackathon 2026)")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins + ["http://localhost:4173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

ALLOWED_MIME = {"application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg"}
TAGS = ["Invoice", "Tracking", "Chat", "Delivery photo", "Order", "Other"]
SAMPLE_SETS = {
    "strong": [("tracking.pdf", "Tracking"), ("chat.png", "Chat"), ("delivery_photo.jpg", "Delivery photo"),
               ("invoice.pdf", "Invoice")],
    "weak": [("tracking.pdf", "Tracking"), ("invoice.pdf", "Invoice")],
    "buyer_right": [("tracking.pdf", "Tracking"), ("invoice.pdf", "Invoice")],
}


@app.on_event("startup")
def _startup() -> None:
    init_db()
    with SessionLocal() as s:
        # An in-process run can't survive a restart: don't leave it "Drafting..." forever.
        # (Render Workflow runs live on their own machines and are left alone.)
        for d in s.query(Dispute).filter(Dispute.analysis_state.in_(["queued", "running"]),
                                         Dispute.analysis_engine != "render-workflows"):
            d.analysis_state = "error"
            d.analysis_error = "Interrupted by a server restart. Press Re-run AI Defence."
        s.commit()
    with SessionLocal() as s:
        if s.query(Dispute).count() == 0:
            # Wrong PayPal keys must not stop the app from starting: errors are per source.
            for src, r in sync.sync_sources(s, enabled_sources()).items():
                if "error" in r:
                    log.error("Could not sync %s disputes at startup: %s", src, r["error"])


# ---------------------------------------------------------------------------
# Serialisers
# ---------------------------------------------------------------------------
def days_left(d: Dispute) -> float | None:
    if not d.deadline:
        return None
    return round((d.deadline - datetime.utcnow()).total_seconds() / 86400, 1)


def latest_analysis(d: Dispute) -> Analysis | None:
    return d.analyses[-1] if d.analyses else None


def dispute_row(d: Dispute) -> dict:
    a = latest_analysis(d)
    return {
        "id": d.id,
        "source": d.source,
        "buyer": d.buyer_name,
        "amount": d.amount,
        "currency": d.currency,
        "reason": d.reason,
        "reason_label": get_playbook(d.reason)["label"],
        "status": d.status,
        "stage": d.stage,
        "item": d.item_title,
        "deadline": d.deadline.isoformat() + "Z" if d.deadline else None,
        "days_left": days_left(d),
        "created_at": d.created_at.isoformat() + "Z" if d.created_at else None,
        "score": a.strength_score if a else None,
        "label": a.strength_label if a else None,
        "recommendation": (a.recommendation or {}).get("action") if a else None,
        "analysis_state": d.analysis_state,
        "decision": d.decision,
        "outcome": d.outcome,
        "evidence_count": len(d.evidence),
        "sample_set": d.sample_set,
    }


def evidence_json(e: Evidence) -> dict:
    return {
        "id": e.id,
        "filename": e.filename,
        "mime": e.mime,
        "size": e.size,
        "tag": e.tag,
        "state": e.state,
        "ocr_confidence": e.ocr_confidence,
        "sent_to_vision": e.sent_to_vision,
        "extractor": e.extractor,
        "facts": e.facts or [],
        "integrity": e.integrity or {},
        "error": e.error,
        "text_preview": (e.text_masked or "")[:600],
        "created_at": e.created_at.isoformat() + "Z",
    }


def analysis_json(a: Analysis | None) -> dict | None:
    if not a:
        return None
    return {
        "id": a.id,
        "facts": a.facts,
        "claims": a.claims,
        "results": a.results,
        "gaps": a.gaps,
        "integrity": a.integrity,
        "report_text": a.report_text,
        "report_final": a.report_final,
        "strength_label": a.strength_label,
        "strength_score": a.strength_score,
        "strength_line": a.strength_line,
        "score_breakdown": a.score_breakdown,
        "recommendation": a.recommendation,
        "engine": a.engine,
        "steps": a.steps,
        "duration_ms": a.duration_ms,
        "created_at": a.created_at.isoformat() + "Z",
    }


def _get(s, dispute_id: str) -> Dispute:
    d = s.get(Dispute, dispute_id)
    if not d:
        raise HTTPException(404, "Dispute not found")
    return d


# ---------------------------------------------------------------------------
# Health / settings
# ---------------------------------------------------------------------------
@app.get("/api/health")
def health():
    return {
        "ok": True,
        "paypal_mode": settings.paypal_mode,
        "paypal_sources": enabled_sources(),
        "sandbox_actions_locked": bool(settings.sandbox_actions_key),
        "sample_scenarios": sample_gen.SCENARIOS,
        "paypal_disputes_path": settings.paypal_disputes_path,
        "gemini": settings.gemini_enabled,
        "gemini_model": settings.gemini_model if settings.gemini_enabled else None,
        "render_workflows": settings.workflows_enabled,
        "ocr": extract_mod.TESSERACT_AVAILABLE,
        "database": engine.dialect.name,
        "playbooks": [{"reason": p["reason"], "label": p["label"], "status": p["status"]} for p in PLAYBOOKS.values()],
    }


class MerchantIn(BaseModel):
    business_name: str
    business_address: str
    support_email: str
    website: str
    support_name: str = ""


@app.get("/api/settings/merchant")
def get_merchant_settings():
    with SessionLocal() as s:
        m = get_merchant(s)
        return {k: getattr(m, k) for k in MerchantIn.model_fields}


@app.put("/api/settings/merchant")
def put_merchant_settings(body: MerchantIn):
    with SessionLocal() as s:
        m = get_merchant(s)
        for k, v in body.model_dump().items():
            setattr(m, k, v)
        s.commit()
        return body


# ---------------------------------------------------------------------------
# Disputes
# ---------------------------------------------------------------------------
@app.get("/api/disputes")
def list_disputes():
    with SessionLocal() as s:
        rows = s.query(Dispute).order_by(Dispute.deadline.desc()).all()
        return [dispute_row(d) for d in rows]


@app.post("/api/disputes/sync")
def sync_disputes():
    with SessionLocal() as s:
        results = sync.sync_sources(s, enabled_sources())
        errors = {k: v["error"] for k, v in results.items() if "error" in v}
        if errors and len(errors) == len(results):
            raise HTTPException(502, "PayPal error: " + "; ".join(f"{k}: {v}" for k, v in errors.items()))
        return {
            "listed": sum(v.get("listed", 0) for v in results.values()),
            "new": sum(v.get("new", 0) for v in results.values()),
            "mode": "+".join(results),
            "sources": results,
        }


@app.get("/api/disputes/{dispute_id}")
def get_dispute(dispute_id: str):
    with SessionLocal() as s:
        d = _get(s, dispute_id)
        logs = s.query(AuditLog).filter_by(dispute_id=dispute_id).order_by(AuditLog.id).all()
        return {
            **dispute_row(d),
            "buyer_email": d.buyer_email,
            "buyer_message": d.buyer_message,
            "messages": d.messages,
            "shipping_address": d.shipping_address,
            "order_id": d.order_id,
            "transaction_id": d.transaction_id,
            "analysis_engine": d.analysis_engine,
            "analysis_run_id": d.analysis_run_id,
            "analysis_error": d.analysis_error,
            "evidence": [evidence_json(e) for e in d.evidence],
            "analysis": analysis_json(latest_analysis(d)),
            "audit": [{"action": l.action, "detail": l.detail, "at": l.created_at.isoformat() + "Z"} for l in logs],
            "playbook": get_playbook(d.reason),
        }


# ---------------------------------------------------------------------------
# Evidence
# ---------------------------------------------------------------------------
def _extract_async(ids: list[int]) -> None:
    if settings.workflows_enabled:
        return  # the Render Workflow extracts files in parallel when analysis starts
    if not ids:
        return
    for group in plan_groups(ids):
        threading.Thread(target=extract_group, args=(group,), daemon=True).start()


def _add_evidence(s, d: Dispute, filename: str, data: bytes, mime: str, tag: str) -> Evidence:
    if d.status != "WAITING_FOR_SELLER_RESPONSE":
        raise HTTPException(409, "This dispute is closed on PayPal (under review or resolved), "
                                 "so no new evidence can be added")
    if mime not in ALLOWED_MIME and mime != "text/csv":
        raise HTTPException(415, f"{filename}: only PDF, PNG and JPG files are accepted")
    if len(data) > settings.max_file_mb * 1024 * 1024:
        raise HTTPException(413, f"{filename}: larger than {settings.max_file_mb} MB")
    if len(d.evidence) >= settings.max_files_per_dispute:
        raise HTTPException(409, f"A dispute can have at most {settings.max_files_per_dispute} files")
    # Re-check the real file type from magic bytes, not just the browser's claim.
    sniff = {b"%PDF": "application/pdf", b"\x89PNG": "image/png", b"\xff\xd8\xff": "image/jpeg"}
    real = next((m for sig, m in sniff.items() if data.startswith(sig)), None)
    if mime != "text/csv" and real != mime:
        raise HTTPException(415, f"{filename}: file content does not match its type")
    ev = Evidence(dispute_id=d.id, filename=filename, mime=mime, size=len(data), data=data,
                  tag=tag if tag in TAGS else "Other")
    s.add(ev)
    s.flush()
    audit(s, d.id, "evidence_added", filename=filename, tag=ev.tag, size=len(data))
    return ev


@app.post("/api/disputes/{dispute_id}/evidence")
async def upload_evidence(dispute_id: str, files: list[UploadFile] = File(...), tags: list[str] = Form(default=[])):
    with SessionLocal() as s:
        d = _get(s, dispute_id)
        created = []
        for i, f in enumerate(files):
            data = await f.read()
            mime = f.content_type or ""
            if mime == "image/jpg":
                mime = "image/jpeg"
            if mime not in ALLOWED_MIME:
                raise HTTPException(415, f"{f.filename}: only PDF, PNG and JPG files are accepted")
            created.append(_add_evidence(s, d, f.filename or f"file{i}", data, mime, tags[i] if i < len(tags) else "Other"))
        s.commit()
        ids = [e.id for e in created]
    _extract_async(ids)
    return {"added": ids}


class SampleIn(BaseModel):
    scenario: str | None = None  # strong | weak | buyer_right: files drawn for this dispute


@app.post("/api/disputes/{dispute_id}/evidence/sample")
def load_sample_evidence(dispute_id: str, body: SampleIn | None = None):
    scenario = body.scenario if body else None
    if scenario:
        # Files drawn on the fly with this dispute's own buyer, address, order and dates.
        if scenario not in sample_gen.SCENARIOS:
            raise HTTPException(422, f"scenario must be one of {list(sample_gen.SCENARIOS)}")
        with SessionLocal() as s:
            d = _get(s, dispute_id)
            if d.evidence:
                raise HTTPException(409, "This dispute already has evidence. Remove those files first "
                                         "(bin icon), then load a sample, so the evidence doesn't mix.")
            ids = [_add_evidence(s, d, name, data, mime, tag).id
                   for name, data, mime, tag in sample_gen.generate(d, get_merchant(s), scenario)]
            audit(s, d.id, "sample_generated", scenario=scenario, files=len(ids))
            s.commit()
        _extract_async(ids)
        return {"added": ids, "scenario": scenario}
    with SessionLocal() as s:
        d = _get(s, dispute_id)
        sample_set = d.sample_set
    if sample_set == "starter":
        # The "no evidence yet" case: its sample is the merchant's order export.
        with SessionLocal() as s:
            if any(e.filename.startswith("order-") for e in _get(s, dispute_id).evidence):
                return {"added": []}
        return _import_order_rows(dispute_id, (SAMPLE_DIR / "orders_export.csv").read_text())
    with SessionLocal() as s:
        d = _get(s, dispute_id)
        files = SAMPLE_SETS.get(d.sample_set)
        if not files:
            raise HTTPException(400, "Choose a sample scenario for this dispute")
        existing = {e.filename for e in d.evidence}
        ids = []
        for name, tag in files:
            if name in existing:
                continue
            path = SAMPLE_DIR / d.sample_set / name
            mime = "application/pdf" if name.endswith(".pdf") else "image/png" if name.endswith(".png") else "image/jpeg"
            ids.append(_add_evidence(s, d, name, path.read_bytes(), mime, tag).id)
        s.commit()
    _extract_async(ids)
    return {"added": ids}


class EvidencePatch(BaseModel):
    tag: str | None = None
    facts: list[dict] | None = None


@app.patch("/api/evidence/{evidence_id}")
def patch_evidence(evidence_id: int, body: EvidencePatch):
    rerun = False
    with SessionLocal() as s:
        ev = s.get(Evidence, evidence_id)
        if not ev:
            raise HTTPException(404, "Evidence not found")
        if body.tag and body.tag != ev.tag:
            if body.tag not in TAGS:
                raise HTTPException(422, f"tag must be one of {TAGS}")
            ev.tag = body.tag
            ev.state = "pending"
            rerun = True
            audit(s, ev.dispute_id, "evidence_retagged", filename=ev.filename, tag=body.tag)
        if body.facts is not None:
            ev.facts = body.facts
            audit(s, ev.dispute_id, "facts_reviewed", filename=ev.filename,
                  confirmed=sum(1 for f in body.facts if f.get("confirmed")))
        s.commit()
    if rerun:
        _extract_async([evidence_id])
    return {"ok": True}


@app.delete("/api/evidence/{evidence_id}")
def delete_evidence(evidence_id: int):
    with SessionLocal() as s:
        ev = s.get(Evidence, evidence_id)
        if not ev:
            raise HTTPException(404, "Evidence not found")
        audit(s, ev.dispute_id, "evidence_removed", filename=ev.filename)
        s.delete(ev)
        s.commit()
    return {"ok": True}


@app.get("/api/evidence/{evidence_id}/file")
def evidence_file(evidence_id: int):
    with SessionLocal() as s:
        ev = s.get(Evidence, evidence_id)
        if not ev:
            raise HTTPException(404, "Evidence not found")
        return Response(ev.data, media_type=ev.mime,
                        headers={"Content-Disposition": f'inline; filename="{ev.filename}"'})


CARRIER_LINKS = {
    "UPS": "https://www.ups.com/track?tracknum={}",
    "FEDEX": "https://www.fedex.com/fedextrack/?trknbr={}",
    "USPS": "https://tools.usps.com/go/TrackConfirmAction?tLabels={}",
    "DHL": "https://www.dhl.com/global-en/home/tracking.html?tracking-id={}",
}


@app.post("/api/disputes/{dispute_id}/order-csv")
async def import_order_csv(dispute_id: str, file: UploadFile = File(...)):
    """Order CSV import (Shopify/WooCommerce export): finds this dispute's order row."""
    raw = (await file.read()).decode("utf-8-sig", errors="replace")
    return _import_order_rows(dispute_id, raw)


def _import_order_rows(dispute_id: str, raw: str) -> dict:
    rows = list(csv.DictReader(io.StringIO(raw)))
    with SessionLocal() as s:
        d = _get(s, dispute_id)
        norm = lambda v: re.sub(r"[^a-z0-9]", "", str(v).lower())  # noqa: E731
        keys = {norm(d.order_id), norm(d.transaction_id), norm(d.buyer_email)} - {""}
        match = next((r for r in rows if keys & {norm(v) for v in r.values()}), None)
        if not match:
            raise HTTPException(404, f"No row matched order {d.order_id} or the buyer's email in {len(rows)} rows")
        lines = [f"{k}: {v}" for k, v in match.items() if v]
        carrier = next((c for c in CARRIER_LINKS if any(c in str(v).upper() for v in match.values())), None)
        tracking = next((v for k, v in match.items() if "tracking" in k.lower() and v), "")
        if tracking:
            lines.append(f"Tracking number: {tracking}")
            if carrier:
                lines.append(f"Carrier tracking link: {CARRIER_LINKS[carrier].format(tracking)}")
        ev = _add_evidence(s, d, f"order-{d.order_id or 'row'}.csv", "\n".join(lines).encode(), "text/csv", "Order")
        s.commit()
        eid = ev.id
    _extract_async([eid])
    return {"added": [eid], "matched": match}


# ---------------------------------------------------------------------------
# Analysis, report, submission
# ---------------------------------------------------------------------------
@app.post("/api/disputes/{dispute_id}/analyse")
async def analyse(dispute_id: str):
    with SessionLocal() as s:
        d = _get(s, dispute_id)
        if d.analysis_state in ("queued", "running"):
            return {"engine": d.analysis_engine, "state": d.analysis_state}
    return await runner.start_analysis(dispute_id)


class ReportIn(BaseModel):
    text: str


@app.put("/api/disputes/{dispute_id}/report")
def save_report(dispute_id: str, body: ReportIn):
    with SessionLocal() as s:
        d = _get(s, dispute_id)
        a = latest_analysis(d)
        if not a:
            raise HTTPException(409, "Run the analysis first")
        a.report_final = body.text
        audit(s, dispute_id, "report_edited", chars=len(body.text), changed=body.text != a.report_text)
        s.commit()
    return {"ok": True}


class SubmitIn(BaseModel):
    approved: bool
    text: str | None = None


def _carrier(analysis: Analysis) -> str:
    blob = " ".join(f.get("fact", "") for f in analysis.facts or []).upper()
    for c in ("UPS", "FEDEX", "USPS", "DHL"):
        if c in blob:
            return c
    return "OTHER"


def _client_for(d: Dispute, actions_key: str | None):
    """The PayPal client for this dispute's own source, with the optional Sandbox lock."""
    if d.source == "sandbox" and settings.sandbox_actions_key and actions_key != settings.sandbox_actions_key:
        raise HTTPException(403, "This is a real PayPal Sandbox dispute: enter the Sandbox action key to continue")
    try:
        return get_client(d.source or "mock")
    except PayPalError as e:
        raise HTTPException(409, str(e))


@app.post("/api/disputes/{dispute_id}/submit")
def submit(dispute_id: str, body: SubmitIn, request: Request):
    if not body.approved:
        raise HTTPException(400, "The merchant must review and approve the report before it is sent")
    with SessionLocal() as s:
        d = _get(s, dispute_id)
        client = _client_for(d, request.headers.get("x-sandbox-key"))
        a = latest_analysis(d)
        if not a or not a.results:
            raise HTTPException(409, "Run the analysis first")
        if body.text is not None:
            a.report_final = body.text
        playbook = get_playbook(d.reason)
        carrier = _carrier(a)
        info = {}
        tracking = (a.integrity or {}).get("tracking_numbers") or []
        if tracking:
            t = {"carrier_name": carrier, "tracking_number": tracking[0]}
            if carrier == "OTHER":
                t["carrier_name_other"] = "Courier"
            info["tracking_info"] = [t]
        evidences = [{"evidence_type": playbook["paypal_evidence_type"], "evidence_info": info,
                      "notes": a.report_final[:2000]}]
        files = [(e.filename, e.data, e.mime) for e in d.evidence if e.mime in ALLOWED_MIME]
        try:
            resp = client.provide_evidence(d.id, evidences, files)
        except PayPalError as e:
            audit(s, d.id, "submit_failed", status=e.status, body=str(e.body)[:500])
            s.commit()
            raise HTTPException(502 if e.body is not None else (e.status or 502),
                                f"PayPal rejected the submission ({e.status}): {e.body}" if e.body is not None else str(e))
        d.decision = "submitted"
        d.status = "UNDER_REVIEW"
        audit(s, d.id, "submitted_to_paypal", mode=client.mode, files=len(files),
              ai_draft=a.report_text, final=a.report_final, edited=a.report_text != a.report_final,
              request={"evidences": evidences}, response=resp)
        s.commit()
        return {"ok": True, "mode": client.mode, "response": resp}


class AcceptIn(BaseModel):
    note: str = ""


@app.post("/api/disputes/{dispute_id}/accept-claim")
def accept_claim(dispute_id: str, body: AcceptIn, request: Request):
    with SessionLocal() as s:
        d = _get(s, dispute_id)
        client = _client_for(d, request.headers.get("x-sandbox-key"))
        note = body.note or "We reviewed the carrier records and agree the item did not reach you. Refunding in full."
        try:
            resp = client.accept_claim(d.id, note, get_playbook(d.reason)["accept_claim_reason"])
        except PayPalError as e:
            raise HTTPException(502 if e.body is not None else (e.status or 502),
                                f"PayPal rejected accept-claim ({e.status}): {e.body}" if e.body is not None else str(e))
        d.decision = "refunded"
        d.status = "RESOLVED"
        d.outcome = "lost"
        audit(s, d.id, "accepted_claim", mode=client.mode, note=note, response=resp)
        s.commit()
        return {"ok": True, "mode": client.mode, "response": resp}


@app.get("/api/disputes/{dispute_id}/report.pdf")
def report_pdf(dispute_id: str):
    with SessionLocal() as s:
        d = _get(s, dispute_id)
        a = latest_analysis(d)
        if not a or not a.results:
            raise HTTPException(409, "Run the analysis first")
        pdf = build_pdf(d, a, get_merchant(s))
        return Response(pdf, media_type="application/pdf",
                        headers={"Content-Disposition": f'attachment; filename="ClaimCheck-{d.id}.pdf"'})


# ---------------------------------------------------------------------------
# Webhooks: the "agent" path
# ---------------------------------------------------------------------------
async def handle_webhook_event(event: dict, source: str | None = None) -> dict:
    etype = event.get("event_type", "")
    resource = event.get("resource") or {}
    dispute_id = resource.get("dispute_id")
    if not dispute_id:
        return {"ignored": etype}
    client = get_client(source)
    with SessionLocal() as s:
        detail = client.get_dispute(dispute_id)
        d, created = sync.upsert_dispute(s, client, detail)
        audit(s, d.id, "webhook", event_type=etype)
        s.commit()
    result = {"event_type": etype, "dispute_id": dispute_id, "created": created}
    if etype == "CUSTOMER.DISPUTE.CREATED":
        # Agent behaviour: draft immediately, no clicks needed.
        result["analysis"] = await runner.start_analysis(dispute_id, trigger="webhook")
    return result


@app.post("/api/webhooks/paypal")
async def paypal_webhook(request: Request):
    raw = await request.body()
    try:
        event = json.loads(raw)
    except ValueError:
        raise HTTPException(400, "Webhook body is not valid JSON")
    if not isinstance(event, dict):
        raise HTTPException(400, "Webhook body must be a JSON object")
    # Real PayPal webhooks come from the Sandbox when it is enabled.
    source = "sandbox" if "sandbox" in enabled_sources() else enabled_sources()[0]
    client = get_client(source)
    try:
        ok = client.verify_webhook(dict(request.headers), raw)
    except PayPalError as e:
        raise HTTPException(400, f"Webhook verification error: {e}")
    if not ok:
        raise HTTPException(400, "Webhook signature verification failed")
    return await handle_webhook_event(event, source)


@app.post("/api/demo/simulate-dispute")
async def simulate_dispute():
    if "mock" not in enabled_sources():
        raise HTTPException(400, "Only available with demo data; in sandbox, open a real dispute as the buyer")
    client = get_client("mock")
    detail = mock_data.simulated_new_dispute()
    client.add(detail)
    event = {"event_type": "CUSTOMER.DISPUTE.CREATED", "resource": {"dispute_id": detail["dispute_id"]},
             "summary": "A new dispute was opened (simulated)"}
    return await handle_webhook_event(event, "mock")


@app.post("/api/demo/reset")
def reset_demo():
    """Reset the demo data. PayPal Sandbox disputes (and their evidence) are kept."""
    if "mock" not in enabled_sources():
        raise HTTPException(400, "Only available with demo data")
    reset_mock_client()
    if enabled_sources() == ["mock"]:
        Base.metadata.drop_all(engine)
        init_db()
    else:
        with SessionLocal() as s:
            ids = [d.id for d in s.query(Dispute).filter(Dispute.source != "sandbox")]
            for d in s.query(Dispute).filter(Dispute.id.in_(ids)):
                s.delete(d)  # cascades to evidence and analyses
            s.query(AuditLog).filter(AuditLog.dispute_id.in_(ids)).delete(synchronize_session=False)
            s.commit()
    with SessionLocal() as s:
        return sync.sync_all(s, get_client("mock"))


# ---------------------------------------------------------------------------
# Analytics (feeds AG Studio) and AI chat
# ---------------------------------------------------------------------------
@app.get("/api/analytics")
def analytics():
    with SessionLocal() as s:
        rows = []
        for d in s.query(Dispute).all():
            r = dispute_row(d)
            created = d.created_at or datetime.utcnow()
            rows.append({
                "dispute_id": d.id,
                "source": "PayPal Sandbox" if d.source == "sandbox" else "Demo data",
                "buyer": d.buyer_name,
                "item": d.item_title,
                "amount": d.amount,
                "status": "Open" if d.status == "WAITING_FOR_SELLER_RESPONSE" else
                          "Resolved" if d.status == "RESOLVED" else "Under review",
                "decision": {"open": "Pending", "submitted": "Fight", "refunded": "Refund"}.get(d.decision, d.decision),
                "outcome": {"won": "Won", "lost": "Lost"}.get(d.outcome, "Pending"),
                "score": r["score"],
                "strength": r["label"] or "Not analysed",
                "days_left": r["days_left"] if d.status == "WAITING_FOR_SELLER_RESPONSE" else None,
                "due_date": d.deadline.date().isoformat() if d.deadline else None,
                "opened_date": created.date().isoformat(),
                "money_at_risk": d.amount if d.status != "RESOLVED" else 0,
                "response_minutes": d.response_minutes,
            })
        return {"rows": rows}


@app.post("/api/ai/studio-turn")
def ai_studio_turn(req: dict):
    return llm.studio_turn(req)


# ---------------------------------------------------------------------------
# Static: sample evidence + the built frontend (single-URL deploy)
# ---------------------------------------------------------------------------
app.mount("/samples", StaticFiles(directory=SAMPLE_DIR), name="samples")

STATIC_DIR = Path(BACKEND_DIR / "static")
if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        target = STATIC_DIR / path
        if path and target.is_file():
            return FileResponse(target)
        return FileResponse(STATIC_DIR / "index.html")
