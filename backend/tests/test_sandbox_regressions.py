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
