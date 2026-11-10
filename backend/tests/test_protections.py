"""Public-demo protections: the action key locks Reset demo and merchant settings, and
AI-spending actions are rate limited per visitor."""

import pytest

from app import ratelimit
from app.config import settings


@pytest.fixture
def fresh_limits():
    ratelimit.reset()
    yield
    ratelimit.reset()


def test_reset_and_settings_need_the_action_key(client, monkeypatch):
    monkeypatch.setattr(settings, "sandbox_actions_key", "s3cret")
    merchant = client.get("/api/settings/merchant").json()

    r = client.post("/api/demo/reset")
    assert r.status_code == 403 and "locked" in r.json()["detail"]
    assert client.put("/api/settings/merchant", json=merchant).status_code == 403
    assert client.put("/api/settings/merchant", json=merchant, headers={"X-Sandbox-Key": "wrong"}).status_code == 403

    assert client.put("/api/settings/merchant", json=merchant, headers={"X-Sandbox-Key": "s3cret"}).status_code == 200
    assert client.post("/api/demo/reset", headers={"X-Sandbox-Key": "s3cret"}).status_code == 200


def test_no_key_configured_keeps_them_open(client, monkeypatch):
    monkeypatch.setattr(settings, "sandbox_actions_key", "")
    merchant = client.get("/api/settings/merchant").json()
    assert client.put("/api/settings/merchant", json=merchant).status_code == 200


def test_analyses_are_rate_limited_per_visitor(client, monkeypatch, fresh_limits):
    monkeypatch.setattr(settings, "rate_limit_analyses", 2)
    a = {"X-Forwarded-For": "203.0.113.7"}
    b = {"X-Forwarded-For": "198.51.100.9, 10.0.0.1"}
    for _ in range(2):
        assert client.post("/api/disputes/PP-D-48213/analyse", headers=a).status_code != 429
    r = client.post("/api/disputes/PP-D-48213/analyse", headers=a)
    assert r.status_code == 429 and "Too many AI analyses" in r.json()["detail"]
    # simulating a dispute drafts a defence too, so it shares the analysis allowance
    assert client.post("/api/demo/simulate-dispute", headers=a).status_code == 429
    # another visitor is not affected
    assert client.post("/api/disputes/PP-D-48213/analyse", headers=b).status_code != 429


def test_file_actions_and_assistant_are_rate_limited(client, monkeypatch, fresh_limits):
    monkeypatch.setattr(settings, "rate_limit_files", 1)
    monkeypatch.setattr(settings, "rate_limit_assistant", 1)
    h = {"X-Forwarded-For": "192.0.2.44"}
    client.post("/api/disputes/PP-D-48402/evidence/sample", headers=h)
    r = client.post("/api/disputes/PP-D-48402/evidence/sample", headers=h)
    assert r.status_code == 429 and "evidence uploads" in r.json()["detail"]

    client.post("/api/ai/studio-turn", json={}, headers=h)
    r = client.post("/api/ai/studio-turn", json={}, headers=h)
    assert r.status_code == 429 and "AI assistant" in r.json()["detail"]


def test_zero_turns_a_limit_off(client, monkeypatch, fresh_limits):
    monkeypatch.setattr(settings, "rate_limit_analyses", 0)
    for _ in range(5):
        assert client.post("/api/disputes/PP-D-48213/analyse").status_code != 429
