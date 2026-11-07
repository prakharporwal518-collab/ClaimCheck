"""Regressions found on the first real PayPal Sandbox run."""

from types import SimpleNamespace

from app.paypal.client import normalise_dispute
from app.pipeline import analyse, integrity, llm


def test_statements_that_help_the_seller_are_not_claims(monkeypatch):
    # Gemini split "Tracking says delivered" into its own claim, marked it "supported" and the
    # merchant lost 3 points (strong case scored Medium 6/10 and was told to refund).
    out = {"claims": [
        {"text": "I never received the headphones.", "type": "not_received", "against_seller": True},
        {"text": "Tracking says delivered", "type": "tracking_wrong", "against_seller": False},
        {"text": "nothing came to my house", "type": "not_delivered_to_address", "against_seller": True},
    ]}
    monkeypatch.setattr(llm, "generate_json", lambda **kw: (out, "fake"))
    claims, _, dropped = analyse.llm_claims("msg", {"claim_types": {"not_received": "x"}}, "PP-R-1")
    assert [c["text"] for c in claims] == ["I never received the headphones.", "nothing came to my house"]
    assert [c["id"] for c in claims] == ["c1", "c2"]
    assert dropped == ["Tracking says delivered"]


def test_no_address_mismatch_when_paypal_gives_no_shipping_address():
    dispute = SimpleNamespace(order_id="INV-10482", amount=249.0, shipping_address={})
    ev = SimpleNamespace(id=1, tag="Tracking", text_masked="Delivered to 418 Maple Avenue, Edison NJ")
    result = integrity.check(dispute, [ev])
    assert result["files"][1]["issues"] == []
    assert not result["address_mismatch"]
    assert any("not checked" in c["text"] for c in result["checks"])


def test_buyer_typed_quotes_are_stripped():
    detail = {"dispute_id": "PP-R-1", "messages": [
        {"posted_by": "BUYER", "content": '"I never received the headphones."'}]}
    assert normalise_dispute(detail)["buyer_message"] == "I never received the headphones."


def test_missing_proof_is_never_counted_as_proof():
    from app.pipeline.extract import proof_is_missing

    assert proof_is_missing({"kind": "signature", "fact": "The tracking details state 'No proof of delivery captured'"})
    assert proof_is_missing({"kind": "signature", "fact": "Signature not required"})
    assert proof_is_missing({"kind": "carrier_delivered", "fact": "Status: Returned to sender"})
    assert proof_is_missing({"kind": "buyer_confirmation", "fact": "Buyer wrote 'parcel nahi mila'"})
    assert not proof_is_missing({"kind": "signature", "fact": "Signed by: [BUYER] at 3 Nov 2026 14:07"})
    assert not proof_is_missing({"kind": "carrier_delivered", "fact": "Delivered, left at front porch"})
    assert not proof_is_missing({"kind": "delivery_photo", "fact": "Photo shows a parcel at door 418"})


def test_weak_case_stays_medium_when_model_mislabels_missing_signature(client, monkeypatch):
    """Live site: Gemini labelled 'No proof of delivery captured' as a signature, so the weak case
    scored High 7/10 with 0 critical gaps instead of Medium with the signature gap."""
    from app.config import settings
    from app.pipeline import llm as llm_mod

    from .conftest import wait_for_analysis

    def fake(*, step, system, prompt, images=None, schema=None, dispute_id=""):
        if step == "extract_batch":
            return {"facts": [
                {"file": 0, "kind": "tracking_number", "fact": "Tracking number SPX4837710442", "date": "", "polarity": "neutral"},
                {"file": 0, "kind": "carrier_delivered", "fact": "Delivered, left at front porch", "date": "21 Oct", "polarity": "supports_merchant"},
                {"file": 0, "kind": "signature", "fact": "The tracking details state 'No proof of delivery captured for this shipment'", "date": "", "polarity": "neutral"},
                {"file": 1, "kind": "order", "fact": "Invoice INV-10511 for USD 89.99", "date": "", "polarity": "neutral"},
            ]}, "fake"
        if step == "claims":
            return {"claims": [{"text": "My package never showed up", "type": "not_received", "against_seller": True}]}, "fake"
        if step == "crosscheck":
            return {"results": [{"claim": "c1", "status": "contradicted", "evidence": ["e2"], "why": "Delivered."}]}, "fake"
        return {"summary": "s", "rebuttal": [], "closing": "c"}, "fake"

    monkeypatch.setattr(settings, "gemini_api_key", "k")
    monkeypatch.setattr(llm_mod, "generate_json", fake)
    client.post("/api/demo/reset")
    client.post("/api/disputes/PP-D-48377/evidence/sample")
    client.post("/api/disputes/PP-D-48377/analyse")
    a = wait_for_analysis(client, "PP-D-48377")["analysis"]
    gaps = {g["id"]: g["missing"] for g in a["gaps"]}
    assert gaps["signature_or_photo"] is True
    assert a["strength_label"] == "Medium"
    monkeypatch.setattr(settings, "gemini_api_key", "")
    client.post("/api/demo/reset")
