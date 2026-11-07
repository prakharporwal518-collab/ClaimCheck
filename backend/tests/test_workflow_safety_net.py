"""Render Workflows safety net: the demo must never get stuck on "Drafting..."."""

import threading
import time
import types

import pytest

from app.pipeline.analyse import claim_run, run_analysis

from .conftest import wait_for_analysis

DISPUTE = "PP-D-48213"


class FakeWorkflows:
    """Stands in for RenderAsync().workflows."""

    def __init__(self, behaviour):
        self.behaviour = behaviour
        self.started = []

    async def start_task(self, slug, args):
        if self.behaviour == "raise":
            raise RuntimeError("401 unauthorized")
        run = types.SimpleNamespace(id=f"trn-{len(self.started) + 1}")
        self.started.append((slug, args, run.id))
        if self.behaviour == "worker":  # a worker picks it up a moment later, like the real Workflow
            threading.Timer(0.3, _workflow_task, args=(args[0],)).start()
        elif self.behaviour == "late_worker":  # picks it up after the fallback already ran
            threading.Timer(2.5, _workflow_task, args=(args[0],)).start()
        return run


def _workflow_task(dispute_id):
    """Same steps as workflows/main.py analyse_dispute (minus the Render SDK)."""
    if claim_run(dispute_id, "render-workflows"):
        run_analysis(dispute_id, extract_parallel=False, claimed=True)


@pytest.fixture
def workflows(monkeypatch, client):
    from app.config import settings

    def use(behaviour, timeout=1):
        fake = FakeWorkflows(behaviour)
        render_mod = types.ModuleType("render")
        render_mod.RenderAsync = lambda token=None: types.SimpleNamespace(workflows=fake)
        monkeypatch.setitem(__import__("sys").modules, "render", render_mod)
        monkeypatch.setattr(settings, "use_render_workflows", True)
        monkeypatch.setattr(settings, "render_api_key", "rnd_test")
        monkeypatch.setattr(settings, "workflow_start_timeout", timeout)
        client.post("/api/demo/reset")
        client.post(f"/api/disputes/{DISPUTE}/evidence/sample")
        return fake

    yield use
    client.post("/api/demo/reset")


def _analyses(dispute_id):
    from app.db import Analysis, SessionLocal

    with SessionLocal() as s:
        return s.query(Analysis).filter_by(dispute_id=dispute_id).count()


def test_workflow_runs_the_analysis(client, workflows):
    fake = workflows("worker", timeout=30)
    r = client.post(f"/api/disputes/{DISPUTE}/analyse").json()
    assert r["engine"] == "render-workflows" and r["run_id"] == "trn-1"
    assert fake.started[0][0].endswith("/analyse_dispute")
    d = wait_for_analysis(client, DISPUTE)
    assert d["analysis_state"] == "done"
    assert d["analysis_engine"] == "render-workflows" and d["analysis_run_id"] == "trn-1"
    assert _analyses(DISPUTE) == 1


def test_falls_back_when_workflow_cannot_start(client, workflows):
    workflows("raise")
    r = client.post(f"/api/disputes/{DISPUTE}/analyse").json()
    assert r["engine"].startswith("in-process (Render Workflows unavailable")
    d = wait_for_analysis(client, DISPUTE)
    assert d["analysis_state"] == "done" and d["analysis"]["strength_label"] == "High"


def test_falls_back_when_no_worker_picks_it_up(client, workflows):
    workflows("never", timeout=1)
    r = client.post(f"/api/disputes/{DISPUTE}/analyse").json()
    assert r["engine"] == "render-workflows"
    d = wait_for_analysis(client, DISPUTE, timeout=30)
    assert d["analysis_state"] == "done"
    assert "did not start within 1s" in d["analysis_engine"]
    assert any(a["action"] == "workflow_fallback" for a in d["audit"])


def test_late_worker_does_not_run_twice(client, workflows):
    workflows("late_worker", timeout=1)
    client.post(f"/api/disputes/{DISPUTE}/analyse")
    wait_for_analysis(client, DISPUTE, timeout=30)
    time.sleep(3)  # let the late worker try
    assert _analyses(DISPUTE) == 1


def test_claim_run_is_exclusive(client):
    from app.db import Dispute, SessionLocal

    client.post("/api/demo/reset")
    with SessionLocal() as s:
        d = s.get(Dispute, DISPUTE)
        d.analysis_state, d.analysis_engine = "queued", "render-workflows"
        s.commit()
    assert claim_run(DISPUTE, "render-workflows") is True
    assert claim_run(DISPUTE, "render-workflows") is False   # already running
    assert claim_run(DISPUTE, "in-process") is False
    client.post("/api/demo/reset")  # don't leave the dispute "running" for later tests
