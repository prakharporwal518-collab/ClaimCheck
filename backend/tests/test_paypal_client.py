"""SandboxClient request shapes, checked against PayPal's Disputes v1 and Webhooks v1 specs
(review done with APIMatic ContextMatic). No network: httpx.MockTransport stands in for PayPal."""

import json

import httpx
import pytest

from app.config import settings
from app.paypal.client import PayPalError, SandboxClient, check_evidence_files, pick_accept_claim_type

DISPUTE = {
    "dispute_id": "PP-R-TEST-1",
    "status": "WAITING_FOR_SELLER_RESPONSE",
    "links": [
        {"rel": "self", "href": "https://api-m.sandbox.paypal.com/v1/customer/disputes/PP-R-TEST-1"},
        {"rel": "provide_evidence", "href": "https://api-m.sandbox.paypal.com/v1/customer/disputes/PP-R-TEST-1/provide-evidence"},
        {"rel": "accept_claim", "href": "https://api-m.sandbox.paypal.com/v1/customer/disputes/PP-R-TEST-1/accept-claim"},
    ],
    "allowed_response_options": {"accept_claim": {"accept_claim_types": ["REFUND", "REFUND_WITH_RETURN"]}},
}


@pytest.fixture
def paypal(monkeypatch):
    monkeypatch.setattr(settings, "paypal_client_id", "id")
    monkeypatch.setattr(settings, "paypal_client_secret", "secret")
    monkeypatch.setattr(settings, "paypal_webhook_id", "WH-1")
    seen: list[httpx.Request] = []
    state = {"dispute": json.loads(json.dumps(DISPUTE))}

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        path = req.url.path
        if path == "/v1/oauth2/token":
            return httpx.Response(200, json={"access_token": "tok", "expires_in": 3600})
        if req.method == "GET":
            return httpx.Response(200, json=state["dispute"])
        if path.endswith("/verify-webhook-signature"):
            return httpx.Response(200, json={"verification_status": "SUCCESS"})
        return httpx.Response(200, json={"links": []})

    c = SandboxClient()
    c._http = httpx.Client(transport=httpx.MockTransport(handler))
    c.seen, c.state = seen, state
    return c


def _posts(c):
    return [r for r in c.seen if r.method == "POST" and r.url.path != "/v1/oauth2/token"]


def test_provide_evidence_multipart_shape(paypal):
    paypal.provide_evidence("PP-R-TEST-1", [{"evidence_type": "PROOF_OF_FULFILLMENT", "notes": "x"}],
                            [("receipt.pdf", b"%PDF-1.4 test", "application/pdf")])
    req = _posts(paypal)[0]
    body = req.read().decode("latin-1")
    assert req.url.path.endswith("/provide-evidence")
    assert 'name="input"\r\nContent-Type: application/json' in body   # form field, no filename
    assert 'name="input"; filename' not in body
    assert 'name="evidence-file"; filename="receipt.pdf"' in body


def test_provide_evidence_refused_without_link(paypal):
    paypal.state["dispute"]["links"] = [paypal.state["dispute"]["links"][0]]   # only "self"
    with pytest.raises(PayPalError) as e:
        paypal.provide_evidence("PP-R-TEST-1", [], [])
    assert e.value.status == 409 and not _posts(paypal)


def test_evidence_file_limits():
    check_evidence_files([("a.gif", b"GIF89a", "image/gif")])
    with pytest.raises(PayPalError):
        check_evidence_files([("a.docx", b"x", "application/msword")])
    with pytest.raises(PayPalError):
        check_evidence_files([("big.pdf", b"0" * (10 * 1024 * 1024 + 1), "application/pdf")])
    with pytest.raises(PayPalError):
        check_evidence_files([(f"{i}.pdf", b"0" * (9 * 1024 * 1024), "application/pdf") for i in range(6)])


def test_accept_claim_type_comes_from_allowed_options(paypal):
    paypal.accept_claim("PP-R-TEST-1", "Refunding", "LOST_IN_MAIL")
    sent = json.loads(_posts(paypal)[0].read())
    assert sent["accept_claim_type"] == "REFUND" and sent["accept_claim_reason"] == "LOST_IN_MAIL"
    assert pick_accept_claim_type({"allowed_response_options": {"accept_claim": {"accept_claim_types": ["REFUND_WITH_RETURN"]}}}) == "REFUND_WITH_RETURN"
    assert pick_accept_claim_type({}) == "REFUND"


SIGNED = {
    "PAYPAL-AUTH-ALGO": "SHA256withRSA",
    "PAYPAL-CERT-URL": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1",
    "PAYPAL-TRANSMISSION-ID": "t-1",
    "PAYPAL-TRANSMISSION-SIG": "sig",
    "PAYPAL-TRANSMISSION-TIME": "2026-11-08T10:00:00Z",
}


def test_webhook_verification_uses_original_bytes(paypal):
    raw = b'{"resource":{"dispute_id":"PP-R-TEST-1"},  "event_type":"CUSTOMER.DISPUTE.CREATED"}'
    assert paypal.verify_webhook(SIGNED, raw) is True
    sent = _posts(paypal)[0].read().decode()
    assert sent.endswith('"webhook_event": ' + raw.decode() + "}")   # byte-for-byte, odd spacing kept
    assert json.loads(sent)["webhook_id"] == "WH-1"


def test_webhook_missing_headers_rejected_without_calling_paypal(paypal):
    headers = dict(SIGNED)
    headers.pop("PAYPAL-TRANSMISSION-SIG")
    assert paypal.verify_webhook(headers, b"{}") is False
    assert not _posts(paypal)


def test_webhook_needs_webhook_id(paypal, monkeypatch):
    monkeypatch.setattr(settings, "paypal_webhook_id", "")
    with pytest.raises(PayPalError):
        paypal.verify_webhook(SIGNED, b"{}")
