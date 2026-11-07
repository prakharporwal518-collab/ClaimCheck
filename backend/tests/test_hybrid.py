"""PAYPAL_MODE=hybrid: seeded demo disputes and real PayPal Sandbox disputes in one inbox."""

import copy

import pytest

from app.paypal import client as client_mod
from app.paypal import mock_data
from app.paypal.client import MockClient

from .conftest import wait_for_analysis


class FakeSandbox(MockClient):
    """Stands in for the PayPal Sandbox: same JSON shape, its own disputes, records calls."""

    mode = "sandbox"

    def __init__(self):
        self._store = {}
        self.calls = []
        base = next(d for d in mock_data.build_fixtures() if d["dispute_id"] == "PP-D-48213")
        for case_id, amount in [("PP-R-VLC-10196953", "249.00"), ("PP-R-GQK-10196955", "129.50")]:
            d = copy.deepcopy(base)
            d.update(dispute_id=case_id, dispute_amount={"currency_code": "USD", "value": amount})
            d.pop("x_sample_set", None)
            d["disputed_transactions"][0]["buyer"] = {"name": "John Doe", "email": "sb-buyer@personal.example.com"}
            self._store[case_id] = d

    def provide_evidence(self, dispute_id, evidences, files):
        self.calls.append(("provide-evidence", dispute_id))
        return super().provide_evidence(dispute_id, evidences, files)

    def accept_claim(self, dispute_id, note, reason="LOST_IN_MAIL"):
        self.calls.append(("accept-claim", dispute_id))
        return super().accept_claim(dispute_id, note, reason)


@pytest.fixture
def hybrid(client, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "paypal_mode", "hybrid")
    monkeypatch.setattr(settings, "paypal_client_id", "id")
    monkeypatch.setattr(settings, "paypal_client_secret", "secret")
    fake = FakeSandbox()
    monkeypatch.setitem(client_mod._clients, "sandbox", fake)
    client.post("/api/demo/reset")
    yield fake
    client_mod._clients.pop("sandbox", None)
    monkeypatch.setattr(settings, "paypal_mode", "mock")
    client.post("/api/demo/reset")


def test_hybrid_lists_both_sources(client, hybrid):
    assert client.get("/api/health").json()["paypal_sources"] == ["mock", "sandbox"]
    r = client.post("/api/disputes/sync").json()
    assert set(r["sources"]) == {"mock", "sandbox"}
    rows = {d["id"]: d["source"] for d in client.get("/api/disputes").json()}
    assert rows["PP-D-48213"] == "mock"
    assert rows["PP-R-VLC-10196953"] == "sandbox"


def test_actions_go_to_the_disputes_own_source(client, hybrid):
    client.post("/api/disputes/sync")
    # A Sandbox dispute: evidence goes to the Sandbox client.
    files = [("files", ("tracking.pdf", open("sample_evidence/strong/tracking.pdf", "rb").read(), "application/pdf"))]
    client.post("/api/disputes/PP-R-VLC-10196953/evidence", files=files, data={"tags": "Tracking"})
    client.post("/api/disputes/PP-R-VLC-10196953/analyse")
    wait_for_analysis(client, "PP-R-VLC-10196953")
    assert client.post("/api/disputes/PP-R-VLC-10196953/submit", json={"approved": True}).status_code == 200
    assert client.post("/api/disputes/PP-R-GQK-10196955/accept-claim", json={}).status_code == 200
    assert hybrid.calls == [("provide-evidence", "PP-R-VLC-10196953"), ("accept-claim", "PP-R-GQK-10196955")]
    # A demo dispute never touches the Sandbox.
    assert client.post("/api/disputes/PP-D-48402/accept-claim", json={}).status_code == 200
    assert len(hybrid.calls) == 2


def test_reset_keeps_sandbox_disputes(client, hybrid):
    client.post("/api/disputes/sync")
    client.post("/api/disputes/PP-D-48402/accept-claim", json={})
    client.post("/api/demo/reset")
    rows = {d["id"]: d for d in client.get("/api/disputes").json()}
    assert "PP-R-VLC-10196953" in rows                   # Sandbox dispute kept
    assert rows["PP-D-48402"]["decision"] == "open"      # demo dispute reset


def test_sandbox_actions_key(client, hybrid, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "sandbox_actions_key", "s3cret")
    client.post("/api/disputes/sync")
    assert client.post("/api/disputes/PP-R-GQK-10196955/accept-claim", json={}).status_code == 403
    r = client.post("/api/disputes/PP-R-GQK-10196955/accept-claim", json={}, headers={"x-sandbox-key": "s3cret"})
    assert r.status_code == 200
    # Demo disputes are never locked.
    assert client.post("/api/disputes/PP-D-48402/accept-claim", json={}).status_code == 200


def test_simulated_webhook_still_uses_demo_data(client, hybrid):
    r = client.post("/api/demo/simulate-dispute").json()
    assert r["created"]
    row = next(d for d in client.get("/api/disputes").json() if d["id"] == r["dispute_id"])
    assert row["source"] == "mock"


def test_paypal_statuses_set_the_decision(client, hybrid):
    # Like the live data: one dispute waiting for the buyer after evidence, one resolved for the buyer.
    hybrid._store["PP-R-VLC-10196953"]["status"] = "WAITING_FOR_BUYER_RESPONSE"
    hybrid._store["PP-R-GQK-10196955"]["status"] = "RESOLVED"
    hybrid._store["PP-R-GQK-10196955"]["dispute_outcome"] = {"outcome_code": "RESOLVED_BUYER_FAVOUR"}
    client.post("/api/disputes/sync")
    rows = {d["id"]: d for d in client.get("/api/disputes").json()}
    assert rows["PP-R-VLC-10196953"]["decision"] == "submitted"
    assert rows["PP-R-GQK-10196955"]["decision"] == "refunded"
    assert rows["PP-R-GQK-10196955"]["outcome"] == "lost"
    a = {r["dispute_id"]: r for r in client.get("/api/analytics").json()["rows"]}
    assert a["PP-R-VLC-10196953"]["status"] == "Under review"
    # A wrong earlier decision is corrected on the next sync (ClaimCheck has no record of acting)
    from app.db import Dispute, SessionLocal

    with SessionLocal() as s:
        s.get(Dispute, "PP-R-GQK-10196955").decision = "submitted"
        s.commit()
    client.post("/api/disputes/sync")
    assert client.get("/api/disputes/PP-R-GQK-10196955").json()["decision"] == "refunded"
