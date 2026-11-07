"""Starts an analysis as a Render Workflow run, with the in-process pipeline as a safety net.

Render Workflows (beta) is used when USE_RENDER_WORKFLOWS=true and RENDER_API_KEY is set.
The web service and the Workflow workers must share one database (DATABASE_URL), because
the workers run on separate machines.

Safety net, so the demo never gets stuck on "Drafting...":
  1. If the Workflow run can't be started, the analysis runs in-process at once.
  2. If it was started but no worker has picked it up within WORKFLOW_START_TIMEOUT
     seconds, the in-process pipeline takes over.
claim_run() makes sure only one of them ever runs a given analysis.
"""

from __future__ import annotations

import logging
import threading
import time

from .config import settings
from .db import Dispute, SessionLocal, audit
from .pipeline.analyse import claim_run, run_analysis

log = logging.getLogger("claimcheck.runner")
IN_PROCESS = "in-process"


def _set_engine(dispute_id: str, engine: str, run_id: str = "", note: str = "") -> None:
    with SessionLocal() as s:
        d = s.get(Dispute, dispute_id)
        d.analysis_engine = engine
        d.analysis_run_id = run_id
        if note:
            d.analysis_error = note
        s.commit()


def _run_in_process(dispute_id: str, engine: str) -> None:
    if not claim_run(dispute_id, engine):
        return  # someone else already took it
    try:
        run_analysis(dispute_id, claimed=True)
    except Exception:
        log.exception("analysis failed for %s", dispute_id)


def _watchdog(dispute_id: str, run_id: str) -> None:
    """Fall back to in-process if no Workflow worker picks the run up in time."""
    deadline = time.time() + settings.workflow_start_timeout
    while time.time() < deadline:
        time.sleep(2)
        with SessionLocal() as s:
            d = s.get(Dispute, dispute_id)
            if d is None or d.analysis_state != "queued" or d.analysis_engine != "render-workflows":
                return  # a worker started it (or it was re-run)
    fallback = f"{IN_PROCESS} (Render Workflow run {run_id} did not start within {settings.workflow_start_timeout}s)"
    from sqlalchemy import update

    with SessionLocal() as s:  # take it over atomically, only if still waiting
        res = s.execute(
            update(Dispute)
            .where(Dispute.id == dispute_id, Dispute.analysis_state == "queued",
                   Dispute.analysis_engine == "render-workflows", Dispute.analysis_run_id == run_id)
            .values(analysis_engine=fallback)
        )
        audit(s, dispute_id, "workflow_fallback", run_id=run_id, timeout=settings.workflow_start_timeout)
        s.commit()
    if res.rowcount == 1:
        log.warning("Render Workflow run %s for %s did not start; running in-process", run_id, dispute_id)
        _run_in_process(dispute_id, fallback)


async def start_analysis(dispute_id: str, trigger: str = "manual") -> dict:
    with SessionLocal() as s:
        d = s.get(Dispute, dispute_id)
        d.analysis_state = "queued"
        d.analysis_error = ""
        s.commit()

    engine, run_id, note = IN_PROCESS, "", ""
    if settings.workflows_enabled:
        # Set the engine first, so a fast worker can claim the run as soon as it starts.
        _set_engine(dispute_id, "render-workflows")
        try:
            from render import RenderAsync

            client = RenderAsync(token=settings.render_api_key)
            task_run = await client.workflows.start_task(
                f"{settings.render_workflow_slug}/analyse_dispute", [dispute_id]
            )
            engine, run_id = "render-workflows", task_run.id
        except Exception as e:  # safety net 1: could not start the run
            log.warning("Render Workflows start failed, running in-process: %s", e)
            engine = f"{IN_PROCESS} (Render Workflows unavailable: {str(e)[:120]})"

    _set_engine(dispute_id, engine, run_id)
    if engine == "render-workflows":
        threading.Thread(target=_watchdog, args=(dispute_id, run_id), daemon=True).start()  # safety net 2
    else:
        threading.Thread(target=_run_in_process, args=(dispute_id, engine), daemon=True).start()

    with SessionLocal() as s:
        audit(s, dispute_id, "analysis_started", engine=engine, run_id=run_id, trigger=trigger)
        s.commit()
    return {"engine": engine, "run_id": run_id, "note": note}
