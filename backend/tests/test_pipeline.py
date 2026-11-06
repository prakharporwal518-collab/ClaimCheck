import json

from app.paypal import mock_data
from app.paypal.client import normalise_dispute
from app.pipeline import analyse, scoring

from .conftest import wait_for_analysis


def test_parser_reads_paypal_shape():
    detail = next(d for d in mock_data.build_fixtures() if d["dispute_id"] == "PP-D-48213")
    n = normalise_dispute(detail)
    assert n["id"] == "PP-D-48213"
    assert n["reason"] == "MERCHANDISE_OR_SERVICE_NOT_RECEIVED"
    assert n["amount"] == 249.0 and n["currency"] == "USD"
    assert n["buyer_name"] == "Rohan Sharma"
    assert "never received" in n["buyer_message"]
    assert n["deadline"] is not None


def test_scoring_formula_matches_prd():
    results = [
        {"claim_id": "c1", "status": "contradicted", "strength": "strong", "evidence": ["e1"]},
        {"claim_id": "c2", "status": "contradicted", "strength": "strong", "evidence": ["e2"]},
    ]
    gaps = [{"label": "x", "critical": True, "missing": False}]
    s = scoring.score(results, gaps)
    assert s["score"] == 8 and s["label"] == "High"
    assert s["line"] == "High (Score: 8/10) – 2 claims contradicted by strong evidence, 0 critical gaps"


def test_guardrail_downgrades_uncited_contradiction():
    results = [{"claim_id": "c1", "status": "contradicted", "evidence": ["e99"], "why": "made up"}]
    notes = analyse.apply_guardrails(results, [{"id": "e1", "kind": "order"}], {"strong_evidence_kinds": []})
    assert results[0]["status"] == "unverified"
    assert notes


def _run(client, dispute_id, sample=True):
    if sample:
        assert client.post(f"/api/disputes/{dispute_id}/evidence/sample").status_code == 200
    assert client.post(f"/api/disputes/{dispute_id}/analyse").status_code == 200
    d = wait_for_analysis(client, dispute_id)
    assert d["analysis_state"] == "done", d["analysis_error"]
    return d["analysis"]


def test_strong_case_merchant_wins(client):
    a = _run(client, "PP-D-48213")
    assert a["strength_label"] == "High"
    statuses = {r["claim_text"]: r["status"] for r in a["results"]}
    assert statuses["I never received the headphones I ordered"] == "contradicted"
    assert all(r["evidence"] for r in a["results"] if r["status"] == "contradicted")
    assert not [g for g in a["gaps"] if g["missing"] and g["critical"]]
    assert "Rohan Sharma" in a["report_text"]  # unmasked for the merchant


def test_weak_case_flags_missing_signature(client):
    a = _run(client, "PP-D-48377")
    assert a["strength_label"] == "Medium"
    missing = {g["id"] for g in a["gaps"] if g["missing"]}
    assert "signature_or_photo" in missing


def test_buyer_is_right_recommends_refund(client):
    a = _run(client, "PP-D-48402")
    assert any(r["status"] == "supported" for r in a["results"])
    assert a["recommendation"]["action"] == "refund"
    assert "refund" in a["report_text"].lower()


def test_llm_path_never_sends_buyer_pii(client, monkeypatch):
    """Fake Gemini: every outgoing prompt is logged and scanned for the test buyer's PII."""
    from app.config import settings
    from app.db import PromptLog, SessionLocal
    from app.pipeline import llm

    def fake_call(model, body):
        prompt = body["contents"][0]["parts"][0]["text"]
        if "evidence_text" in prompt:
            out = {"facts": [{"kind": "carrier_delivered", "fact": "Delivered 3 Nov", "date": "3 Nov",
                              "polarity": "supports_merchant"}]}
        elif "buyer_message" in prompt:
            out = {"claims": [{"text": "Item never arrived", "type": "not_received"}]}
        elif "<claims>" in prompt:
            out = {"results": [{"claim": "c1", "status": "contradicted", "evidence": ["e1"], "why": "Delivered."}]}
        else:
            out = {"summary": "Delivered to [BUYER].", "rebuttal": [{"claim_id": "c1", "text": "See [e1]."}],
                   "closing": "Thanks."}
        return {"candidates": [{"content": {"parts": [{"text": json.dumps(out)}]}}]}

    monkeypatch.setattr(settings, "gemini_api_key", "test-key")
    monkeypatch.setattr(llm, "_call", fake_call)
    client.post("/api/demo/reset")
    a = _run(client, "PP-D-48213")
    assert a["engine"] == settings.gemini_model
    assert "Rohan Sharma" in a["report_text"]  # placeholder restored for the merchant

    with SessionLocal() as s:
        prompts = [p.prompt for p in s.query(PromptLog).filter_by(dispute_id="PP-D-48213")]
    assert prompts
    blob = "\n".join(prompts)
    for pii in ["Rohan", "Sharma", "rohan.sharma@mail.example", "418 Maple Avenue", "732 555 0142"]:
        assert pii not in blob, f"buyer PII leaked: {pii}"
    assert "Voltway Electronics" in blob  # merchant details must still be present
    monkeypatch.setattr(settings, "gemini_api_key", "")
    client.post("/api/demo/reset")
